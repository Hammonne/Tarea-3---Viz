const Viz = (() => {
  // Estado compartido por los filtros y todas las visualizaciones.
  const state = { genres: null, decadeMin: null, decadeMax: null, meta: null };

  // Las escalas se comparten para mantener colores consistentes entre tabs.
  const genreColors = d3.scaleOrdinal(d3.schemeTableau10);
  const decadeColor = d3.scaleSequential(d3.interpolateViridis);

  const featureLabels = {
    valence: "Valence",
    energy: "Energy",
    danceability: "Danceability",
    acousticness: "Acousticness", instrumentalness: "Instrumentalness",
    liveness: "Liveness",
    speechiness: "Speechiness",
    loudness: "Loudness",
    tempo: "Tempo"
  };

  // Traduce el estado global a los parámetros aceptados por la API.
  function queryString() {
    const p = new URLSearchParams();
    if (state.genres?.length) p.set("genres", state.genres.join(","));
    if (state.decadeMin != null) p.set("decade_min", state.decadeMin);
    if (state.decadeMax != null) p.set("decade_max", state.decadeMax);
    return p.toString();
  }

  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    return res.json();
  }

  function size(svg, fallbackHeight = 560) {
    const node = svg.node();
    const width = Math.max(640, node.clientWidth || 900);
    const height = node.clientHeight || fallbackHeight;
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    return { width, height };
  }

  // El tooltip se construye con text(), nunca con HTML recibido del dataset.
  function showTooltip(event, rows) {
    const tip = d3.select("#vizTooltip");
    tip.selectAll("*").remove();
    rows.forEach(([label, value], i) => {
      const line = tip.append("div");
      if (i === 0) line.attr("class", "tooltip__title");
      line.append("span").text(label ? `${label}: ` : "");
      line.append("strong").text(value ?? "—");
    });
    tip
      .classed("visible", true)
      .style("left", `${event.clientX + 14}px`)
      .style("top", `${event.clientY + 14}px`);
  }

  function hideTooltip() {
    d3.select("#vizTooltip").classed("visible", false);
  }

  function trackTooltip(event, d) {
    showTooltip(event, [
      ["", d.name],
      ["Artista", d.main_artist],
      ["Año", d.year],
      ["Género", d.genre_bucket],
      ["Popularidad", d.popularity]
    ]);
  }

  function legend(container, title, entries) {
    const root = d3.select(container);
    root.selectAll("*").remove();
    root.append("h3").text(title);
    const items = root
      .selectAll(".legend-item")
      .data(entries)
      .join("div")
      .attr("class", "legend-item");
    items.append("span").attr("class", "legend-swatch").style("background", d => d.color);
    items.append("span").text(d => d.label);
  }

  return {
    state,
    queryString,
    fetchJSON,
    size,
    showTooltip,
    hideTooltip,
    trackTooltip,
    legend,
    genreColors,
    decadeColor,
    featureLabels
  };
})();
