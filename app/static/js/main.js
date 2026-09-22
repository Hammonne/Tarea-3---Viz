(async function () {
  try {
    // Inicialización del estado global y de los cuatro gráficos.
    const meta = await Viz.fetchJSON("/api/meta");
    Viz.state.meta = meta;
    Viz.state.decadeMin = d3.min(meta.decades);
    Viz.state.decadeMax = d3.max(meta.decades);
    const datasetMeta = document.getElementById("datasetMeta");
    datasetMeta.textContent = [
      `${meta.n_tracks.toLocaleString("es")} pistas en muestra`,
      `${meta.min_year}–${meta.max_year}`
    ].join(" · ");

    RadViz.init(meta);
    StarCoords.init(meta);
    ParallelCoords.init(meta);
    Projection.init(meta);
    initTabs();
    initFilters(meta);
    await refreshAll();

    // Un solo fetch alimenta las vistas basadas en tracks. PCA consulta su
    // endpoint por separado porque las coordenadas se calculan en el servidor.
    async function refreshAll() {
      document.body.classList.add("is-loading");
      try {
        const data = await Viz.fetchJSON(`/api/tracks?${Viz.queryString()}`);
        RadViz.render(data.tracks);
        StarCoords.render(data.tracks);
        ParallelCoords.render(data.tracks);
        await Projection.render();
      } finally {
        document.body.classList.remove("is-loading");
      }
    }

    // Cambia la vista visible sin destruir su estado interactivo.
    function initTabs() {
      const tabs = document.querySelectorAll(".tab");

      tabs.forEach(tab => {
        tab.addEventListener("click", () => {
          tabs.forEach(otherTab => {
            otherTab.classList.remove("active");
            otherTab.setAttribute("aria-selected", "false");
          });

          tab.classList.add("active");
          tab.setAttribute("aria-selected", "true");

          document.querySelectorAll(".view").forEach(view => {
            view.classList.remove("active");
          });

          document
            .getElementById(`view-${tab.dataset.tab}`)
            .classList.add("active");
        });
      });
    }

    // Construye los chips multiselección de género y los dos límites de década.
    function initFilters(metaData) {
      Viz.genreColors.domain(metaData.genres);
      const chipRoot = d3.select("#genreChips");
      chipRoot
        .append("button")
        .attr("class", "chip active")
        .attr("data-all", "true")
        .text("Todos")
        .on("click", () => {
          Viz.state.genres = null;
          updateChips();
          refreshAll();
        });

      chipRoot
        .selectAll("button.genre-chip")
        .data(metaData.genres)
        .join("button")
        .attr("class", "chip genre-chip")
        .style("--chip-color", genre => Viz.genreColors(genre))
        .text(genre => genre)
        .on("click", (_, genre) => {
          const selected = new Set(Viz.state.genres || []);
          if (selected.has(genre)) selected.delete(genre); else selected.add(genre);
          Viz.state.genres = selected.size ? [...selected] : null;
          updateChips(); refreshAll();
        });

      function updateChips() {
        const selected = new Set(Viz.state.genres || []);
        chipRoot.select("[data-all]").classed("active", !selected.size);
        chipRoot.selectAll(".genre-chip").classed("active", d => selected.has(d));
      }

      const root = d3.select("#decadeSlider");
      const firstDecade = d3.min(metaData.decades);
      const lastDecade = d3.max(metaData.decades);

      const minInput = root
        .append("input")
        .attr("type", "range")
        .attr("min", firstDecade)
        .attr("max", lastDecade)
        .attr("step", 10)
        .property("value", Viz.state.decadeMin);

      const label = root.append("strong");

      const maxInput = root
        .append("input")
        .attr("type", "range")
        .attr("min", firstDecade)
        .attr("max", lastDecade)
        .attr("step", 10)
        .property("value", Viz.state.decadeMax);

      let timer;

      function updateRange() {
        let lo = +minInput.property("value");
        let hi = +maxInput.property("value");

        if (lo > hi) [lo, hi] = [hi, lo];

        Viz.state.decadeMin = lo;
        Viz.state.decadeMax = hi;
        label.text(`${lo}s – ${hi}s`);

        // Debounce: evita solicitar todos los gráficos en cada pixel del slider.
        clearTimeout(timer);
        timer = setTimeout(refreshAll, 180);
      }

      minInput.on("input", updateRange);
      maxInput.on("input", updateRange);
      updateRange();
    }
  } catch (error) {
    console.error(error);
    document.getElementById("datasetMeta").textContent = "Error al cargar los datos";
  }
})();
