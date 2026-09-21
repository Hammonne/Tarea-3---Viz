// Task C - Parallel Coordinates (scaling + brushing/highlighting): la guerra del volumen.
const ParallelCoords = (() => {
  const MAX_LINES = 1500;
  let svg, gLines, gAxes, width, height, margin;
  let axesDef = []; // {key, label, x, scale, raw:boolean}
  let brushes = new Map(); // key -> [min,max] en dominio del eje
  let tracks = [];
  let colorScale;

  function init(meta) {
    svg = d3.select("#parallelSvg");
    width = 1180; height = 560;
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet");
    margin = { top: 40, right: 40, bottom: 20, left: 40 };

    const keys = ["year", ...meta.features];
    const innerW = width - margin.left - margin.right;
    axesDef = keys.map((k, i) => ({
      key: k,
      label: k === "year" ? "Year" : Viz.FEATURE_LABELS[k],
      x: margin.left + (innerW * i) / (keys.length - 1),
    }));

    colorScale = Viz.sequentialScale([meta.min_year, meta.max_year]);

    svg.selectAll("*").remove();
    gLines = svg.append("g").attr("class", "lines");
    gAxes = svg.append("g").attr("class", "axes");
  }

  function domainFor(key, allTracks) {
    if (key === "year") return d3.extent(allTracks, (d) => d.year);
    return d3.extent(allTracks, (d) => d[key]);
  }

  function render(newTracks) {
    if (newTracks) tracks = newTracks;
    if (!tracks.length) return;

    // Dominios fijos (recalculados solo cuando cambia el set de pistas, no con el brush).
    axesDef.forEach((a) => {
      a.scale = d3.scaleLinear()
        .domain(domainFor(a.key, tracks))
        .range([height - margin.bottom, margin.top])
        .nice();
    });

    const sample = tracks.length > MAX_LINES
      ? d3.shuffle(tracks.slice()).slice(0, MAX_LINES)
      : tracks;

    const lineGen = (d) => {
      const pts = axesDef.map((a) => [a.x, a.scale(d[a.key])]);
      return d3.line()(pts);
    };

    const pathSel = gLines.selectAll("path").data(sample, (d) => d.id);
    pathSel.exit().remove();
    const pathEnter = pathSel.enter().append("path")
      .attr("fill", "none")
      .attr("stroke-width", 1.2);

    pathEnter.merge(pathSel)
      .attr("d", lineGen)
      .attr("stroke", (d) => colorScale(d.year))
      .on("pointerenter", (event, d) => {
        d3.select(event.currentTarget).attr("stroke-width", 2.6).raise();
        Viz.showTooltip(event, [
          [null, d.name, true],
          ["Artista", d.main_artist],
          ["Anio", d.year],
          ["Genero", d.genre_bucket],
        ]);
      })
      .on("pointermove", Viz.moveTooltip)
      .on("pointerleave", (event) => {
        d3.select(event.currentTarget).attr("stroke-width", 1.2);
        Viz.hideTooltip();
      });

    applyBrushOpacity();
    renderAxes();
  }

  function applyBrushOpacity() {
    gLines.selectAll("path").attr("stroke-opacity", (d) => {
      for (const [key, extent] of brushes) {
        const a = axesDef.find((x) => x.key === key);
        const v = d[key];
        const [lo, hi] = [a.scale.invert(extent[1]), a.scale.invert(extent[0])];
        if (v < lo || v > hi) return 0.04;
      }
      return brushes.size ? 0.85 : 0.55;
    });
  }

  function renderAxes() {
    const axisSel = gAxes.selectAll("g.axis").data(axesDef, (d) => d.key);
    const axisEnter = axisSel.enter().append("g").attr("class", "axis");
    axisEnter.append("g").attr("class", "axis-ticks");
    axisEnter.append("text").attr("class", "axis-label").attr("text-anchor", "middle").attr("y", margin.top - 16);
    axisEnter.append("g").attr("class", "brush");

    const merged = axisEnter.merge(axisSel);
    merged.attr("transform", (d) => `translate(${d.x},0)`);
    merged.select(".axis-label").text((d) => d.label);
    merged.select(".axis-ticks").each(function (d) {
      d3.select(this).call(d3.axisLeft(d.scale).ticks(5).tickSize(4));
    });

    merged.select(".brush").each(function (d) {
      const brush = d3.brushY()
        .extent([[-8, margin.top], [8, height - margin.bottom]])
        .on("start brush end", (event) => onBrush(event, d.key));
      d3.select(this).call(brush);
    });
  }

  function onBrush(event, key) {
    if (event.selection) brushes.set(key, event.selection);
    else brushes.delete(key);
    applyBrushOpacity();
  }

  return { init, render };
})();
