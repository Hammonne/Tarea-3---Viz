// Utilidades compartidas: paleta (skill dataviz), tooltip, estado global, fetch.
const Viz = (() => {
  const SERIES_VARS = ["--series-1", "--series-2", "--series-3", "--series-4",
                        "--series-5", "--series-6", "--series-7"];

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // Orden fijo de anclaje genero -> slot categorico (nunca se reasigna al filtrar).
  let genreColorMap = null;
  function buildGenreColors(genres) {
    genreColorMap = new Map();
    const real = genres.filter((g) => g !== "Other");
    real.forEach((g, i) => genreColorMap.set(g, cssVar(SERIES_VARS[i % SERIES_VARS.length])));
    genreColorMap.set("Other", cssVar("--series-other"));
    return genreColorMap;
  }
  function genreColor(g) {
    if (!genreColorMap) return cssVar("--text-muted");
    return genreColorMap.get(g) || cssVar("--series-other");
  }

  // Rampa secuencial de un solo tono (azul) para magnitudes ordenadas (decada, percentil).
  const BLUE_STOPS = [cssVar("--seq-100"), cssVar("--seq-200"), cssVar("--seq-300"),
                       cssVar("--seq-400"), cssVar("--seq-500"), cssVar("--seq-600"), cssVar("--seq-700")];
  function sequentialScale(domain) {
    return d3.scaleSequential().domain(domain).interpolator(d3.interpolateRgbBasis(BLUE_STOPS));
  }
  // Segundo contexto secuencial (anomaly score) -> siguiente slot categorico (aqua), rampa propia.
  function aquaSequentialScale(domain) {
    const aqua = cssVar("--series-2");
    return d3.scaleSequential().domain(domain).interpolator(d3.interpolateRgb("#eafaf3", aqua));
  }

  // ---- Tooltip compartido (una sola instancia, textContent siempre) ----
  const tooltipEl = document.getElementById("tooltip");
  function showTooltip(event, rows) {
    tooltipEl.innerHTML = "";
    rows.forEach(([label, value, strong]) => {
      const row = document.createElement("div");
      if (strong) {
        const s = document.createElement("strong");
        s.textContent = value;
        row.appendChild(s);
      } else {
        const l = document.createElement("span");
        l.textContent = label + ": ";
        const v = document.createElement("span");
        v.className = "tooltip__value";
        v.textContent = value;
        row.appendChild(l);
        row.appendChild(v);
      }
      tooltipEl.appendChild(row);
    });
    tooltipEl.hidden = false;
    moveTooltip(event);
  }
  function moveTooltip(event) {
    const pad = 14;
    let x = event.clientX + pad;
    let y = event.clientY + pad;
    if (x + 240 > window.innerWidth) x = event.clientX - 240 - pad;
    if (y + 100 > window.innerHeight) y = event.clientY - 100 - pad;
    tooltipEl.style.left = x + "px";
    tooltipEl.style.top = y + "px";
  }
  function hideTooltip() { tooltipEl.hidden = true; }

  // ---- Estado global compartido entre vistas (filtros) ----
  const state = {
    genres: null,       // null = todos
    decadeMin: null,
    decadeMax: null,
    meta: null,
    listeners: [],
  };
  function onFilterChange(fn) { state.listeners.push(fn); }
  function emitFilterChange() { state.listeners.forEach((fn) => fn()); }

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

  const FEATURE_LABELS = {
    valence: "Valence", energy: "Energy", danceability: "Danceability",
    acousticness: "Acousticness", instrumentalness: "Instrumentalness",
    liveness: "Liveness", speechiness: "Speechiness", loudness: "Loudness",
    tempo: "Tempo", duration_ms: "Duration", popularity: "Popularity",
  };

  return {
    buildGenreColors, genreColor, sequentialScale, aquaSequentialScale,
    showTooltip, moveTooltip, hideTooltip, cssVar,
    state, onFilterChange, emitFilterChange, queryString, fetchJSON, FEATURE_LABELS,
  };
})();
