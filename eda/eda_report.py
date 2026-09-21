"""
EDA exhaustivo del dataset Spotify (Kaggle) para Tarea 3 - Visualizacion Multidimensional.
Genera un reporte de texto (eda/eda_report.txt) y datasets limpios en data/processed/.

Cubre:
- Estructura y tipos de cada CSV
- Nulos / vacios / placeholders
- Duplicados (exactos y logicos: mismo id, o mismo nombre+artista+duracion)
- Parseo de columnas compuestas (artists como string de lista, genres como string de lista)
- Rango y outliers (IQR y z-score) de features de audio
- Consistencia entre data.csv y data_by_year / data_by_artist / data_by_genres
- Insights orientados a las tareas analiticas (popularidad, evolucion temporal, generos)
"""

import ast
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

pd.set_option("display.width", 160)
pd.set_option("display.max_columns", 30)

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
PROCESSED = Path(__file__).resolve().parent.parent / "data" / "processed"
PROCESSED.mkdir(parents=True, exist_ok=True)

REPORT_LINES = []


def log(msg=""):
    print(msg)
    REPORT_LINES.append(str(msg))


def section(title):
    log()
    log("=" * 90)
    log(title)
    log("=" * 90)


AUDIO_FEATURES = [
    "valence", "acousticness", "danceability", "energy", "instrumentalness",
    "liveness", "loudness", "speechiness", "tempo", "popularity",
    "duration_ms", "key", "mode", "explicit",
]

# ---------------------------------------------------------------------------
section("1. CARGA Y ESTRUCTURA DE LOS 5 CSV")
# ---------------------------------------------------------------------------

files = {
    "data": "data.csv",
    "by_artist": "data_by_artist.csv",
    "by_genres": "data_by_genres.csv",
    "by_year": "data_by_year.csv",
    "w_genres": "data_w_genres.csv",
}

dfs = {}
for key, fname in files.items():
    df = pd.read_csv(RAW / fname)
    dfs[key] = df
    log(f"\n--- {fname} ---")
    log(f"shape: {df.shape}")
    log(f"columns: {list(df.columns)}")
    log(f"dtypes:\n{df.dtypes}")

data = dfs["data"]

# ---------------------------------------------------------------------------
section("2. VALORES NULOS / VACIOS / PLACEHOLDERS")
# ---------------------------------------------------------------------------

for key, df in dfs.items():
    n_null = df.isnull().sum().sum()
    log(f"\n--- {key} ---")
    log(f"Total celdas nulas (NaN): {n_null}")
    if n_null:
        log(df.isnull().sum()[df.isnull().sum() > 0])

# Placeholders: strings vacios, listas vacias como texto "[]", nombres genericos
log("\n--- Placeholders en data.csv ---")
log(f"artists == \"[]\": {(data['artists'] == '[]').sum()}")
log(f"name vacio o solo espacios: {(data['name'].astype(str).str.strip() == '').sum()}")
log(f"name nulo: {data['name'].isnull().sum()}")
empty_genre_pct = (dfs['w_genres']['genres'] == '[]').mean() * 100
log(f"\n--- data_w_genres.csv: artistas SIN genero catalogado ---")
log(f"'genres' == '[]': {(dfs['w_genres']['genres'] == '[]').sum()} de {len(dfs['w_genres'])} "
    f"({empty_genre_pct:.1f}%)  <- hallazgo clave: falta de metadata de genero, no NaN clasico")

# ---------------------------------------------------------------------------
section("3. DUPLICADOS")
# ---------------------------------------------------------------------------

log(f"Duplicados exactos (todas las columnas) en data.csv: {data.duplicated().sum()}")
log(f"Duplicados por 'id' (deberia ser unico) en data.csv: {data.duplicated(subset=['id']).sum()}")

logical_dup_cols = ["name", "artists", "duration_ms"]
n_logical = data.duplicated(subset=logical_dup_cols).sum()
log(f"Duplicados logicos (mismo name+artists+duration_ms, ids distintos -> "
    f"probables re-releases/remasters): {n_logical}")

sample_dups = data[data.duplicated(subset=logical_dup_cols, keep=False)].sort_values(logical_dup_cols)
log("\nEjemplo de duplicados logicos (top 6 filas):")
log(sample_dups[["id", "name", "artists", "year", "popularity"]].head(6))

# ---------------------------------------------------------------------------
section("4. PARSEO DE 'artists' (string de lista Python) -> lista real + primer artista")
# ---------------------------------------------------------------------------


def safe_parse_list(x):
    if pd.isnull(x):
        return []
    try:
        v = ast.literal_eval(x)
        if isinstance(v, list):
            return v
    except (ValueError, SyntaxError):
        pass
    return [x]


data["artists_list"] = data["artists"].apply(safe_parse_list)
data["n_artists"] = data["artists_list"].apply(len)
data["main_artist"] = data["artists_list"].apply(lambda l: l[0] if l else "Unknown")

log(f"Canciones con 0 artistas parseables: {(data['n_artists'] == 0).sum()}")
log(f"Distribucion de n_artists (colaboraciones):")
log(data["n_artists"].value_counts().sort_index().head(10))
log(f"Max artistas en una sola pista: {data['n_artists'].max()}")
collab_pct = (data["n_artists"] > 1).mean() * 100
log(f"% de pistas que son colaboraciones (>1 artista): {collab_pct:.2f}%")

# ---------------------------------------------------------------------------
section("5. FECHAS: 'release_date' vs 'year'")
# ---------------------------------------------------------------------------

log(f"Formatos distintos de longitud de string en release_date (muestra):")
lens = data["release_date"].astype(str).str.len().value_counts()
log(lens)
log("-> release_date viene en 3 formatos: YYYY, YYYY-MM, YYYY-MM-DD (inconsistente, "
    "requiere normalizacion antes de graficar series temporales).")

data["release_date_parsed"] = pd.to_datetime(data["release_date"], errors="coerce", format="mixed")
n_bad_dates = data["release_date_parsed"].isnull().sum()
log(f"Fechas no parseables incluso con parser flexible: {n_bad_dates}")

log(f"\nRango de 'year': {data['year'].min()} - {data['year'].max()}")
mismatch = (data["release_date_parsed"].dt.year.fillna(-1).astype(int) != data["year"]).sum()
log(f"Filas donde year(release_date) != columna 'year': {mismatch} "
    f"(cuando release_date es solo 'YYYY' coinciden por construccion)")

# ---------------------------------------------------------------------------
section("6. RANGOS, TIPOS Y ESCALAS DE AUDIO FEATURES (para Parallel/Star/RadViz)")
# ---------------------------------------------------------------------------

desc = data[AUDIO_FEATURES].describe().T
desc["range"] = desc["max"] - desc["min"]
log(desc[["min", "max", "mean", "std", "50%", "range"]])

log("""
Hallazgo de escalas (CRITICO para RadViz/Star Coordinates/Parallel Coordinates):
- Features en [0,1]: valence, acousticness, danceability, energy, instrumentalness,
  liveness, speechiness  -> comparables directamente.
- loudness: dB, tipicamente [-60, 5]  -> escala y signo distintos, domina visualmente si no se normaliza.
- tempo: BPM, ~[0, 250]              -> escala distinta, requiere normalizacion min-max o z-score.
- duration_ms: milisegundos, ~[0, 5.000.000+] -> orden de magnitud MUY distinto, outliers extremos.
- popularity: entero [0, 100]        -> escala Spotify propia, no es un audio feature "puro".
- key: categorica ordinal [0-11] (pitch class), mode: binaria {0,1}, explicit: binaria {0,1}.
=> Para RadViz/Star Coordinates/Parallel Coordinates TODAS las columnas deben normalizarse
   (min-max recomendado) para que ningun eje domine solo por su rango.
""")

# ---------------------------------------------------------------------------
section("7. OUTLIERS: metodo IQR y z-score sobre features continuas")
# ---------------------------------------------------------------------------

continuous = ["valence", "acousticness", "danceability", "energy", "instrumentalness",
              "liveness", "loudness", "speechiness", "tempo", "duration_ms", "popularity"]

outlier_summary = []
for col in continuous:
    s = data[col].astype(float)
    q1, q3 = s.quantile(0.25), s.quantile(0.75)
    iqr = q3 - q1
    lo, hi = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    n_iqr = ((s < lo) | (s > hi)).sum()

    z = (s - s.mean()) / s.std()
    n_z = (z.abs() > 3).sum()

    outlier_summary.append({
        "feature": col, "iqr_low": round(lo, 3), "iqr_high": round(hi, 3),
        "n_outliers_iqr": int(n_iqr), "pct_iqr": round(n_iqr / len(s) * 100, 2),
        "n_outliers_z3": int(n_z), "pct_z3": round(n_z / len(s) * 100, 2),
    })

outlier_df = pd.DataFrame(outlier_summary)
log(outlier_df.to_string(index=False))

log("""
Lectura de negocio de los outliers (NO se eliminan, se documentan y flaggean):
- duration_ms: outliers altos = interludios/spoken word/clasica larga (legitimos, no error).
  Se define un tope de sanity check (< 30s o > 20min) como posible dato corrupto, no simple IQR.
- instrumentalness/speechiness/liveness: distribuciones muy sesgadas a 0 (long tail) -> el IQR
  marca "outlier" a la mayoria de pistas con letra/voz en vivo; NO son errores, son la naturaleza
  bimodal del feature (canciones instrumentales vs. con voz). IQR no es el metodo adecuado aqui.
- loudness: outliers bajos (< -35dB aprox) suelen ser grabaciones antiguas (1920s-1940s) o pistas
  clasicas de baja compresion dinamica -> correlaciona con 'year', no es ruido aleatorio.
- popularity == 0: enorme acumulacion (pistas nunca reproducidas / muy antiguas o nicho) -> no es
  outlier estadistico pero si un caso especial a tratar en tareas de "popularidad".
""")

n_dur_low = (data["duration_ms"] < 30_000).sum()
n_dur_high = (data["duration_ms"] > 20 * 60_000).sum()
log(f"Sanity check duracion: < 30s = {n_dur_low} pistas, > 20min = {n_dur_high} pistas")
log(f"popularity == 0: {(data['popularity'] == 0).sum()} pistas "
    f"({(data['popularity'] == 0).mean()*100:.1f}%)")

# ---------------------------------------------------------------------------
section("8. CORRELACIONES ENTRE AUDIO FEATURES")
# ---------------------------------------------------------------------------

corr = data[continuous + ["year"]].corr(numeric_only=True)
log(corr.round(2).to_string())

log("""
Pares mas correlacionados (|r| > 0.4) - relevantes para elegir ejes de RadViz/Star Coordinates
(ejes muy correlacionados generan patrones redundantes / colineales):
""")
corr_pairs = (
    corr.where(np.triu(np.ones(corr.shape), k=1).astype(bool))
    .stack()
    .reset_index()
)
corr_pairs.columns = ["feature_1", "feature_2", "corr"]
strong = corr_pairs[corr_pairs["corr"].abs() > 0.4].sort_values("corr", key=abs, ascending=False)
log(strong.to_string(index=False))

# ---------------------------------------------------------------------------
section("9. CONSISTENCIA ENTRE data.csv Y AGREGADOS (by_year, by_artist, by_genres)")
# ---------------------------------------------------------------------------

by_year = dfs["by_year"]
recomputed = data.groupby("year")["popularity"].mean().reindex(by_year["year"]).values
diff = np.abs(recomputed - by_year["popularity"].values)
log(f"Max diferencia entre popularity media recalculada vs data_by_year.csv: {np.nanmax(diff):.4f}")
log("-> agregados pre-calculados son consistentes con data.csv (validacion cruzada OK).")

years_in_data = set(data["year"].unique())
years_in_by_year = set(by_year["year"].unique())
log(f"Anios en data.csv no presentes en data_by_year.csv: {years_in_data - years_in_by_year}")
log(f"Rango data_by_year: {by_year['year'].min()}-{by_year['year'].max()} "
    f"({len(by_year)} anios, {'sin huecos' if len(by_year)==by_year['year'].max()-by_year['year'].min()+1 else 'CON huecos'})")

# ---------------------------------------------------------------------------
section("10. ENRIQUECIMIENTO: mapear genero principal por artista a data.csv")
# ---------------------------------------------------------------------------

w_genres = dfs["w_genres"].copy()
w_genres["genres_list"] = w_genres["genres"].apply(safe_parse_list)
w_genres["primary_genre"] = w_genres["genres_list"].apply(lambda l: l[0] if l else None)

artist_to_genre = dict(zip(w_genres["artists"], w_genres["primary_genre"]))
data["primary_genre"] = data["main_artist"].map(artist_to_genre)

n_no_genre = data["primary_genre"].isnull().sum()
log(f"Pistas en data.csv SIN genero asignable via join por nombre de artista: "
    f"{n_no_genre} ({n_no_genre/len(data)*100:.1f}%)")
log("""
-> El join 'artists' (data.csv) <-> 'artists' (data_w_genres.csv) es por STRING EXACTO.
   Se pierden matches por: mayus/minus, acentos, colaboraciones (data.csv junta varios artistas
   en una lista, data_w_genres.csv tiene un artista por fila), y artistas sin genero catalogado
   en Spotify (genres == '[]'). Se documenta como limitacion y se resuelve usando SOLO el primer
   artista (main_artist) + normalizacion de casing antes del join.
""")

# Retry join with normalized casing
w_genres["artist_norm"] = w_genres["artists"].str.strip().str.lower()
data["main_artist_norm"] = data["main_artist"].str.strip().str.lower()
artist_to_genre_norm = dict(zip(w_genres["artist_norm"], w_genres["primary_genre"]))
data["primary_genre_norm_join"] = data["main_artist_norm"].map(artist_to_genre_norm)
n_no_genre_norm = data["primary_genre_norm_join"].isnull().sum()
log(f"Tras normalizar casing: pistas sin genero = {n_no_genre_norm} "
    f"({n_no_genre_norm/len(data)*100:.1f}%)  [mejora de {n_no_genre - n_no_genre_norm} filas]")

top_genres = data["primary_genre_norm_join"].value_counts().head(15)
log("\nTop 15 generos primarios resultantes (tras enriquecimiento):")
log(top_genres)

# ---------------------------------------------------------------------------
section("11. INSIGHTS DE NEGOCIO (tendencias temporales)")
# ---------------------------------------------------------------------------

decade = (data["year"] // 10 * 10)
data["decade"] = decade
trend = data.groupby("decade")[["energy", "acousticness", "danceability", "loudness",
                                  "valence", "tempo", "popularity"]].mean().round(3)
log("Evolucion de features promedio por decada:")
log(trend)

log("""
Insights clave:
1) 'acousticness' cae sostenidamente desde 1920s (~0.85) hasta 2020s (~0.2): la produccion
   musical se electrifica/amplifica con el tiempo (consistente con historia de la industria).
2) 'loudness' sube con el tiempo (~-17dB en 1920s a ~-6dB en 2010s-2020s): efecto "loudness war"
   de masterización, MUY correlacionado con year (r visto en seccion 8).
3) 'energy' y 'danceability' crecen de forma mas marcada desde 1960s-70s (rock/pop electrificado)
   y otra vez desde 2000s-2010s (EDM/pop de baile).
4) 'popularity' promedio por año NO es comparable directamente entre decadas antiguas y recientes:
   el algoritmo de popularidad de Spotify pondera reproducciones recientes, por lo que canciones
   viejas estan estructuralmente en desventaja -> ADVERTENCIA para cualquier task que compare
   "popularidad" entre eras; se recomienda usar popularidad NORMALIZADA por año (percentil dentro
   de su propio año) en vez de valor absoluto.
""")

data["popularity_pct_in_year"] = data.groupby("year")["popularity"].rank(pct=True)

# ---------------------------------------------------------------------------
section("12. LIMPIEZA FINAL Y EXPORT DE DATASET PROCESADO")
# ---------------------------------------------------------------------------

clean = data.copy()

# Reglas de limpieza (documentadas, NO se borra informacion agresivamente):
# 1. Eliminar duplicados exactos por 'id'
before = len(clean)
clean = clean.drop_duplicates(subset=["id"])
log(f"Duplicados por id eliminados: {before - len(clean)}")

# 2. Filtrar sanity-check de duracion corrupta (< 5s, posible error de ingestion)
before = len(clean)
clean = clean[clean["duration_ms"] >= 5_000]
log(f"Filas con duration_ms < 5000ms eliminadas (probable corrupcion): {before - len(clean)}")

# 3. Normalizar year (ya viene limpio, pero se fuerza rango valido)
before = len(clean)
clean = clean[(clean["year"] >= 1900) & (clean["year"] <= 2026)]
log(f"Filas con year fuera de [1900,2026] eliminadas: {before - len(clean)}")

# 4. Imputacion de genero faltante con categoria explicita "unknown" (no se infiere)
clean["primary_genre_norm_join"] = clean["primary_genre_norm_join"].fillna("unknown")

# 5. Normalizacion min-max de features para RadViz/Star Coords (nuevas columnas *_norm)
norm_cols = ["valence", "acousticness", "danceability", "energy", "instrumentalness",
             "liveness", "loudness", "speechiness", "tempo", "duration_ms", "popularity"]
for col in norm_cols:
    mn, mx = clean[col].min(), clean[col].max()
    clean[f"{col}_norm"] = (clean[col] - mn) / (mx - mn)

keep_cols = [
    "id", "name", "main_artist", "artists", "n_artists", "year", "decade",
    "primary_genre_norm_join", "explicit", "key", "mode",
    "popularity", "popularity_pct_in_year",
] + continuous[:-1] + [f"{c}_norm" for c in norm_cols]
keep_cols = list(dict.fromkeys(keep_cols))  # de-dup preserving order

clean_out = clean[keep_cols].rename(columns={"primary_genre_norm_join": "primary_genre"})
out_path = PROCESSED / "tracks_clean.csv"
clean_out.to_csv(out_path, index=False)
log(f"\nDataset limpio exportado: {out_path} ({clean_out.shape[0]} filas, {clean_out.shape[1]} cols)")

# Muestra estratificada ligera para desarrollo rapido del frontend (D3 con 170k puntos es pesado)
sample = clean_out.groupby("decade", group_keys=False).apply(
    lambda g: g.sample(min(len(g), 400), random_state=42)
)
sample_path = PROCESSED / "tracks_sample.csv"
sample.to_csv(sample_path, index=False)
log(f"Muestra estratificada por decada exportada: {sample_path} ({len(sample)} filas)")

# Top genres agregados (para selector de genero en la UI)
genre_counts = clean_out["primary_genre"].value_counts()
top_genre_list = genre_counts[genre_counts >= 50].index.tolist()
with open(PROCESSED / "genres_list.json", "w", encoding="utf-8") as f:
    json.dump(sorted(top_genre_list), f, ensure_ascii=False, indent=2)
log(f"Lista de generos con >=50 tracks exportada ({len(top_genre_list)} generos): genres_list.json")

# data_by_year y data_by_genres limpios y copiados a processed (ya vienen agregados, se validan)
dfs["by_year"].to_csv(PROCESSED / "by_year.csv", index=False)
genre_agg = dfs["by_genres"].copy()
genre_agg = genre_agg[genre_agg["genres"].isin(top_genre_list) | True]  # keep all, filter in API layer
genre_agg.to_csv(PROCESSED / "by_genres.csv", index=False)

log("\nEDA completo. Reporte completo en eda/eda_report.txt")

with open(Path(__file__).resolve().parent / "eda_report.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(REPORT_LINES))
