// Task C - Parallel Coordinates (scaling + brushing): "La guerra del volumen".
// Pregunta: ¿como cambio la produccion musical de 1921 a 2020?
// (ver README seccion 4, Task C).
//
// TODO: implementar Parallel Coordinates.
//   - Un eje vertical por feature (sugerido: year + meta.features), escalado
//     independientemente por eje.
//   - Una linea (path) por pista, conectando sus valores a traves de los ejes.
//   - Interaccion esperada: brushing (d3.brushY) en cualquier eje para
//     resaltar/atenuar el resto de las lineas.
const ParallelCoords = (() => {
  let svg;

  function init(meta) {
    svg = d3.select("#parallelSvg");
    svg.selectAll("*").remove();
    svg.append("text")
      .attr("x", "50%").attr("y", "50%")
      .attr("text-anchor", "middle")
      .attr("fill", "currentColor")
      .text("Parallel Coordinates — pendiente de implementar");
  }

  function render(tracks) {
    // TODO: dibujar ejes + lineas a partir de `tracks`.
  }

  return { init, render };
})();
