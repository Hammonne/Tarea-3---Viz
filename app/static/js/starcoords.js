// Tasks 1 and 3 — Star Coordinates with draggable, weighted axes + NP metric.
const StarCoords = (() => {
  let features = [];
  let tracks = [];
  const charts = {};
  const popularityLabels = ["0–19", "20–39", "40–59", "60–79", "80–100"];
  const popularityColor = d3.scaleOrdinal(
    popularityLabels,
    ["#d9e7f5", "#9dc4e6", "#5799d2", "#2468a2", "#103f68"]
  );
  const modeColor = d3.scaleOrdinal(["Menor", "Mayor"], ["#e45756", "#2a78d6"]);

  // Neighborhood Preservation: submuestra + kNN "originales" compartidos por
  // ambas instancias (mismas canciones, mismas 9 features de origen).
  let npSampleIdx = [];
  let npOriginalNN = null;
  const NP_K = 10;
  const COMPARISON_KS = [5, 10, 20];

  // Configuración inicial: ejes unitarios igualmente espaciados alrededor del centro.
  function defaultAxes() {
    return features.map((feature, i) => {
      const angle = -Math.PI / 2 + i * 2 * Math.PI / features.length;
      return { feature, x: Math.cos(angle), y: Math.sin(angle) };
    });
  }

  function init(meta) {
    features = meta.features;
    charts.popularity = makeChart(
      "#popularityStarSvg",
      "#popularityStarControls",
      "popularity"
    );
    charts.mode = makeChart("#modeStarSvg", "#modeStarControls", "mode");
  }

  // Cada task mantiene sus propios ejes, controles y escala de color.
  function makeChart(svgSelector, controlsSelector, colorBy) {
    const chart = {
      svg: d3.select(svgSelector),
      controls: d3.select(controlsSelector),
      colorBy,
      axes: defaultAxes(),
      npAnchorNode: null
    };

    chart.controls.selectAll("*").remove();
    chart.controls.append("h3").text("Controles");
    chart.controls
      .append("p")
      .text("Los ejes ya inician en la posición que maximiza Neighborhood Preservation (algoritmo Germain). Arrastra un punto exterior: la dirección rota el eje y la distancia cambia su peso. El NP se recalcula al soltar.");

    chart.controls
      .append("button")
      .attr("class", "control-button")
      .text("Restablecer ejes")
      .on("click", () => {
        chart.axes = defaultAxes();
        draw(chart);
        updateNPBadge(chart);
      });

    chart.controls
      .append("button")
      .attr("class", "control-button")
      .text("Ejes Germain (t-SNE transpuesta)")
      .on("click", () => applyGermain(chart));

    chart.npAnchorNode = chart.controls.append("div").attr("class", "np-panel-anchor").node();

    const entries = colorBy === "popularity"
      ? popularityLabels.map(label => ({ label, color: popularityColor(label) }))
      : ["Menor", "Mayor"].map(label => ({ label, color: modeColor(label) }));

    const legend = chart.controls.append("div").attr("class", "panel-section");
    legend.append("h3").text(colorBy === "popularity" ? "Popularidad" : "Modo");
    entries.forEach(entry => {
      const row = legend.append("div").attr("class", "legend-item");
      row.append("span").attr("class", "legend-swatch").style("background", entry.color);
      row.append("span").text(entry.label);
    });
    return chart;
  }

  function popularityBand(value) {
    if (value < 20) return "0–19";
    if (value < 40) return "20–39";
    if (value < 60) return "40–59";
    if (value < 80) return "60–79";
    return "80–100";
  }

  // Suma vectorial sin normalizar: mover un eje altera tanto dirección como peso.
  function projected(d, axes) {
    return axes.reduce((p, axis) => {
      const value = +d[`${axis.feature}_norm`] || 0;
      p.x += value * axis.x;
      p.y += value * axis.y;
      return p;
    }, { x: 0, y: 0 });
  }

  function draw(chart) {
    const { svg, axes, colorBy } = chart;
    svg.selectAll("*").remove();
    const { width, height } = Viz.size(svg);
    const margin = 68;
    const cx = width / 2;
    const cy = height / 2;
    const axisRadius = Math.min(width, height) * 0.34;
    const coords = tracks.map(d => ({ d, ...projected(d, axes) }));

    // El dominio se recalcula cuando cambia un peso para mantener la nube visible.
    const extent = Math.max(
      1,
      d3.max(coords, point => Math.max(Math.abs(point.x), Math.abs(point.y))) * 1.08
    );
    const scale = d3.scaleLinear().domain([-extent, extent]).range([-axisRadius, axisRadius]);
    const g = svg.append("g").attr("transform", `translate(${cx},${cy})`);

    [0.25, 0.5, 0.75, 1].forEach(fraction => {
      g.append("circle")
        .attr("r", axisRadius * fraction)
        .attr("class", "guide-circle");
    });

    const points = g
      .selectAll(".star-point")
      .data(coords, point => point.d.id)
      .join("circle")
      .attr("class", "data-point star-point")
      .attr("r", 2.6)
      .attr("cx", point => scale(point.x))
      .attr("cy", point => scale(point.y))
      .attr("fill", point => {
        if (colorBy === "popularity") {
          return popularityColor(popularityBand(+point.d.popularity));
        }
        return modeColor(+point.d.mode === 1 ? "Mayor" : "Menor");
      })
      .on("pointermove", (event, point) => Viz.trackTooltip(event, point.d))
      .on("pointerleave", Viz.hideTooltip);

    const axis = g
      .selectAll(".star-axis")
      .data(axes, d => d.feature)
      .join("g")
      .attr("class", "star-axis");
    axis
      .append("line")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", d => d.x * axisRadius)
      .attr("y2", d => d.y * axisRadius);

    axis
      .append("circle")
      .attr("class", "axis-handle")
      .attr("r", 7)
      .attr("cx", d => d.x * axisRadius)
      .attr("cy", d => d.y * axisRadius)
      // subject() explícito: el dato (d.x/d.y) vive en escala unitaria/peso
      // (~-1.45..1.45), no en píxeles como el resto del contenedor SVG. Sin
      // esto, d3.drag usa el datum crudo como "posición inicial" y suma el
      // desplazamiento del mouse en píxeles sobre ese valor casi-cero,
      // haciendo que el eje salte de forma desproporcionada al mínimo gesto.
      .call(d3.drag()
        .container(() => g.node())
        .subject((event, d) => ({ x: d.x * axisRadius, y: d.y * axisRadius }))
        .on("drag", (event, d) => {
        const maxWeight = 1.45;
        d.x = Math.max(-maxWeight, Math.min(maxWeight, event.x / axisRadius));
        d.y = Math.max(-maxWeight, Math.min(maxWeight, event.y / axisRadius));
        axis.select("line").attr("x2", a => a.x * axisRadius).attr("y2", a => a.y * axisRadius);
        axis.select("circle").attr("cx", a => a.x * axisRadius).attr("cy", a => a.y * axisRadius);
        axis.select("text")
          .attr("x", a => a.x * axisRadius * 1.13)
          .attr("y", a => a.y * axisRadius * 1.13)
          .attr("text-anchor", a => a.x > 0.15 ? "start" : a.x < -0.15 ? "end" : "middle");
        const moved = tracks.map(track => ({ d: track, ...projected(track, axes) }));
        const movedExtent = Math.max(
          1,
          d3.max(moved, point => Math.max(Math.abs(point.x), Math.abs(point.y))) * 1.08
        );
        scale.domain([-movedExtent, movedExtent]);
        points
          .data(moved, point => point.d.id)
          .attr("cx", point => scale(point.x))
          .attr("cy", point => scale(point.y));
      }).on("end", () => updateNPBadge(chart)));

    axis
      .append("text")
      .attr("class", "axis-label")
      .attr("x", d => d.x * axisRadius * 1.13)
      .attr("y", d => d.y * axisRadius * 1.13)
      .attr("text-anchor", d => d.x > 0.15 ? "start" : d.x < -0.15 ? "end" : "middle")
      .text(d => Viz.featureLabels[d.feature] || d.feature);
    g.append("text")
      .attr("class", "chart-note")
      .attr("x", -cx + margin)
      .attr("y", -cy + 28)
      .text(`${tracks.length.toLocaleString("es")} canciones · ejes arrastrables`);
  }

  // --- Neighborhood Preservation ---------------------------------------

  function rebuildOriginalNN() {
    npSampleIdx = Metrics.subsampleIndices(tracks.length);
    const original = npSampleIdx.map(i => features.map(f => +tracks[i][`${f}_norm`] || 0));
    npOriginalNN = Metrics.kNN(original, Metrics.NP_MAX_K);
  }

  function projectedSample(chart) {
    return npSampleIdx.map(i => {
      const p = projected(tracks[i], chart.axes);
      return [p.x, p.y];
    });
  }

  function updateNPBadge(chart) {
    if (!npOriginalNN || !npSampleIdx.length) return;
    const projNN = Metrics.kNN(projectedSample(chart), NP_K);
    const np = Metrics.npAtK(npOriginalNN, projNN, NP_K);
    Metrics.renderNPBadge(
      chart.npAnchorNode,
      `Neighborhood Preservation (k=${NP_K}): ${np.toFixed(3)} — vs. las ${features.length} audio features originales`
    );
  }

  // Recalcula ejes con el algoritmo Germain (transpuesta + t-SNE) y muestra
  // una tabla NP "ejes por defecto vs. ejes Germain" para varios k.
  function applyGermain(chart) {
    const defaultProj = npSampleIdx.map(i => {
      const p = projected(tracks[i], defaultAxes());
      return [p.x, p.y];
    });

    chart.axes = Metrics.germainAxes(tracks, features, npSampleIdx);
    draw(chart);

    const germainProj = projectedSample(chart);
    const series = [
      { name: "Por defecto", origNN: npOriginalNN, projNN: Metrics.kNN(defaultProj, Metrics.NP_MAX_K) },
      { name: "Germain", origNN: npOriginalNN, projNN: Metrics.kNN(germainProj, Metrics.NP_MAX_K) }
    ];
    Metrics.renderNPTable(chart.npAnchorNode, COMPARISON_KS, series);
    updateNPBadge(chart);
  }

  let initialized = false; // true tras aplicar los ejes Germain iniciales (una sola vez)

  function render(data) {
    tracks = data;
    rebuildOriginalNN();
    // Arranca directamente en las posiciones que maximizan NP (algoritmo
    // Germain), no en los ejes equiespaciados. Cada instancia recibe su
    // propia copia (no comparten objetos) para poder arrastrarse por separado.
    if (!initialized) {
      const germain = Metrics.germainAxes(tracks, features, npSampleIdx);
      charts.popularity.axes = germain.map(a => ({ ...a }));
      charts.mode.axes = germain.map(a => ({ ...a }));
      initialized = true;
    }
    draw(charts.popularity);
    draw(charts.mode);
    updateNPBadge(charts.popularity);
    updateNPBadge(charts.mode);
  }
  return { init, render };
})();
