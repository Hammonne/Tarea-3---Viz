// Task D - Proyeccion PCA/t-SNE: linea de tiempo sonora + paradoja de la popularidad.
const Projection = (() => {
  let svg, gPoints, gCentroids, gLoadings, xScale, yScale, width, height, margin;
  let method = "pca";
  let colorBy = "decade";
  let onlyTopHits = false;
  let meta;

  function init(m) {
    meta = m;
    svg = d3.select("#projectionSvg");
    width = 900; height = 560;
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet");
    margin = { top: 20, right: 20, bottom: 20, left: 20 };

    svg.selectAll("*").remove();
    const defs = svg.append("defs");
    defs.append("marker").attr("id", "arrow").attr("viewBox", "0 0 10 10")
      .attr("refX", 8).attr("refY", 5).attr("markerWidth", 7).attr("markerHeight", 7)
      .attr("orient", "auto-start-reverse")
      .append("path").attr("d", "M0,0L10,5L0,10Z").attr("fill", Viz.cssVar("--text-primary")).attr("fill-opacity", 0.55);

    gPoints = svg.append("g");
    gLoadings = svg.append("g");
    gCentroids = svg.append("g");

    renderControls();
    load();
  }

  async function load() {
    const qs = Viz.queryString();
    const url = `/api/projection?method=${method}${qs ? "&" + qs : ""}`;
    const data = await Viz.fetchJSON(url);
    renderData(data);
  }

  function renderData(data) {
    let points = data.points;
    if (onlyTopHits) points = points.filter((p) => p.popularity_pct_in_year >= 0.95);
    if (!points.length) return;

    const xExtent = d3.extent(points, (d) => d.x);
    const yExtent = d3.extent(points, (d) => d.y);
    xScale = d3.scaleLinear().domain(xExtent).nice().range([margin.left + 20, width - margin.right - 20]);
    yScale = d3.scaleLinear().domain(yExtent).nice().range([height - margin.bottom - 20, margin.top + 20]);

    const colorScale = colorBy === "decade"
      ? Viz.sequentialScale([meta.min_year, meta.max_year])
      : Viz.sequentialScale([0, 1]);

    const dotSel = gPoints.selectAll("circle.dot").data(points, (d) => d.id);
    dotSel.exit().remove();
    const dotEnter = dotSel.enter().append("circle")
      .attr("class", "dot").attr("r", 4)
      .attr("stroke", Viz.cssVar("--surface-1")).attr("stroke-width", 1.2)
      .attr("fill-opacity", 0.45);

    dotEnter.merge(dotSel)
      .transition().duration(400)
      .attr("cx", (d) => xScale(d.x)).attr("cy", (d) => yScale(d.y))
      .attr("fill", (d) => colorBy === "decade" ? colorScale(d.decade) : colorScale(d.popularity_pct_in_year ?? 0));

    gPoints.selectAll("circle.dot")
      .on("pointerenter", (event, d) => {
        d3.select(event.currentTarget).attr("r", 6.5).attr("fill-opacity", 1).raise();
        Viz.showTooltip(event, [
          [null, d.name, true],
          ["Artista", d.main_artist],
          ["Decada", d.decade + "s"],
          ["Genero", d.genre_bucket],
          ["Percentil popularidad (su anio)", d.popularity_pct_in_year != null ? (d.popularity_pct_in_year * 100).toFixed(0) + "%" : "n/a"],
        ]);
      })
      .on("pointermove", Viz.moveTooltip)
      .on("pointerleave", (event) => {
        d3.select(event.currentTarget).attr("r", 4).attr("fill-opacity", 0.75);
        Viz.hideTooltip();
      });

    renderCentroids(data.centroids || []);
    renderLoadings(data.loadings || []);
    renderVarianceInfo(data.explained_variance || []);
  }

  function renderCentroids(centroids) {
    gCentroids.selectAll("*").remove();
    if (!centroids.length || !xScale) return;
    const line = d3.line().x((d) => xScale(d.x)).y((d) => yScale(d.y)).curve(d3.curveCatmullRom);
    gCentroids.append("path")
      .datum(centroids)
      .attr("d", line)
      .attr("fill", "none")
      .attr("stroke", Viz.cssVar("--text-primary"))
      .attr("stroke-width", 2.5)
      .attr("stroke-opacity", 0.55)
      .attr("marker-end", "url(#arrow)");

    gCentroids.selectAll("circle.centroid").data(centroids).enter().append("circle")
      .attr("class", "centroid")
      .attr("cx", (d) => xScale(d.x)).attr("cy", (d) => yScale(d.y))
      .attr("r", 7).attr("fill", Viz.cssVar("--text-primary"))
      .attr("stroke", Viz.cssVar("--surface-1")).attr("stroke-width", 2);

    gCentroids.selectAll("text.centroid-label").data(centroids).enter().append("text")
      .attr("class", "centroid-label")
      .attr("x", (d) => xScale(d.x)).attr("y", (d) => yScale(d.y) - 10)
      .attr("text-anchor", "middle").attr("fill", Viz.cssVar("--text-primary"))
      .style("font-size", "10px").style("font-weight", 600)
      .text((d) => d.decade + "s");
  }

  function renderLoadings(loadings) {
    gLoadings.selectAll("*").remove();
    if (!loadings.length || !xScale) return;
    const cx = xScale(0), cy = yScale(0);
    const k = 90;
    loadings.forEach((l) => {
      gLoadings.append("line")
        .attr("x1", cx).attr("y1", cy)
        .attr("x2", cx + l.x * k).attr("y2", cy + l.y * k)
        .attr("stroke", Viz.cssVar("--text-muted")).attr("stroke-dasharray", "3,3");
      gLoadings.append("text")
        .attr("x", cx + l.x * k * 1.15).attr("y", cy + l.y * k * 1.15)
        .attr("fill", Viz.cssVar("--text-muted")).style("font-size", "9.5px")
        .attr("text-anchor", "middle")
        .text(Viz.FEATURE_LABELS[l.feature]);
    });
  }

  function renderVarianceInfo(ev) {
    d3.select("#pcaVariance").text(
      ev.length ? `PC1 explica ${(ev[0] * 100).toFixed(1)}% · PC2 explica ${(ev[1] * 100).toFixed(1)}%` : ""
    );
  }

  function renderControls() {
    const panel = d3.select("#projectionControls");
    panel.selectAll("*").remove();

    panel.append("h3").text("Metodo");
    const sel = panel.append("select").attr("id", "projMethod");
    sel.append("option").attr("value", "pca").text("PCA (respeta filtros)");
    sel.append("option").attr("value", "tsne").text("t-SNE (muestra fija, 1500 pistas)");
    sel.on("change", (event) => { method = event.target.value; load(); });

    panel.append("p").attr("id", "pcaVariance").style("margin-top", "6px");

    panel.append("h3").style("margin-top", "14px").text("Color");
    const r1 = panel.append("div").attr("class", "radio-row");
    r1.append("input").attr("type", "radio").attr("name", "projColor").attr("id", "pcDecade").attr("checked", true)
      .on("change", () => { colorBy = "decade"; load(); });
    r1.append("label").attr("for", "pcDecade").text("Decada");
    const r2 = panel.append("div").attr("class", "radio-row");
    r2.append("input").attr("type", "radio").attr("name", "projColor").attr("id", "pcPop")
      .on("change", () => { colorBy = "popularity"; load(); });
    r2.append("label").attr("for", "pcPop").text("Percentil popularidad");

    panel.append("h3").style("margin-top", "14px").text("Paradoja de popularidad");
    const r3 = panel.append("div").attr("class", "radio-row");
    r3.append("input").attr("type", "checkbox").attr("id", "pcTopHits")
      .on("change", (event) => { onlyTopHits = event.target.checked; load(); });
    r3.append("label").attr("for", "pcTopHits").text("Solo top 5% popularidad de su anio");

    panel.append("h3").style("margin-top", "14px").text("Como leer");
    panel.append("p").text("La linea conecta los centroides de cada decada (trayectoria sonora). Las lineas punteadas son los vectores (loadings) de cada rasgo original sobre el plano PCA.");
  }

  function refresh() { load(); }

  return { init, render: refresh };
})();
