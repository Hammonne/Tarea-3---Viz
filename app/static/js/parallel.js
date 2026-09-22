// Task 4b — Parallel Coordinates with per-axis scaling, inversion and brushing.
const ParallelCoords = (() => {
  let svg, features = [], tracks = [], normalized = false, dimensionOrder = [];
  const inverted = new Set();
  const selections = new Map();

  function init(meta) {
    svg = d3.select("#parallelSvg");
    features = meta.features;
    dimensionOrder = ["year", ...features];
  }

  // Redibuja por completo para mantener sincronizados escalas, ejes y brushes.
  function draw() {
    svg.selectAll("*").remove();
    const { width, height } = Viz.size(svg, 600);
    const margin = { top: 78, right: 34, bottom: 35, left: 48 };
    const dims = dimensionOrder.slice();
    const innerH = height - margin.top - margin.bottom;
    const x = d3
      .scalePoint()
      .domain(dims)
      .range([margin.left, width - margin.right])
      .padding(0.25);

    // Cada dimensión tiene su propia escala vertical.
    const scales = {};
    dims.forEach(dim => {
      const key = normalized && dim !== "year" ? `${dim}_norm` : dim;
      const domain = normalized && dim !== "year" ? [0, 1] : d3.extent(tracks, d => +d[key]);

      scales[dim] = d3
        .scaleLinear()
        .domain(inverted.has(dim) ? domain.slice().reverse() : domain)
        .nice()
        .range([margin.top + innerH, margin.top]);
    });

    const line = d3.line();
    const dragPositions = new Map();
    const position = dim => dragPositions.has(dim) ? dragPositions.get(dim) : x(dim);

    const valueFor = (track, dim) => {
      const key = normalized && dim !== "year" ? `${dim}_norm` : dim;
      return +track[key];
    };

    const path = track => line(
      dims.map(dim => [position(dim), scales[dim](valueFor(track, dim))])
    );

    Viz.decadeColor.domain(d3.extent(tracks, d => +d.decade));

    svg.append("text")
      .attr("class", "chart-title")
      .attr("x", margin.left)
      .attr("y", 27)
      .text("Parallel Coordinates · audio features por década");

    svg.append("text")
      .attr("class", "chart-note")
      .attr("x", margin.left)
      .attr("y", 49)
      .text([
        "Brush vertical para filtrar",
        "arrastra el nombre para mover el eje",
        "clic para invertirlo"
      ].join(" · "));

    // Botón SVG para alternar entre unidades originales y valores [0, 1].
    const toggle = svg
      .append("g")
      .attr("class", "svg-button")
      .attr("transform", `translate(${width - 188},18)`)
      .on("click", () => {
        normalized = !normalized;
        selections.clear();
        draw();
      });

    toggle.append("rect").attr("width", 170).attr("height", 30).attr("rx", 6);
    toggle.append("text")
      .attr("x", 85)
      .attr("y", 20)
      .attr("text-anchor", "middle")
      .text(normalized ? "Escala normalizada [0,1]" : "Escalas originales");

    const lines = svg
      .append("g")
      .attr("class", "parallel-lines")
      .selectAll("path")
      .data(tracks, d => d.id)
      .join("path")
      .attr("d", path)
      .attr("stroke", d => Viz.decadeColor(+d.decade));

    // Una canción permanece resaltada sólo si satisface todos los brushes.
    function updateHighlight() {
      lines.classed("muted", d => {
        for (const [dim, range] of selections) {
          const py = scales[dim](valueFor(d, dim));
          if (py < range[0] || py > range[1]) return true;
        }
        return false;
      });
      const selected = tracks.filter(d => {
        for (const [dim, range] of selections) {
          const py = scales[dim](valueFor(d, dim));
          if (py < range[0] || py > range[1]) return false;
        }
        return true;
      }).length;
      const message = selections.size
        ? `${selected.toLocaleString("es")} seleccionadas`
        : `${tracks.length.toLocaleString("es")} canciones`;
      count.text(message);
    }

    const axes = svg
      .append("g")
      .selectAll(".parallel-axis")
      .data(dims)
      .join("g")
      .attr("class", "parallel-axis")
      .attr("transform", d => `translate(${x(d)},0)`);

    axes.each(function (dim) {
      d3.select(this).call(d3.axisLeft(scales[dim]).ticks(5).tickSize(4));
    });

    axes.append("text")
      .attr("class", "axis-label clickable")
      .attr("y", margin.top - 15)
      .attr("text-anchor", "middle")
      .text(d => d === "year" ? "Año" : Viz.featureLabels[d]).on("click", (_, dim) => {
        if (inverted.has(dim)) inverted.delete(dim); else inverted.add(dim);
        selections.clear(); draw();
      });

    // Drag horizontal sobre la etiqueta. Durante el gesto sólo se mueve el eje
    // activo; al soltar se ordenan todas las dimensiones y se redibuja.
    axes.call(d3.drag()
      .filter(event => event.target.classList.contains("axis-label"))
      .on("start", (_, dim) => dragPositions.set(dim, x(dim)))
      .on("drag", function(event, dim) {
        dragPositions.set(dim, Math.max(margin.left, Math.min(width - margin.right, event.x)));
        d3.select(this).attr("transform", `translate(${position(dim)},0)`);
        lines.attr("d", path);
      })
      .on("end", (_, dim) => {
        dimensionOrder = dims.slice().sort((a, b) => position(a) - position(b));
        dragPositions.delete(dim);
        selections.clear();
        draw();
      }));
    axes.append("g").attr("class", "axis-brush").each(function (dim) {
      const brush = d3.brushY().extent([[-9, margin.top], [9, margin.top + innerH]])
        .on("brush end", event => {
          if (event.selection) selections.set(dim, event.selection); else selections.delete(dim);
          updateHighlight();
        });
      d3.select(this).call(brush);
    });
    const count = svg.append("text")
      .attr("class", "selection-count")
      .attr("x", width - margin.right)
      .attr("y", height - 10)
      .attr("text-anchor", "end");
    updateHighlight();
  }

  function render(data) {
    tracks = data;
    selections.clear();
    draw();
  }

  return { init, render };
})();
