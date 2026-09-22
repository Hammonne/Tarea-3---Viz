"""
Capa de datos del pipeline. Carga el dataset procesado (ver eda/eda_report.py)
UNA vez al iniciar Flask y expone funciones de filtrado / proyeccion que las
rutas de app.py convierten en JSON.

Se trabaja sobre tracks_sample.csv (muestra estratificada por decada, ~4400
pistas) para que RadViz / Star Coordinates / Parallel Coordinates / PCA
respondan de forma interactiva en el navegador con D3 (SVG). El dataset
completo (170k filas, tracks_clean.csv) queda disponible para analisis
agregados (data_by_year, data_by_genres) que no requieren dibujar un punto
por fila.
"""

from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.manifold import TSNE

BASE_DIR = Path(__file__).resolve().parent.parent
PROCESSED_DIR = BASE_DIR / "data" / "processed"

# Los 9 audio features "puros" (escala Spotify), en el orden que se usa como
# eje por defecto en RadViz / Star Coordinates / Parallel Coordinates / PCA.
CORE_FEATURES = [
    "valence", "energy", "danceability", "acousticness",
    "instrumentalness", "liveness", "speechiness", "loudness", "tempo",
]
OPTIONAL_FEATURES = ["duration_ms", "popularity"]
ALL_FEATURES = CORE_FEATURES + OPTIONAL_FEATURES

N_TOP_GENRES = 7  # 7 generos con color propio + bucket "Other" (ver skill dataviz)


class DataStore:
    def __init__(self):
        self.tracks = pd.read_csv(PROCESSED_DIR / "tracks_sample.csv")
        self.by_year = pd.read_csv(PROCESSED_DIR / "by_year.csv")
        self.by_genres = pd.read_csv(PROCESSED_DIR / "by_genres.csv")

        # --- Genero: top-N por conteo en la muestra -> bucket "Other" ---
        genre_counts = self.tracks["primary_genre"].value_counts()
        genre_counts = genre_counts[genre_counts.index != "unknown"]
        self.top_genres = genre_counts.head(N_TOP_GENRES).index.tolist()
        self.tracks["genre_bucket"] = self.tracks["primary_genre"].where(
            self.tracks["primary_genre"].isin(self.top_genres), "Other"
        )

        # --- Anomaly score (Task B: "Genre-bender detector") ---
        # Distancia euclidiana, en espacio normalizado [0,1], de cada pista
        # al centroide de SU PROPIO genero (solo top genres; "unknown"/"Other"
        # quedan sin score por no tener un perfil de genero fiable).
        norm_cols = [f"{f}_norm" for f in CORE_FEATURES]
        centroids = (
            self.tracks[self.tracks["primary_genre"].isin(self.top_genres)]
            .groupby("primary_genre")[norm_cols]
            .mean()
        )
        self.genre_centroids = centroids

        def dist_to_centroid(row):
            g = row["primary_genre"]
            if g not in centroids.index:
                return np.nan
            v = row[norm_cols].to_numpy(dtype=float)
            c = centroids.loc[g].to_numpy(dtype=float)
            return float(np.linalg.norm(v - c))

        self.tracks["anomaly_score"] = self.tracks.apply(dist_to_centroid, axis=1)
        max_a = self.tracks["anomaly_score"].max()
        self.tracks["anomaly_score_norm"] = self.tracks["anomaly_score"] / max_a

        self.min_year = int(self.tracks["year"].min())
        self.max_year = int(self.tracks["year"].max())

        # Proyeccion t-SNE precomputada (costosa) sobre TODA la muestra con
        # los CORE_FEATURES normalizados. PCA se calcula on-demand (barato)
        # porque depende de los filtros activos; t-SNE se ofrece fija como
        # alternativa de exploracion global.
        self._tsne_cache = None

    # ------------------------------------------------------------------
    def filter_tracks(self, genres=None, decade_min=None, decade_max=None,
                       year_min=None, year_max=None, explicit=None):
        df = self.tracks
        if genres:
            df = df[df["genre_bucket"].isin(genres)]
        if decade_min is not None:
            df = df[df["decade"] >= decade_min]
        if decade_max is not None:
            df = df[df["decade"] <= decade_max]
        if year_min is not None:
            df = df[df["year"] >= year_min]
        if year_max is not None:
            df = df[df["year"] <= year_max]
        if explicit is not None:
            df = df[df["explicit"] == explicit]
        return df

    def tracks_payload(self, df):
        cols = [
            "id", "name", "main_artist", "n_artists", "year", "decade",
            "primary_genre", "genre_bucket", "explicit", "popularity",
            "mode", "popularity_pct_in_year", "anomaly_score_norm",
        ] + CORE_FEATURES + [f"{f}_norm" for f in CORE_FEATURES]
        out = df[cols].astype(object)
        out = out.where(pd.notnull(out), None)
        return out.to_dict(orient="records")

    # ------------------------------------------------------------------
    def compute_pca(self, df, features=None):
        features = features or CORE_FEATURES
        norm_cols = [f"{f}_norm" for f in features]
        sub = df.dropna(subset=norm_cols)
        if len(sub) < 3:
            return {"points": [], "explained_variance": [], "loadings": [], "centroids": []}

        X = sub[norm_cols].to_numpy(dtype=float)
        pca = PCA(n_components=2, random_state=42)
        coords = pca.fit_transform(X)

        points = []
        ids = sub["id"].tolist()
        decades = sub["decade"].tolist()
        genres = sub["genre_bucket"].tolist()
        pct = sub["popularity_pct_in_year"].tolist()
        names = sub["name"].tolist()
        artists = sub["main_artist"].tolist()
        for i in range(len(sub)):
            points.append({
                "id": ids[i], "x": float(coords[i, 0]), "y": float(coords[i, 1]),
                "decade": int(decades[i]), "genre_bucket": genres[i],
                "popularity_pct_in_year": float(pct[i]) if pct[i] is not None else None,
                "name": names[i], "main_artist": artists[i],
            })

        loadings = [
            {"feature": f, "x": float(pca.components_[0, j]), "y": float(pca.components_[1, j])}
            for j, f in enumerate(features)
        ]

        # Trayectoria de centroides por decada (Task D: "sonic evolution timeline")
        sub = sub.copy()
        sub["pc1"], sub["pc2"] = coords[:, 0], coords[:, 1]
        centroids = (
            sub.groupby("decade")[["pc1", "pc2"]].mean().reset_index()
            .sort_values("decade")
        )
        centroid_list = [
            {"decade": int(r.decade), "x": float(r.pc1), "y": float(r.pc2)}
            for r in centroids.itertuples()
        ]

        return {
            "points": points,
            "explained_variance": [round(float(v), 4) for v in pca.explained_variance_ratio_],
            "loadings": loadings,
            "centroids": centroid_list,
        }

    def compute_tsne(self, features=None, perplexity=30, sample_n=1500):
        """t-SNE es costoso: se calcula sobre una sub-muestra fija (cache)."""
        features = features or CORE_FEATURES
        if self._tsne_cache is not None:
            return self._tsne_cache

        df = self.tracks.sample(n=min(sample_n, len(self.tracks)), random_state=42)
        norm_cols = [f"{f}_norm" for f in features]
        X = df[norm_cols].to_numpy(dtype=float)
        tsne = TSNE(n_components=2, perplexity=perplexity, random_state=42, init="pca")
        coords = tsne.fit_transform(X)

        points = []
        for i, row in enumerate(df.itertuples()):
            points.append({
                "id": row.id, "x": float(coords[i, 0]), "y": float(coords[i, 1]),
                "decade": int(row.decade), "genre_bucket": row.genre_bucket,
                "popularity_pct_in_year": float(row.popularity_pct_in_year),
                "name": row.name, "main_artist": row.main_artist,
            })
        result = {"points": points}
        self._tsne_cache = result
        return result

    # ------------------------------------------------------------------
    def meta(self):
        return {
            "genres": self.top_genres + ["Other"],
            "features": CORE_FEATURES,
            "optional_features": OPTIONAL_FEATURES,
            "min_year": self.min_year,
            "max_year": self.max_year,
            "decades": sorted(self.tracks["decade"].unique().tolist()),
            "n_tracks": int(len(self.tracks)),
        }

    def by_year_payload(self):
        cols = ["year", "acousticness", "energy", "danceability", "loudness",
                "valence", "tempo", "popularity"]
        return self.by_year[cols].to_dict(orient="records")


store = DataStore()
