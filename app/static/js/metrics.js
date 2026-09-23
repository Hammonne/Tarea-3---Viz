// Métricas compartidas de calidad de proyección + el "algoritmo Germain"
// (transpuesta de la matriz de datos + t-SNE para posicionar ejes de
// Star Coordinates / RadViz). Puerto directo de las funciones usadas en el
// ejercicio de clase (Multidimensional Visualization Ejercicio · Observable),
// adaptadas para correr sobre una submuestra fija en vez de las 178 filas del
// dataset de ejemplo (ver docs/neighborhood_preservation.md, sección 1).
const Metrics = (() => {
  // Techo de puntos usado SOLO para las métricas (kNN es O(n^2)). La
  // visualización sigue dibujando todas las filas filtradas; esta submuestra
  // determinística (stride fijo, sin aleatoriedad) es exclusivamente para que
  // Neighborhood Preservation responda en tiempo interactivo sobre ~4400 filas.
  const NP_SAMPLE_MAX = 1200;
  const NP_MAX_K = 30; // techo para el barrido de k en las tablas comparativas

  function euclidean(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const d = a[i] - b[i];
      sum += d * d;
    }
    return Math.sqrt(sum);
  }

  // Muestreo por paso fijo (determinístico): mismas filas siempre que el
  // orden de `tracks` no cambie, para poder comparar configuraciones de ejes.
  function subsampleIndices(n, maxN = NP_SAMPLE_MAX) {
    if (n <= maxN) return d3.range(n);
    const stride = n / maxN;
    const idx = [];
    for (let i = 0; i < maxN; i++) idx.push(Math.floor(i * stride));
    return idx;
  }

  // Para cada punto, los índices de sus maxK vecinos más cercanos (excluyéndose
  // a sí mismo), ordenados de más a menos cercano. Se calcula una sola vez por
  // configuración y se reutiliza para cualquier k <= maxK (evita recalcular
  // distancias por cada valor de k en las tablas comparativas).
  function kNN(points, maxK = NP_MAX_K) {
    const cappedK = Math.min(maxK, points.length - 1);
    return points.map((p, i) => {
      const dists = [];
      for (let j = 0; j < points.length; j++) {
        if (j === i) continue;
        dists.push([j, euclidean(p, points[j])]);
      }
      dists.sort((a, b) => a[1] - b[1]);
      return dists.slice(0, cappedK).map(d => d[0]);
    });
  }

  // Neighborhood Preservation a un k dado, a partir de listas kNN ya
  // calculadas (con maxK >= k): fracción promedio de vecinos que se comparten
  // entre el espacio original y el proyectado.
  function npAtK(origNN, projNN, k) {
    let total = 0;
    for (let i = 0; i < origNN.length; i++) {
      const set = new Set(projNN[i].slice(0, k));
      let shared = 0;
      const limit = Math.min(k, origNN[i].length);
      for (let t = 0; t < limit; t++) {
        if (set.has(origNN[i][t])) shared++;
      }
      total += shared / k;
    }
    return total / origNN.length;
  }

  // Atajo para un solo par original/proyectado a un solo k (sin cachear NN).
  function neighborhoodPreservation(original, projected, k = 10) {
    if (original.length !== projected.length) {
      throw new Error("original y projected deben tener el mismo número de puntos.");
    }
    const origNN = kNN(original, k);
    const projNN = kNN(projected, k);
    return npAtK(origNN, projNN, k);
  }

  // Proyección RadViz (weighted=true, divide por la suma de valores) o Star
  // Coordinates (weighted=false, suma vectorial cruda) para un set de ejes
  // {feature, x, y}. Centraliza la fórmula que radviz.js/starcoords.js dibujan.
  function projectPoints(tracks, axes, weighted) {
    return tracks.map(d => {
      let sx = 0, sy = 0, total = 0;
      axes.forEach(a => {
        const v = +d[`${a.feature}_norm`] || 0;
        sx += v * a.x;
        sy += v * a.y;
        total += v;
      });
      if (weighted) return total ? [sx / total, sy / total] : [0, 0];
      return [sx, sy];
    });
  }

  // --- t-SNE genérico (descenso de gradiente clásico, misma implementación
  // que el ejercicio de clase). Aquí se usa con muy pocos "puntos" (una fila
  // por audio feature, no por canción), así que corre instantáneo. ---
  function tsne(X, { perplexity = 3, iters = 800, lr = 10, seed = 1 } = {}) {
    const n = X.length;
    const D2 = X.map(a => X.map(b => d3.sum(a, (v, k) => (v - b[k]) ** 2)));
    const Pc = X.map(() => new Array(n).fill(0));
    const logU = Math.log(Math.min(perplexity, n - 1));
    for (let i = 0; i < n; i++) {
      let beta = 1, lo = 0, hi = Infinity;
      for (let t = 0; t < 100; t++) {
        let sum = 0, sdp = 0;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const p = Math.exp(-D2[i][j] * beta);
          Pc[i][j] = p; sum += p; sdp += D2[i][j] * p;
        }
        const H = sum > 0 ? Math.log(sum) + beta * sdp / sum : 0;
        for (let j = 0; j < n; j++) Pc[i][j] = sum > 0 ? Pc[i][j] / sum : 0;
        if (Math.abs(H - logU) < 1e-5) break;
        if (H > logU) { lo = beta; beta = hi === Infinity ? beta * 2 : (beta + hi) / 2; }
        else { hi = beta; beta = (beta + lo) / 2; }
      }
    }
    const P = Pc.map((row, i) => row.map((v, j) => (v + Pc[j][i]) / (2 * n)));
    const rnd = d3.randomLcg(seed);
    const normal = d3.randomNormal.source(rnd)(0, 1e-4);
    const Y = d3.range(n).map(() => [normal(), normal()]);
    const V = Y.map(() => [0, 0]);
    for (let it = 0; it < iters; it++) {
      const ex = it < 100 ? 4 : 1, mom = it < 250 ? 0.5 : 0.8;
      const num = Y.map(a => Y.map(b => 1 / (1 + (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)));
      let Z = 0;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) Z += num[i][j];
      for (let i = 0; i < n; i++) {
        let g0 = 0, g1 = 0;
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const m = 4 * (ex * P[i][j] - num[i][j] / Z) * num[i][j];
          g0 += m * (Y[i][0] - Y[j][0]);
          g1 += m * (Y[i][1] - Y[j][1]);
        }
        V[i][0] = mom * V[i][0] - lr * g0;
        V[i][1] = mom * V[i][1] - lr * g1;
      }
      for (let i = 0; i < n; i++) { Y[i][0] += V[i][0]; Y[i][1] += V[i][1]; }
    }
    return Y;
  }

  // "Algoritmo Germain": transpone la matriz de datos (una fila por audio
  // feature, no por canción), corre t-SNE sobre esa transpuesta y usa la
  // posición 2D resultante de cada feature como la dirección/peso de su eje.
  // Dos features cuyo patrón de valores es parecido a través de las canciones
  // terminan con ejes cercanos entre sí; ver docs/neighborhood_preservation.md.
  function germainAxes(tracks, features, sampleIdx) {
    const rows = sampleIdx.map(i => tracks[i]);
    const attrMatrix = features.map(f => {
      const col = rows.map(d => +d[`${f}_norm`] || 0);
      const m = d3.mean(col), s = d3.deviation(col) || 1;
      return col.map(v => (v - m) / s);
    });
    const embedding = tsne(attrMatrix, { perplexity: Math.min(3, features.length - 1), iters: 800, seed: 1 });
    const cx = d3.mean(embedding, p => p[0]), cy = d3.mean(embedding, p => p[1]);
    const centered = embedding.map(p => [p[0] - cx, p[1] - cy]);
    const meanLen = d3.mean(centered, p => Math.hypot(p[0], p[1])) || 1;
    return features.map((feature, j) => ({
      feature,
      x: centered[j][0] / meanLen,
      y: centered[j][1] / meanLen
    }));
  }

  // --- Correlación (para reordenar ejes de Parallel Coordinates) ---
  function pearson(a, b) {
    const ma = d3.mean(a), mb = d3.mean(b);
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < a.length; i++) {
      num += (a[i] - ma) * (b[i] - mb);
      da += (a[i] - ma) ** 2;
      db += (b[i] - mb) ** 2;
    }
    const denom = Math.sqrt(da * db);
    return denom > 0 ? num / denom : 0;
  }

  function correlationMatrix(columns) {
    return columns.map(a => columns.map(b => pearson(a, b)));
  }

  // Ordena `dims` para que las variables correlacionadas queden adyacentes,
  // vía el mismo heurístico "vecino más cercano" del ejercicio de clase, pero
  // como cadena abierta (los ejes de Parallel Coordinates son una línea, no
  // un círculo como en RadViz/Star, así que no se cierra el ciclo).
  function correlationOrder(dims, columns) {
    const D = dims.length;
    const corr = correlationMatrix(columns);
    const dist = (a, b) => 1 - corr[a][b];
    let best = null, bestCost = Infinity;
    for (let start = 0; start < D; start++) {
      const order = [start];
      const left = new Set(d3.range(D).filter(j => j !== start));
      while (left.size) {
        const last = order[order.length - 1];
        let nextIdx = null, nextDist = Infinity;
        left.forEach(j => {
          const dd = dist(last, j);
          if (dd < nextDist) { nextDist = dd; nextIdx = j; }
        });
        order.push(nextIdx);
        left.delete(nextIdx);
      }
      let cost = 0;
      for (let k = 0; k < D - 1; k++) cost += dist(order[k], order[k + 1]);
      if (cost < bestCost) { bestCost = cost; best = order; }
    }
    return best.map(i => dims[i]);
  }

  // --- Cruces de líneas en Parallel Coordinates (clutter) ---
  function rankOf(values) {
    const order = d3.range(values.length).sort((i, j) => values[i] - values[j]);
    const rank = new Array(values.length);
    order.forEach((idx, r) => { rank[idx] = r; });
    return rank;
  }

  // Cuenta inversiones (merge sort, O(n log n)): equivalente al número de
  // pares de líneas que se cruzan entre dos ejes adyacentes.
  function countInversions(arr) {
    const a = arr.slice();
    const tmp = new Array(a.length);
    let inv = 0;
    (function sort(lo, hi) {
      if (hi - lo <= 1) return;
      const mid = (lo + hi) >> 1;
      sort(lo, mid); sort(mid, hi);
      let i = lo, j = mid, k = lo;
      while (i < mid && j < hi) {
        if (a[i] <= a[j]) tmp[k++] = a[i++];
        else { inv += mid - i; tmp[k++] = a[j++]; }
      }
      while (i < mid) tmp[k++] = a[i++];
      while (j < hi) tmp[k++] = a[j++];
      for (let x = lo; x < hi; x++) a[x] = tmp[x];
    })(0, a.length);
    return inv;
  }

  function crossingsBetween(valuesA, valuesB) {
    const n = valuesA.length;
    const order = d3.range(n).sort((i, j) => valuesA[i] - valuesA[j]);
    const rankB = rankOf(valuesB);
    const seq = order.map(i => rankB[i]);
    return countInversions(seq);
  }

  // --- Widgets reutilizables (D3 puro) para mostrar el puntaje NP y la
  // tabla comparativa "ejes por defecto vs. ejes Germain" en los paneles
  // laterales de RadViz / Star Coordinates. ---
  function renderNPBadge(container, text) {
    const root = d3.select(container);
    let badge = root.select(".np-badge");
    if (badge.empty()) badge = root.append("p").attr("class", "np-badge");
    badge.text(text);
    return badge;
  }

  // series: [{ name, origNN, projNN }] ya con kNN calculado a NP_MAX_K.
  // ks: lista de valores de k a comparar (p.ej. [5, 10, 20]).
  function renderNPTable(container, ks, series) {
    const root = d3.select(container);
    root.selectAll(".np-table-wrap").remove();
    const wrap = root.append("div").attr("class", "np-table-wrap");
    wrap.append("h3").text("Neighborhood Preservation");
    const table = wrap.append("table").attr("class", "np-table");
    const thead = table.append("thead").append("tr");
    thead.append("th").text("k");
    series.forEach(s => thead.append("th").text(s.name));
    const tbody = table.append("tbody");
    ks.forEach(k => {
      const row = tbody.append("tr");
      row.append("td").text(k);
      series.forEach(s => {
        row.append("td").text(npAtK(s.origNN, s.projNN, k).toFixed(3));
      });
    });
    return wrap;
  }

  return {
    NP_SAMPLE_MAX,
    NP_MAX_K,
    euclidean,
    subsampleIndices,
    kNN,
    npAtK,
    neighborhoodPreservation,
    projectPoints,
    tsne,
    germainAxes,
    pearson,
    correlationMatrix,
    correlationOrder,
    crossingsBetween,
    renderNPBadge,
    renderNPTable
  };
})();
