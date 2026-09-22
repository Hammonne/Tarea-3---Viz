// Task 4a — PCA scatterplot colored by decade.
const Projection = (() => {
  let svg, panel, requestId = 0;

  function init() {
    svg = d3.select("#projectionSvg");
    panel = d3.select("#projectionControls");
  }

  async function render() {
    const id = ++requestId;
    svg.selectAll("*").remove();
    const { width, height } = Viz.size(svg);

    svg.append("text")
      .attr("class", "loading")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .attr("text-anchor", "middle")
      .text("Calculando PCA…");

    const result = await Viz.fetchJSON(`/api/projection?method=pca&${Viz.queryString()}`);

    // Descarta respuestas antiguas si el usuario cambió filtros rápidamente.
    if (id !== requestId) return;
    draw(result);
  }

  // Dibuja el scatterplot PCA y su panel descriptivo.
  function draw(result) {
    svg.selectAll("*").remove();
    const { width, height } = Viz.size(svg);
    const margin = { top: 55, right: 32, bottom: 55, left: 62 };

    if (!result.points.length) {
      svg.append("text")
        .attr("class", "loading")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .text("No hay suficientes canciones para calcular el PCA.");
      return;
    }

    const x = d3
      .scaleLinear()
      .domain(d3.extent(result.points, d => d.x))
      .nice()
      .range([margin.left, width - margin.right]);

    const y = d3
      .scaleLinear()
      .domain(d3.extent(result.points, d => d.y))
      .nice()
      .range([height - margin.bottom, margin.top]);

    const decades = Array.from(
      new Set(result.points.map(d => +d.decade))
    ).sort(d3.ascending);

    Viz.decadeColor.domain(d3.extent(decades));

    svg.append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x));

    svg.append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y));

    svg.append("text")
      .attr("class", "chart-title")
      .attr("x", margin.left)
      .attr("y", 25)
      .text("PCA de audio features · color por década");

    svg.append("text")
      .attr("class", "axis-title")
      .attr("x", width / 2)
      .attr("y", height - 12)
      .attr("text-anchor", "middle")
      .text(`PC1 (${d3.format(".1%")(result.explained_variance[0])})`);

    svg.append("text")
      .attr("class", "axis-title")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2)
      .attr("y", 16)
      .attr("text-anchor", "middle")
      .text(`PC2 (${d3.format(".1%")(result.explained_variance[1])})`);

    svg.append("g")
      .selectAll("circle")
      .data(result.points, d => d.id)
      .join("circle")
      .attr("class", "data-point")
      .attr("r", 2.8)
      .attr("cx", d => x(d.x))
      .attr("cy", d => y(d.y))
      .attr("fill", d => Viz.decadeColor(+d.decade))
      .on("pointermove", (event, d) => {
        Viz.showTooltip(event, [
          ["", d.name],
          ["Artista", d.main_artist],
          ["Década", `${d.decade}s`]
        ]);
      })
      .on("pointerleave", Viz.hideTooltip);

    // Estos bloques permanecen comentados para poder reactivarlos fácilmente.
    /* Visualización de centroides desactivada a pedido.
    const path = d3.line().x(d => x(d.x)).y(d => y(d.y));
    svg.append("path").datum(result.centroids).attr("class", "centroid-path").attr("d", path);
    const centroids = svg.append("g")
      .selectAll("g")
      .data(result.centroids)
      .join("g")
      .attr("transform", d => `translate(${x(d.x)},${y(d.y)})`);
    centroids.append("circle").attr("class", "centroid-dot").attr("r", 5);
    centroids.append("text")
      .attr("class", "centroid-label")
      .attr("x", 7)
      .attr("y", -7)
      .text(d => `${d.decade}s`);
    */

    /* Visualización de loadings (líneas rojas) desactivada a pedido.
    const maxLoading = d3.max(result.loadings, d => Math.hypot(d.x, d.y)) || 1;
    const loadingScale = Math.min(width, height) * 0.18 / maxLoading;
    const zeroX = x(0), zeroY = y(0);
    const loading = svg.append("g").selectAll("g").data(result.loadings).join("g");
    loading.append("line").attr("class", "loading-vector").attr("x1", zeroX).attr("y1", zeroY)
      .attr("x2", d => zeroX + d.x * loadingScale).attr("y2", d => zeroY - d.y * loadingScale);
    loading.append("text")
      .attr("class", "loading-label")
      .attr("x", d => zeroX + d.x * loadingScale * 1.08)
      .attr("y", d => zeroY - d.y * loadingScale * 1.08)
      .text(d => Viz.featureLabels[d.feature] || d.feature);
    */

    panel.selectAll("*").remove();
    panel.append("h3").text("Varianza explicada");

    const explainedPC1 = d3.format(".1%")(result.explained_variance[0]);
    const explainedPC2 = d3.format(".1%")(result.explained_variance[1]);
    panel.append("p").text(`PC1: ${explainedPC1} · PC2: ${explainedPC2}`);
    panel.append("p").text("Cada punto representa una canción y el color identifica su década.");

    const legend = panel.append("div").attr("class", "panel-section");
    legend.append("h3").text("Década");
    decades.forEach(decade => {
      const row = legend.append("div").attr("class", "legend-item");
      row.append("span")
        .attr("class", "legend-swatch")
        .style("background", Viz.decadeColor(decade));
      row.append("span").text(`${decade}s`);
    });
  }
  return { init, render };
})();
