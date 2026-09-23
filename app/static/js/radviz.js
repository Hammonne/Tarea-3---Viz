// Task 2 — RadViz with interactive dimensional anchoring + movable anchors.
const RadViz = (() => {
  let svg, panel, features = [], active = new Set(), tracks = [], genres = [];
  let axes = [];               // {feature, x, y} — persiste entre redraws/drags
  let npSampleIdx = [];        // submuestra fija para Neighborhood Preservation
  let npOriginalNN = null;     // kNN en el espacio original (9 features _norm)
  let lastCoords = [];         // coords proyectadas de la última draw(), alineadas con `tracks`
  let npAnchorNode = null;     // <div> del panel donde se inserta el badge/tabla NP
  let initialized = false;     // true tras aplicar los ejes Germain iniciales (una sola vez)

  const NP_K = 10;
  const COMPARISON_KS = [5, 10, 20];

  function init(meta) {
    svg = d3.select("#radvizSvg");
    panel = d3.select("#radvizLegend");
    features = meta.features;
    genres = meta.genres;
    active = new Set(features);
    axes = defaultAxes();
    Viz.genreColors.domain(genres);
    drawPanel();
  }

  function defaultAxes() {
    return features.map((feature, i) => {
      const angle = -Math.PI / 2 + i * 2 * Math.PI / features.length;
      return { feature, x: Math.cos(angle), y: Math.sin(angle) };
    });
  }

  // RadViz clásico: los anclajes viven SIEMPRE sobre el círculo unitario
  // (nunca dentro ni fuera), a diferencia de Star Coordinates. Los ejes
  // Germain traen magnitud variable (el "peso" de t-SNE); aquí se descarta
  // esa magnitud y sólo se conserva el ángulo.
  function toCircle(axesArr) {
    return axesArr.map(a => {
      const len = Math.hypot(a.x, a.y) || 1;
      return { feature: a.feature, x: a.x / len, y: a.y / len };
    });
  }

  // Panel lateral: activar/desactivar dimensiones, mover ejes, y métricas NP.
  function drawPanel() {
    panel.selectAll("*").remove();
    panel.append("h3").text("Anclajes activos");
    panel.append("p").text(
      "Los ejes ya inician en la posición que maximiza Neighborhood Preservation (algoritmo Germain). Haz clic en un anclaje para activar/desactivar (mínimo dos), o arrástralo sobre el perímetro del círculo (RadViz clásico no usa peso, a diferencia de Star Coordinates)."
    );
    panel
      .selectAll("button.anchor-toggle")
      .data(features)
      .join("button")
      .attr("class", d => `anchor-toggle ${active.has(d) ? "active" : ""}`)
      .text(d => Viz.featureLabels[d] || d)
      .on("click", (_, d) => toggle(d));

    const controls = panel.append("div").attr("class", "panel-section");
    controls
      .append("button")
      .attr("class", "control-button")
      .text("Restablecer ejes")
      .on("click", () => { axes = defaultAxes(); draw(); });
    controls
      .append("button")
      .attr("class", "control-button")
      .text("Ejes Germain (t-SNE transpuesta)")
      .on("click", applyGermain);

    npAnchorNode = panel.append("div").attr("class", "np-panel-anchor").node();

    const section = panel.append("div").attr("class", "panel-section");
    section.append("h3").text("Género");
    genres.forEach(label => {
      const row = section.append("div").attr("class", "legend-item");
      row.append("span").attr("class", "legend-swatch").style("background", Viz.genreColors(label));
      row.append("span").text(label);
    });
  }

  // RadViz no está definido con menos de dos anclajes.
  function toggle(feature) {
    if (active.has(feature)) {
      if (active.size <= 2) return;
      active.delete(feature);
    } else {
      active.add(feature);
    }
    drawPanel();
    draw();
  }

  // Posición RadViz = promedio de anclajes ponderado por cada audio feature.
  // A diferencia de Star Coordinates (donde arrastrar cambia dirección Y
  // peso), en RadViz clásico los anclajes viven SIEMPRE sobre el perímetro
  // del círculo unitario, sin excepción: ni el drag manual ni los ejes
  // Germain (ver toCircle()) les dejan tener magnitud distinta de 1. Sólo
  // el ángulo es un grado de libertad.
  function draw() {
    svg.selectAll("*").remove();
    const { width, height } = Viz.size(svg);
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.37;

    const enabled = axes.filter(a => active.has(a.feature));
    const g = svg.append("g").attr("transform", `translate(${cx},${cy})`);
    g.append("circle").attr("r", radius).attr("class", "radviz-boundary");

    lastCoords = Metrics.projectPoints(tracks, enabled, true).map(([x, y], i) => ({ d: tracks[i], x, y }));

    const points = g.selectAll(".radviz-point")
      .data(lastCoords, point => point.d.id)
      .join("circle")
      .attr("class", "data-point radviz-point")
      .attr("r", 2.7)
      .attr("cx", point => point.x * radius)
      .attr("cy", point => point.y * radius)
      .attr("fill", p => Viz.genreColors(p.d.genre_bucket))
      .on("pointermove", (event, point) => Viz.trackTooltip(event, point.d))
      .on("pointerleave", Viz.hideTooltip);

    const anchor = g
      .selectAll(".radviz-anchor")
      .data(axes, d => d.feature)
      .join("g")
      .attr("class", d => `radviz-anchor ${active.has(d.feature) ? "active" : "inactive"}`)
      .attr("transform", d => `translate(${d.x * radius},${d.y * radius})`);

    anchor.append("circle")
      .attr("class", "axis-handle")
      .attr("r", 8)
      // container() fijo en `g` (el grupo centrado, sin transform propio por
      // anclaje): cada `anchor` sí tiene su propio transform de posición, así
      // que sin esto event.x/y quedarían relativos a esa posición en vez del
      // centro del círculo. subject() explícito por la misma razón de fondo:
      // d.x/d.y viven en escala unitaria (-1..1), no en píxeles — sin decirle
      // a d3.drag cuál es la posición inicial real en píxeles, suma el
      // desplazamiento del mouse sobre ese valor casi-cero y el anclaje
      // "vuela" de forma desproporcionada al mínimo gesto.
      .call(d3.drag()
        .container(() => g.node())
        .subject((event, d) => ({ x: d.x * radius, y: d.y * radius }))
        .on("drag", (event, d) => {
        const angle = Math.atan2(event.y, event.x);
        d.x = Math.cos(angle);
        d.y = Math.sin(angle);
        redrawLive();
      }).on("end", () => { draw(); updateNPBadge(); }))
      .on("click", (event, d) => { event.stopPropagation(); toggle(d.feature); });

    anchor
      .append("text")
      .attr("class", "axis-label")
      .attr("x", d => d.x > 0.15 ? 13 : d.x < -0.15 ? -13 : 0)
      .attr("y", d => d.y > 0.15 ? 18 : d.y < -0.15 ? -12 : 4)
      .attr("text-anchor", d => d.x > 0.15 ? "start" : d.x < -0.15 ? "end" : "middle")
      .text(d => Viz.featureLabels[d.feature] || d.feature);

    svg
      .append("text")
      .attr("class", "chart-note")
      .attr("x", 18)
      .attr("y", 26)
      .text([
        `${active.size}/${features.length} dimensiones activas`,
        `${tracks.length.toLocaleString("es")} canciones`
      ].join(" · "));

    // Movimiento en vivo durante el drag: recoloca puntos y el eje que se
    // arrastra sin rehacer todo el DOM (el NP se recalcula solo al soltar).
    function redrawLive() {
      anchor.attr("transform", d => `translate(${d.x * radius},${d.y * radius})`);
      const enabledNow = axes.filter(a => active.has(a.feature));
      const moved = Metrics.projectPoints(tracks, enabledNow, true);
      points.data(moved.map(([x, y], i) => ({ d: tracks[i], x, y })), p => p.d.id)
        .attr("cx", p => p.x * radius)
        .attr("cy", p => p.y * radius);
    }

    updateNPBadge();
  }

  // --- Neighborhood Preservation ---------------------------------------

  function rebuildOriginalNN() {
    npSampleIdx = Metrics.subsampleIndices(tracks.length);
    const original = npSampleIdx.map(i => features.map(f => +tracks[i][`${f}_norm`] || 0));
    npOriginalNN = Metrics.kNN(original, Metrics.NP_MAX_K);
  }

  function updateNPBadge() {
    if (!npOriginalNN || !npSampleIdx.length) return;
    const projSample = npSampleIdx.map(i => [lastCoords[i].x, lastCoords[i].y]);
    const projNN = Metrics.kNN(projSample, NP_K);
    const np = Metrics.npAtK(npOriginalNN, projNN, NP_K);
    Metrics.renderNPBadge(
      npAnchorNode,
      `Neighborhood Preservation (k=${NP_K}): ${np.toFixed(3)} — vs. las ${features.length} audio features originales`
    );
  }

  // Recalcula ejes con el algoritmo Germain (transpuesta + t-SNE) y muestra
  // una tabla NP "ejes por defecto vs. ejes Germain" para varios k.
  function applyGermain() {
    const npRows = npSampleIdx.map(i => tracks[i]);
    const defaultProj = Metrics.projectPoints(npRows, defaultAxes().filter(a => active.has(a.feature)), true);

    axes = toCircle(Metrics.germainAxes(tracks, features, npSampleIdx));
    draw();

    const germainProj = npSampleIdx.map(i => [lastCoords[i].x, lastCoords[i].y]);
    const series = [
      { name: "Por defecto", origNN: npOriginalNN, projNN: Metrics.kNN(defaultProj, Metrics.NP_MAX_K) },
      { name: "Germain", origNN: npOriginalNN, projNN: Metrics.kNN(germainProj, Metrics.NP_MAX_K) }
    ];
    Metrics.renderNPTable(npAnchorNode, COMPARISON_KS, series);
  }

  function render(data) {
    tracks = data;
    rebuildOriginalNN();
    // Arranca directamente en las posiciones que maximizan NP (algoritmo
    // Germain), no en los ángulos equiespaciados arbitrarios. Sólo se hace
    // una vez: si el usuario luego filtra por género/década, sus ejes
    // (arrastrados o no) se conservan — el botón "Ejes Germain" sigue
    // disponible para re-optimizar contra el subconjunto filtrado.
    if (!initialized) {
      axes = toCircle(Metrics.germainAxes(tracks, features, npSampleIdx));
      initialized = true;
    }
    draw();
  }

  return { init, render };
})();
