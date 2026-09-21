// Task B - Star Coordinates (axis weighting via drag): detector de genero-bender.
const StarCoords = (() => {
  let svg, gAxes, gPoints, width, height, cx, cy, plotRadius;
  let features = [];
  let axes = []; // {feature, angle, weight, x, y} extremo actual del eje (drag)
  let tracks = [];
  let colorMode = "genre"; // "genre" | "anomaly"
  let anomalyScale = null;

  function init(meta) {
    svg = d3.select("#starSvg");
    width = 900; height = 560;
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet");
    cx = width / 2; cy = height / 2;
    plotRadius = Math.min(width, height) / 2 - 70;

    features = meta.features;
    axes = features.map((f, i) => {
      const angle = (2 * Math.PI * i) / features.length - Math.PI / 2;
      return { feature: f, angle, weight: 1 };
    });

    svg.selectAll("*").remove();
    svg.append("circle").attr("cx", cx).attr("cy", cy).attr("r", plotRadius)
      .attr("fill", "none").attr("class", "gridline");

    gAxes = svg.append("g");
    gPoints = svg.append("g");

    renderControls();
  }

  function axisTip(a) {
    return { x: cx + plotRadius * a.weight * Math.cos(a.angle), y: cy + plotRadius * a.weight * Math.sin(a.angle) };
  }

  function rawXY(row) {
    let x = 0, y = 0;
    axes.forEach((a) => {
      const v = row[`${a.feature}_norm`] ?? 0;
      x += v * a.weight * Math.cos(a.angle);
      y += v * a.weight * Math.sin(a.angle);
    });
    return { x, y };
  }

  function render(newTracks) {
    if (newTracks) tracks = newTracks;
    if (!tracks.length) return;

    // Auto-fit: escala global para que el punto mas lejano quede dentro de plotRadius.
    const raw = tracks.map((t) => ({ t, ...rawXY(t) }));
    const maxDist = d3.max(raw, (d) => Math.hypot(d.x, d.y)) || 1;
    const scale = plotRadius / maxDist;
    const positioned = raw.map((d) => ({ t: d.t, x: cx + d.x * scale, y: cy + d.y * scale }));

    if (colorMode === "anomaly") {
      anomalyScale = Viz.aquaSequentialScale([0, 1]);
    }

    const axisSel = gAxes.selectAll("g.axis").data(axes, (d) => d.feature);
    const axisEnter = axisSel.enter().append("g").attr("class", "axis");
    axisEnter.append("line").attr("class", "baseline");
    axisEnter.append("circle").attr("r", 6).attr("fill", Viz.cssVar("--series-1")).style("cursor", "grab");
    axisEnter.append("text").attr("class", "axis-label").attr("text-anchor", "middle");

    const axisMerged = axisEnter.merge(axisSel);
    axisMerged.each(function (d) {
      const tip = axisTip(d);
      const g = d3.select(this);
      g.select("line").attr("x1", cx).attr("y1", cy).attr("x2", tip.x).attr("y2", tip.y);
      g.select("circle").attr("cx", tip.x).attr("cy", tip.y)
        .call(d3.drag().on("drag", (event) => {
          const dx = event.x - cx, dy = event.y - cy;
          d.angle = Math.atan2(dy, dx);
          d.weight = Math.max(0.15, Math.min(2, Math.hypot(dx, dy) / plotRadius));
          render();
        }));
      g.select("text")
        .attr("x", cx + (plotRadius * d.weight + 22) * Math.cos(d.angle))
        .attr("y", cy + (plotRadius * d.weight + 22) * Math.sin(d.angle))
        .text(`${Viz.FEATURE_LABELS[d.feature]} (${d.weight.toFixed(2)}x)`);
    });

    const dotSel = gPoints.selectAll("circle.dot").data(positioned, (d) => d.t.id);
    const dotEnter = dotSel.enter().append("circle")
      .attr("class", "dot").attr("r", 4)
      .attr("stroke", Viz.cssVar("--surface-1")).attr("stroke-width", 1.5)
      .attr("fill-opacity", 0.75);

    const merged = dotEnter.merge(dotSel);
    merged
      .attr("cx", (d) => d.x).attr("cy", (d) => d.y)
      .attr("fill", (d) => colorFor(d.t))
      .on("pointerenter", (event, d) => {
        d3.select(event.currentTarget).attr("r", 6).attr("fill-opacity", 1);
        Viz.showTooltip(event, [
          [null, d.t.name, true],
          ["Artista", d.t.main_artist],
          ["Genero", d.t.genre_bucket],
          ["Distancia a centroide", d.t.anomaly_score_norm != null ? d.t.anomaly_score_norm.toFixed(3) : "n/a"],
        ]);
      })
      .on("pointermove", Viz.moveTooltip)
      .on("pointerleave", (event) => {
        d3.select(event.currentTarget).attr("r", 4).attr("fill-opacity", 0.75);
        Viz.hideTooltip();
      });

    dotSel.exit().remove();
  }

  function colorFor(t) {
    if (colorMode === "anomaly") {
      if (t.anomaly_score_norm == null) return Viz.cssVar("--text-muted");
      return anomalyScale(t.anomaly_score_norm);
    }
    return Viz.genreColor(t.genre_bucket);
  }

  function renderControls() {
    const panel = d3.select("#starControls");
    panel.selectAll("*").remove();
    panel.append("h3").text("Color");
    const row1 = panel.append("div").attr("class", "radio-row");
    row1.append("input").attr("type", "radio").attr("name", "starColor").attr("id", "starColorGenre").attr("checked", true)
      .on("change", () => { colorMode = "genre"; render(); });
    row1.append("label").attr("for", "starColorGenre").text("Genero");
    const row2 = panel.append("div").attr("class", "radio-row");
    row2.append("input").attr("type", "radio").attr("name", "starColor").attr("id", "starColorAnomaly")
      .on("change", () => { colorMode = "anomaly"; render(); });
    row2.append("label").attr("for", "starColorAnomaly").text("Distancia a centroide de genero");

    panel.append("h3").style("margin-top", "14px").text("Como leer");
    panel.append("p").text("Arrastra el punto azul al final de cada eje para cambiar su peso y direccion. Los puntos se reescalan automaticamente (auto-fit).");

    const reset = panel.append("button").attr("class", "btn-ghost").style("margin-top", "8px").text("Reset ejes");
    reset.on("click", () => {
      axes.forEach((a, i) => { a.angle = (2 * Math.PI * i) / features.length - Math.PI / 2; a.weight = 1; });
      render();
    });
  }

  return { init, render };
})();
