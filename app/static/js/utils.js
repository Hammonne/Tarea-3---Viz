// Utilidades genericas del pipeline (fetch + estado global de filtros).
// La paleta de color, el tooltip y las escalas quedan a criterio de quien
// implemente cada visualizacion (ver skill dataviz del repo / references/palette.md
// para la paleta de marca ya validada, si se quiere reusar).
const Viz = (() => {
  const state = {
    genres: null,       // null = todos
    decadeMin: null,
    decadeMax: null,
    meta: null,
  };

  function queryString() {
    const p = new URLSearchParams();
    if (state.genres && state.genres.length) p.set("genres", state.genres.join(","));
    if (state.decadeMin != null) p.set("decade_min", state.decadeMin);
    if (state.decadeMax != null) p.set("decade_max", state.decadeMax);
    return p.toString();
  }

  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return res.json();
  }

  return { state, queryString, fetchJSON };
})();
