"""
Punto de entrada Flask del pipeline de visualizacion multidimensional.
Sirve el shell HTML (D3 dibuja todo en el navegador) y una API JSON delgada
que filtra/proyecta el dataset procesado en data/processed/.

Correr con:  python app/app.py
"""

from flask import Flask, jsonify, render_template, request

from data_service import ALL_FEATURES, CORE_FEATURES, store

app = Flask(__name__)


def _parse_int(name, default=None):
    v = request.args.get(name, default)
    return int(v) if v not in (None, "") else None


def _parse_list(name):
    v = request.args.get(name, "")
    return [x for x in v.split(",") if x] or None


def _parse_features(name):
    v = request.args.get(name)
    if not v:
        return CORE_FEATURES
    feats = [x for x in v.split(",") if x in ALL_FEATURES]
    return feats or CORE_FEATURES


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/meta")
def api_meta():
    return jsonify(store.meta())


@app.route("/api/tracks")
def api_tracks():
    genres = _parse_list("genres")
    decade_min = _parse_int("decade_min")
    decade_max = _parse_int("decade_max")
    explicit = _parse_int("explicit")
    df = store.filter_tracks(genres=genres, decade_min=decade_min,
                              decade_max=decade_max, explicit=explicit)
    return jsonify({
        "count": int(len(df)),
        "tracks": store.tracks_payload(df),
    })


@app.route("/api/projection")
def api_projection():
    method = request.args.get("method", "pca")
    genres = _parse_list("genres")
    decade_min = _parse_int("decade_min")
    decade_max = _parse_int("decade_max")
    features = _parse_features("features")

    if method == "tsne":
        return jsonify({"method": "tsne", **store.compute_tsne(features=features)})

    df = store.filter_tracks(genres=genres, decade_min=decade_min, decade_max=decade_max)
    result = store.compute_pca(df, features=features)
    return jsonify({"method": "pca", **result})


@app.route("/api/by_year")
def api_by_year():
    return jsonify(store.by_year_payload())


@app.route("/api/genre_centroids")
def api_genre_centroids():
    c = store.genre_centroids.reset_index().rename(columns={"index": "primary_genre"})
    return jsonify(c.to_dict(orient="records"))


if __name__ == "__main__":
    app.run(debug=True, port=5000)
