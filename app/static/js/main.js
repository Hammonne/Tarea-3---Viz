// Orquestador: tabs, filtros globales, carga inicial y refresco cruzado.
(async function () {
  const meta = await Viz.fetchJSON("/api/meta");
  Viz.state.meta = meta;
  Viz.buildGenreColors(meta.genres);
  Viz.state.decadeMin = meta.decades[0];
  Viz.state.decadeMax = meta.decades[meta.decades.length - 1];

  document.getElementById("datasetMeta").textContent =
    `${meta.n_tracks.toLocaleString("es")} pistas en muestra · ${meta.min_year}-${meta.max_year}`;

  buildFilterBar(meta);

  RadViz.init(meta);
  StarCoords.init(meta);
  ParallelCoords.init(meta);
  Projection.init(meta);

  async function refreshAll() {
    const data = await Viz.fetchJSON(`/api/tracks?${Viz.queryString()}`);
    RadViz.render(data.tracks);
    StarCoords.render(data.tracks);
    ParallelCoords.render(data.tracks);
    Projection.render();
  }

  Viz.onFilterChange(refreshAll);
  await refreshAll();

  initTabs();

  function buildFilterBar(meta) {
    const chips = d3.select("#genreChips");
    const active = new Set(meta.genres);
    meta.genres.forEach((g) => {
      const chip = chips.append("button")
        .attr("class", "chip")
        .attr("data-active", "true")
        .style("color", Viz.genreColor(g));
      chip.append("span").attr("class", "chip__dot").style("background", Viz.genreColor(g));
      chip.append("span").text(g);
      chip.on("click", () => {
        if (active.has(g)) active.delete(g); else active.add(g);
        chip.attr("data-active", active.has(g) ? "true" : "false");
        Viz.state.genres = active.size === meta.genres.length ? null : Array.from(active);
        Viz.emitFilterChange();
      });
    });

    const slider = d3.select("#decadeSlider");
    const label = d3.select("#decadeRangeLabel");
    const decades = meta.decades;
    const fmt = (v) => `${v}s`;
    label.text(`${fmt(decades[0])} - ${fmt(decades[decades.length - 1])}`);

    const minInput = slider.append("input").attr("type", "range")
      .attr("min", 0).attr("max", decades.length - 1).attr("value", 0);
    const maxInput = slider.append("input").attr("type", "range")
      .attr("min", 0).attr("max", decades.length - 1).attr("value", decades.length - 1);

    function onRange() {
      let lo = +minInput.property("value");
      let hi = +maxInput.property("value");
      if (lo > hi) [lo, hi] = [hi, lo];
      Viz.state.decadeMin = decades[lo];
      Viz.state.decadeMax = decades[hi];
      label.text(`${fmt(decades[lo])} - ${fmt(decades[hi])}`);
      Viz.emitFilterChange();
    }
    minInput.on("input", onRange);
    maxInput.on("input", onRange);

    d3.select("#resetFilters").on("click", () => {
      active.clear();
      meta.genres.forEach((g) => active.add(g));
      chips.selectAll(".chip").attr("data-active", "true");
      Viz.state.genres = null;
      minInput.property("value", 0);
      maxInput.property("value", decades.length - 1);
      Viz.state.decadeMin = decades[0];
      Viz.state.decadeMax = decades[decades.length - 1];
      label.text(`${fmt(decades[0])} - ${fmt(decades[decades.length - 1])}`);
      Viz.emitFilterChange();
    });
  }

  function initTabs() {
    const tabs = document.querySelectorAll(".tab");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => { t.classList.remove("active"); t.setAttribute("aria-selected", "false"); });
        tab.classList.add("active");
        tab.setAttribute("aria-selected", "true");
        document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
        document.getElementById(`view-${tab.dataset.tab}`).classList.add("active");
      });
    });
  }
})();
