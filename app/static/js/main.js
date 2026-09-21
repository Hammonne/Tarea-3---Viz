// Orquestador minimo: carga inicial, tabs. Los filtros globales (genero/decada)
// quedan como TODO — el HTML ya tiene los contenedores (#genreChips, #decadeSlider)
// y el backend ya acepta ?genres=&decade_min=&decade_max= en /api/tracks y
// /api/projection; falta la UI que los construya y dispare el refetch.
(async function () {
  const meta = await Viz.fetchJSON("/api/meta");
  Viz.state.meta = meta;
  Viz.state.decadeMin = meta.decades[0];
  Viz.state.decadeMax = meta.decades[meta.decades.length - 1];

  document.getElementById("datasetMeta").textContent =
    `${meta.n_tracks.toLocaleString("es")} pistas en muestra · ${meta.min_year}-${meta.max_year}`;

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
  await refreshAll();

  initTabs();

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
