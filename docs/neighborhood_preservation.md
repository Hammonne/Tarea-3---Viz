# Neighborhood Preservation, el algoritmo Germain, y por qué Parallel Coordinates necesita otra métrica

DS5343 · Visualización de Datos · UTEC 2026-2 — documentación de proceso para RadViz,
Star Coordinates y Parallel Coordinates (ver `app/static/js/metrics.js`).

Este documento explica, paso a paso y en términos simples, cuatro cosas que se
agregaron al pipeline sobre la base ya existente (README §4):

1. Cómo se mide qué tan bien RadViz y Star Coordinates preservan la
   estructura real de los datos (Neighborhood Preservation).
2. Cómo se usa ese número para *mejorar* los ejes ("algoritmo Germain":
   transponer la matriz de datos + t-SNE).
3. Por qué los anclajes de RadViz sólo giran sobre el círculo, mientras que
   los de Star Coordinates también se estiran (peso).
4. Qué métrica corresponde a Parallel Coordinates —no es la misma— y cómo se
   mejora.

Todo el código vive en `app/static/js/metrics.js` (módulo compartido) y se
usa desde `radviz.js`, `starcoords.js` y `parallel.js`. Es una adaptación
directa de las funciones usadas en el ejercicio de clase *Multidimensional
Visualization Ejercicio* (Observable, prof. Germain Garcia-Zanabria,
`archivos_nn/`), extendida para correr sobre ~4,400 canciones en vez de las
178 filas del dataset de vino del ejercicio original.

---

## 1. ¿Qué es Neighborhood Preservation y por qué importa?

RadViz y Star Coordinates comprimen 9 audio features (valence, energy,
danceability, acousticness, instrumentalness, liveness, speechiness,
loudness, tempo) a un punto en 2D. Cualquier compresión así pierde
información — la pregunta es **cuánta**, y específicamente: *¿las canciones
que eran parecidas en las 9 dimensiones originales siguen apareciendo cerca
en el gráfico 2D?*

Eso es exactamente lo que mide Neighborhood Preservation (NP):

1. Para cada canción, se buscan sus `k` vecinos más cercanos en el espacio
   original de 9 dimensiones (distancia euclidiana sobre las columnas
   `*_norm`, ya en `[0,1]`).
2. Se buscan sus `k` vecinos más cercanos en el espacio proyectado (2D, el
   layout de RadViz o Star Coordinates).
3. Se calcula qué fracción de esos vecinos coinciden en ambos espacios.
4. Se promedia esa fracción sobre todas las canciones → un número entre 0
   (ningún vecino se preserva) y 1 (la proyección preserva perfectamente
   la vecindad local).

```
NP(k) = promedio_i( |vecinos_k(original, i) ∩ vecinos_k(proyectado, i)| / k )
```

Es el mismo algoritmo `kNearestNeighbors` + `neighborhoodPreservation` del
ejercicio de clase (wine dataset), portado línea por línea a
`Metrics.kNN` / `Metrics.npAtK` en `metrics.js`. La única diferencia de
implementación es de **rendimiento**, no de fórmula:

- El ejercicio corre sobre 178 filas → fuerza bruta O(n²) es instantánea.
- Nuestra muestra tiene ~4,400 canciones → O(n²) en el navegador, recalculado
  en cada interacción, sería perceptiblemente lento.
- **Solución:** las métricas NP se calculan sobre una submuestra
  determinística de 1,200 filas (`Metrics.subsampleIndices`, paso fijo, sin
  aleatoriedad — siempre las mismas filas mientras no cambien los filtros),
  igual que ya se hacía para t-SNE en `data_service.py` (`sample_n=1500`).
  La visualización sigue dibujando **todas** las canciones filtradas; sólo
  el cálculo de la métrica usa la submuestra.
- Además, el kNN se calcula **una sola vez hasta k=30** (`Metrics.kNN`) y se
  reutiliza para cualquier k ≤ 30 (`Metrics.npAtK`), en vez de repetir la
  búsqueda de vecinos por cada valor de k en las tablas comparativas.

### Dónde se mide en la app

- **RadViz** (`radviz.js`): un badge "Neighborhood Preservation (k=10)" en
  el panel lateral, recalculado al soltar un anclaje o al activar/desactivar
  una dimensión. El espacio "original" contra el que se compara es
  **siempre las 9 features completas**, sin importar cuántos anclajes estén
  activos — así el número responde la pregunta real: "¿qué tan bien esta
  configuración (posiblemente parcial) representa la estructura completa de
  la canción?", no una pregunta que se auto-infla al apagar dimensiones.
- **Star Coordinates** (`starcoords.js`): un badge idéntico en cada una de
  las dos instancias (Task 1 · popularidad, Task 3 · modo), recalculado al
  soltar un eje — igual que `setTitle` en el ejercicio de clase, que
  recalcula la métrica "al soltar el eje", no en cada frame del arrastre
  (eso sería carísimo).

### Resultado con los ejes por defecto (ejes equiespaciados, sin optimizar)

Medido en vivo sobre la app (Playwright, sin filtros activos, 4,400
canciones, submuestra NP=1,200) y confirmado con una implementación
independiente en Python/scikit-learn (`sklearn.neighbors.NearestNeighbors`,
ver §2):

| k  | RadViz (JS) | RadViz (sklearn) | Star (JS) | Star (sklearn) |
|----|------------:|------------------:|----------:|----------------:|
| 5  | 0.098       | 0.098              | 0.112     | 0.112            |
| 10 | 0.141       | 0.141              | 0.162     | 0.162            |
| 20 | 0.205       | 0.205              | 0.224     | 0.224            |

Las dos implementaciones (JS en el navegador y Python independiente)
coinciden exactamente para los ejes por defecto, lo cual valida que
`Metrics.kNN`/`npAtK` está implementado correctamente. Un NP de ~0.14–0.16 a
k=10 con ejes equiespaciados es bajo pero esperable: 9 dimensiones
comprimidas a 2 con ángulos arbitrarios (no informados por los datos) no
tienen por qué preservar vecindad. Esa es justamente la motivación del
siguiente punto.

---

## 2. El algoritmo Germain: transponer + t-SNE para posicionar los ejes

**Pregunta:** los ejes equiespaciados son arbitrarios — el ángulo de
`loudness` no tiene ninguna relación con los datos, es sólo "la feature
número 8 de 9". ¿Se puede elegir un ángulo para cada eje que sí refleje algo
real sobre los datos, y que mejore NP?

**Idea (algoritmo Germain, sección "otra manera con paper istar" del
ejercicio de clase):**

1. **Transponer la matriz de datos.** Normalmente cada fila es una canción y
   cada columna una feature. Se transpone: ahora cada fila es **una
   feature**, y sus "coordenadas" son sus valores (z-scoreados) a través de
   todas las canciones de la submuestra. En otras palabras: en vez de
   preguntar "¿en qué se parecen estas dos canciones?", la transpuesta
   pregunta **"¿en qué se parecen estos dos audio features, a través de
   todas las canciones?"** — dos features que suben y bajan juntos
   (`energy` y `loudness`, r=0.78 según el EDA) van a quedar cerca en esta
   matriz transpuesta; dos que se mueven en direcciones opuestas
   (`acousticness` y `energy`, r=−0.75) van a quedar lejos.
2. **Correr t-SNE sobre esa transpuesta.** t-SNE reduce esa matriz (9 filas
   × N canciones) a 9 puntos en 2D, uno por feature, colocando cerca a las
   features que se parecen y lejos a las que no. Es la misma implementación
   de t-SNE (descenso de gradiente con entropía cruzada, ver
   `Metrics.tsne`) que usa el ejercicio de clase; con sólo 9 "puntos" corre
   instantáneamente aunque N sea grande (el costo de t-SNE depende del
   número de puntos a embeber —9—, no del número de canciones detrás de
   cada uno).
3. **Usar esa posición 2D como el eje de cada feature.** La posición
   resultante (centrada y normalizada a longitud promedio 1,
   `Metrics.germainAxes`) se usa directamente como `{x, y}` del eje de esa
   feature en Star Coordinates (dirección **y** peso). En RadViz, en cambio,
   sólo se conserva el **ángulo** de esa posición (`radviz.js` → `toCircle`)
   — la magnitud se descarta y el anclaje se reproyecta sobre el círculo
   unitario, porque RadViz clásico no tiene noción de peso (ver §3).

El resultado: dos features correlacionadas apuntan en direcciones
parecidas y se refuerzan; dos anticorrelacionadas apuntan en direcciones
opuestas y se cancelan menos arbitrariamente que con ángulos fijos — la
geometría del gráfico queda informada por la estructura real de
correlación de los datos, no por el orden en que aparecen las columnas.

### La app arranca ya optimizada, no hace falta hacer clic

Las tres instancias (RadViz, Star · popularidad, Star · modo) calculan sus
ejes Germain **una sola vez, al cargar los datos por primera vez**
(`render()` → `if (!initialized)`), así que lo primero que ve el usuario ya
es la configuración que maximiza NP, no los ángulos equiespaciados. El botón
**"Ejes Germain (t-SNE transpuesta)"** sigue disponible para volver a
optimizar después de filtrar por género/década (el óptimo puede cambiar si
cambia el subconjunto de canciones) o después de haber arrastrado un eje a
mano. El botón **"Restablecer ejes"** vuelve a los ángulos equiespaciados
ingenuos, útil sólo como punto de comparación.

### Resultado medido (mismas condiciones que la tabla anterior)

| k  | RadViz por defecto | RadViz Germain | Δ      | Star por defecto | Star Germain | Δ      |
|----|--------------------:|----------------:|-------:|-------------------:|---------------:|-------:|
| 5  | 0.098                | 0.125            | +27.6% | 0.112               | 0.129           | +15.2% |
| 10 | 0.141                | 0.176            | +24.8% | 0.162               | 0.187           | +15.4% |
| 20 | 0.205                | 0.253            | +23.4% | 0.224               | 0.257           | +14.7% |

(JS en vivo, medido con Playwright contra la app real; el cross-check con
scikit-learn TSNE, que usa una implementación y semilla distintas,
reproduce la misma tendencia y una magnitud muy cercana — ver
`np_crosscheck.py` en la sección de verificación de esta tarea. Números
exactos no idénticos entre corridas/implementaciones son esperables porque
t-SNE es una optimización no convexa con inicialización aleatoria: cada
corrida cae en un óptimo local distinto, pero de calidad equivalente — por
eso el botón "Ejes Germain" puede devolver un número ligeramente distinto
cada vez que se recalcula.)

Mejora consistente de 15–28% en NP para las dos técnicas y los tres valores
de k, con **cero canciones nuevas y ninguna feature descartada** — sólo
cambia el ángulo (RadViz) o el ángulo y el peso (Star) de cada eje. Esto
responde directamente la tarea 2 del enunciado: "aplicar el algoritmo
Germain para mejorar neighborhood preservation".

---

## 3. Anclajes movibles: RadViz (círculo) vs. Star Coordinates (dirección + peso)

Ambas técnicas ahora permiten arrastrar sus ejes con el mouse (`d3.drag`),
pero con una restricción distinta y deliberada:

- **RadViz** (`radviz.js`): los anclajes viven **siempre** sobre el
  perímetro del círculo unitario, sin excepción — ni con los ejes por
  defecto, ni con los ejes Germain, ni al arrastrar. El drag sólo cambia su
  **ángulo** (`angle = atan2(event.y, event.x); d.x = cos(angle); d.y =
  sin(angle)`), y los ejes que llegan del algoritmo Germain se reproyectan
  sobre el círculo descartando su magnitud (`toCircle()`, §2) antes de
  usarse. Esto es RadViz clásico (Hoffman et al. 1997): la posición de cada
  canción es el promedio ponderado por su valor en cada feature, así que
  sólo la **dirección** de cada anclaje es un grado de libertad — nunca su
  distancia al centro.
  > Nota de implementación: el `d3.drag()` de cada anclaje va con
  > `.container(() => g.node())` fijado explícitamente al grupo centrado
  > del gráfico. Cada anclaje se dibuja dentro de su propio `<g>` con
  > `transform: translate(...)`; sin fijar el `container`, d3 mide
  > `event.x/y` relativos a esa posición cambiante en vez del centro del
  > círculo, y el anclaje "salta" a ángulos erráticos en vez de rotar
  > suavemente.
- **Star Coordinates** (`starcoords.js`, ya existía en la base): arrastrar
  un eje cambia **dirección y distancia al centro** — la distancia funciona
  como peso extra en la suma vectorial (`Σ valor_j · eje_j`, sin dividir por
  la suma de valores, a diferencia de RadViz). Este comportamiento con peso
  es justamente lo que el enunciado de la tarea (`archivos_nn/Tarea_3_...`)
  pide para Star Coordinates específicamente ("with axis weighting or
  dragging"), y lo que la distingue de RadViz.

Esta distinción no es cosmética: es la diferencia formal entre las dos
técnicas (RadViz normaliza por la suma de valores, así que la "distancia"
del anclaje no aporta un grado de libertad independiente del ángulo — sólo
reescala todo el anclaje sin cambiar la geometría relativa; Star
Coordinates no normaliza, así que la distancia sí es un peso real e
independiente).

---

## 4. Parallel Coordinates: por qué Neighborhood Preservation *no* aplica, y qué métrica sí

**El porqué:** NP mide qué tan bien una proyección a **menos** dimensiones
preserva la vecindad de una proyección a **más** dimensiones. Parallel
Coordinates no reduce dimensionalidad — cada eje sigue siendo una dimensión
real, todas visibles a la vez. Comparar el espacio original contra "el
espacio de Parallel Coordinates" con la fórmula de la sección 1 daría un
resultado ~1.0 trivial e inútil (es, en esencia, la misma información
dibujada de otra forma, no una compresión con pérdida). Usar NP aquí sería
técnicamente incorrecto, aunque el número "se pudiera calcular".

**La métrica correcta para esta técnica: cruces de líneas ("clutter").**
Es una métrica específica de Parallel Coordinates, no un sustituto de NP —
mide legibilidad, no preservación de vecindad. Está bien establecida en la
literatura de PCP (Ankerst et al. 1998; Peng et al. 2004, reordenamiento de
ejes para reducir clutter): entre dos ejes adyacentes, cada par de líneas
que se cruza indica un cambio de orden relativo entre esas dos canciones —
muchos cruces = nube ilegible; pocos cruces = las dos dimensiones
"cuentan la misma historia" y el patrón es fácil de leer.

Implementación (`Metrics.crossingsBetween`, `parallel.js`): para cada par de
ejes adyacentes, se cuenta cuántos pares de canciones invierten su orden
relativo entre un eje y el siguiente (conteo de inversiones vía
*merge sort*, O(n log n) por par de ejes). Se normaliza dividiendo por el
máximo de cruces posibles (`n·(n-1)/2` por par):

```
cruces_totales(orden)     = Σ_{ejes adyacentes} inversiones(eje_i, eje_i+1)
ratio_cruces(orden)       = cruces_totales / (n_pares · n·(n-1)/2)
```

Nota técnica: a diferencia del reordenamiento angular de RadViz/Star
(donde los ejes están en un círculo y el heurístico de vecino-más-cercano
cierra el ciclo), los ejes de Parallel Coordinates son una **línea**, no un
círculo — así que `Metrics.correlationOrder` minimiza el costo como cadena
abierta (sin cerrar el último-con-el-primero), a diferencia del
`axisOrder` cíclico del ejercicio de clase.

Una ventaja práctica de esta métrica sobre NP: al no requerir kNN, es
O(n log n) por par de ejes en vez de O(n²) — se calcula sobre **todas** las
canciones filtradas (hasta ~4,400), sin necesitar la submuestra de 1,200
que sí hizo falta para RadViz/Star.

### Botón "Optimizar orden (correlación)"

Reordena los ejes para que las features más correlacionadas (en valor
absoluto de Pearson, sobre columnas z-scoreadas) queden adyacentes —mismo
heurístico de "cadena de vecino más cercano" que ordena los anclajes de
RadViz/Star en el ejercicio de clase, adaptado a cadena abierta. Ejes
correlacionados adyacentes tienden a moverse en la misma dirección (pocos
cruces); ejes sin relación, colocados lejos uno del otro, ya no generan
cruces "gratis" contra un vecino con el que no tienen nada que ver.

### Resultado medido

Sobre las 4,400 canciones de la muestra (sin filtros), orden por defecto
`[año, valence, energy, danceability, acousticness, instrumentalness,
liveness, speechiness, loudness, tempo]`:

| Orden                    | % de pares que cruzan | Cruces totales |
|---------------------------|-----------------------:|----------------:|
| Por defecto (alfabético/fijo) | 46.5% (JS) / 47.0% (Python) | ~40.9M |
| Optimizado por correlación    | 37.3% (JS) / 37.6% (Python) | ~32.8M |

Una reducción de ~9 puntos porcentuales (≈20% relativo) en cruces sin
quitar ni un eje — la información sigue completa, sólo cambia el orden en
que se lee.

---

## 5. Resumen de archivos

| Archivo | Qué agrega |
|---|---|
| `app/static/js/metrics.js` | kNN, NP, proyección compartida, t-SNE (algoritmo Germain), correlación, cruces — todo D3 puro, sin dependencias nuevas |
| `app/static/js/radviz.js` | anclajes arrastrables (círculo unitario), botones Restablecer/Germain, badge + tabla NP |
| `app/static/js/starcoords.js` | badge NP al soltar el eje (ambas instancias), botón Germain, tabla comparativa |
| `app/static/js/parallel.js` | panel con métrica de cruces en vivo, botón "Optimizar orden (correlación)" |
| `app/templates/index.html`, `style.css` | panel lateral para Parallel Coordinates (antes no tenía), estilos para badges/tabla NP |

Todas las métricas se recalculan client-side (D3 puro, sin librerías nuevas
— el enunciado exige D3 exclusivamente); el cross-check en Python
(`sklearn`) fue sólo para *validar* la implementación en esta
documentación, no forma parte de la app ni del repo (es un script de
verificación local, igual que `eda/eda_report.py` no se versiona).

## Referencias

- Hoffman, P., Grinstein, G., Marx, K., Grosse, I., Stanley, E. (1997).
  *DNA visual and analytic data mining.* — RadViz.
- Inselberg, A. (1985). *The plane with parallel coordinates.*
- Ankerst, M., Berchtold, S., Keim, D. (1998). *Similarity clustering of
  dimensions for an enhanced visualization of multidimensional data* — base
  del conteo de cruces/clutter en Parallel Coordinates.
- Peng, W., Ward, M., Rundensteiner, E. (2004). *Clutter reduction in
  multi-dimensional data visualization using dimension reordering.*
- van der Maaten, L., Hinton, G. (2008). *Visualizing data using t-SNE.*
- Ejercicio de clase: *Multidimensional Visualization Ejercicio* (Observable,
  prof. Germain Garcia-Zanabria, DS5343 2026-2) — `archivos_nn/` (fuente de
  `kNearestNeighbors`, `neighborhoodPreservation`, `tsne`, `axisOrder`).
