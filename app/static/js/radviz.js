// Task A - RadViz (dimensional anchoring): firmas sonoras por genero.
const RadViz = (() => {
  let svg, gPoints, gAnchors, width, height, cx, cy, radius;
  let features = [];
  let activeFeatures = new Set();
  let tracks = [];

  function init(meta) {
    svg = d3.select("#radvizSvg");
    width = 900; height = 560;
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet");
    cx = width / 2; cy = height / 2;
    radius = Math.min(width, height) / 2 - 70;

    features = meta.features;
    activeFeatures = new Set(features);

    svg.selectAll("*").remove();
    svg.append("circle")
      .attr("cx", cx).attr("cy", cy).attr("r", radius)
      .attr("fill", "none").attr("class", "gridline");

    gAnchors = svg.append("g").attr("class", "anchors");
    gPoints = svg.append("g").attr("class", "points");

    renderLegend(meta);
  }

  function anchorPositions() {
    const n = features.length;
    return features.map((f, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      return { feature: f, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle), angle };
    });
  }

  function computeXY(row, anchors) {
    let sx = 0, sy = 0, sw = 0;
    anchors.forEach((a) => {
      if (!activeFeatures.has(a.feature)) return;
      const v = row[`${a.feature}_norm`] ?? 0;
      sx += a.x * v; sy += a.y * v; sw += v;
    });
    if (sw === 0) return { x: cx, y: cy };
    return { x: sx / sw, y: sy / sw };
  }

  function render(newTracks) {
    tracks = newTracks;
    const anchors = anchorPositions();

    const anchorSel = gAnchors.selectAll("g.anchor").data(anchors, (d) => d.feature);
    const anchorEnter = anchorSel.enter().append("g").attr("class", "anchor").style("cursor", "pointer");
    anchorEnter.append("line").attr("class", "baseline");
    anchorEnter.append("circle").attr("r", 4);
    anchorEnter.append("text").attr("class", "axis-label").attr("text-anchor", "middle");

    const anchorMerged = anchorEnter.merge(anchorSel);
    anchorMerged
      .attr("opacity", (d) => (activeFeatures.has(d.feature) ? 1 : 0.3))
      .on("click", (event, d) => {
        if (activeFeatures.has(d.feature)) {
          if (activeFeatures.size > 2) activeFeatures.delete(d.feature);
        } else {
          activeFeatures.add(d.feature);
        }
        render(tracks);
      });
    anchorMerged.select("line")
      .attr("x1", cx).attr("y1", cy).attr("x2", (d) => d.x).attr("y2", (d) => d.y);
    anchorMerged.select("circle").attr("cx", (d) => d.x).attr("cy", (d) => d.y)
      .attr("fill", (d) => (activeFeatures.has(d.feature) ? Viz.cssVar("--series-1") : Viz.cssVar("--text-muted")));
    anchorMerged.select("text")
      .attr("x", (d) => cx + (radius + 22) * Math.cos(d.angle))
      .attr("y", (d) => cy + (radius + 22) * Math.sin(d.angle))
      .text((d) => Viz.FEATURE_LABELS[d.feature]);

    const positioned = tracks.map((t) => ({ t, ...computeXY(t, anchors) }));

    const dotSel = gPoints.selectAll("circle.dot").data(positioned, (d) => d.t.id);
    const dotEnter = dotSel.enter().append("circle")
      .attr("class", "dot")
      .attr("r", 4)
      .attr("cx", cx).attr("cy", cy)
      .attr("fill", (d) => Viz.genreColor(d.t.genre_bucket))
      .attr("fill-opacity", 0.75)
      .attr("stroke", Viz.cssVar("--surface-1"))
      .attr("stroke-width", 1.5);

    dotEnter.append("title");

    dotEnter.merge(dotSel)
      .on("pointerenter", (event, d) => {
        d3.select(event.currentTarget).attr("r", 6).attr("fill-opacity", 1);
        Viz.showTooltip(event, [
          [null, d.t.name, true],
          ["Artista", d.t.main_artist],
          ["Genero", d.t.genre_bucket],
          ["Anio", d.t.year],
        ]);
      })
      .on("pointermove", Viz.moveTooltip)
      .on("pointerleave", (event) => {
        d3.select(event.currentTarget).attr("r", 4).attr("fill-opacity", 0.75);
        Viz.hideTooltip();
      })
      .transition().duration(500)
      .attr("cx", (d) => d.x).attr("cy", (d) => d.y)
      .attr("fill", (d) => Viz.genreColor(d.t.genre_bucket));

    dotSel.exit().remove();
  }

  function renderLegend(meta) {
    const panel = d3.select("#radvizLegend");
    panel.selectAll("*").remove();
    panel.append("h3").text("Genero (top 7 + Other)");
    meta.genres.forEach((g) => {
      const row = panel.append("div").attr("class", "legend-row");
      row.append("span").attr("class", "legend-row__dot")
        .style("background", Viz.genreColor(g));
      row.append("span").attr("class", "legend-row__label").text(g);
    });
    panel.append("h3").style("margin-top", "14px").text("Como leer");
    panel.append("p").text("Click en un anclaje para incluirlo/excluirlo del calculo (dimensional anchoring). Minimo 2 anclajes activos.");
  }

  return { init, render };
})();
