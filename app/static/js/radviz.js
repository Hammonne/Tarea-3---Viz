// Task 2 — RadViz with interactive dimensional anchoring.
const RadViz = (() => {
  let svg, panel, features = [], active = new Set(), tracks = [], genres = [];

  function init(meta) {
    svg = d3.select("#radvizSvg");
    panel = d3.select("#radvizLegend");
    features = meta.features;
    genres = meta.genres;
    active = new Set(features);
    Viz.genreColors.domain(genres);
    drawPanel();
  }

  // Panel lateral: permite activar dimensiones y mantiene la leyenda de género.
  function drawPanel() {
    panel.selectAll("*").remove();
    panel.append("h3").text("Anclajes activos");
    panel.append("p").text(
      "Haz clic en un anclaje del gráfico o en esta lista. Deben quedar al menos dos."
    );
    panel
      .selectAll("button.anchor-toggle")
      .data(features)
      .join("button")
      .attr("class", d => `anchor-toggle ${active.has(d) ? "active" : ""}`)
      .text(d => Viz.featureLabels[d] || d)
      .on("click", (_, d) => toggle(d));

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
  function draw() {
    svg.selectAll("*").remove();
    const { width, height } = Viz.size(svg);
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.37;

    // Los anclajes conservan su ángulo aunque se desactiven. Así la geometría
    // no salta de forma arbitraria al comparar distintas combinaciones.
    const anchors = features.map((feature, i) => {
      const angle = -Math.PI / 2 + i * 2 * Math.PI / features.length;
      return { feature, x: Math.cos(angle), y: Math.sin(angle), enabled: active.has(feature) };
    });
    const enabled = anchors.filter(a => a.enabled);
    const g = svg.append("g").attr("transform", `translate(${cx},${cy})`);
    g.append("circle").attr("r", radius).attr("class", "radviz-boundary");

    const coords = tracks.map(d => {
      let sx = 0, sy = 0, total = 0;
      enabled.forEach(a => {
        const value = +d[`${a.feature}_norm`] || 0;
        sx += a.x * value;
        sy += a.y * value;
        total += value;
      });
      return { d, x: total ? sx / total : 0, y: total ? sy / total : 0 };
    });
    g.selectAll(".radviz-point")
      .data(coords, point => point.d.id)
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
      .data(anchors)
      .join("g")
      .attr("class", d => `radviz-anchor ${d.enabled ? "active" : "inactive"}`)
      .attr("transform", d => `translate(${d.x * radius},${d.y * radius})`)
      .on("click", (_, d) => toggle(d.feature));

    anchor.append("circle").attr("r", 8);

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
  }

  function render(data) {
    tracks = data;
    draw();
  }

  return { init, render };
})();
