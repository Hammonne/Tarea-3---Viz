// Task A - RadViz (dimensional anchoring): "Firmas sonoras por genero".
// Pregunta: ¿como gravitan distintos generos hacia distintas combinaciones de
// rasgos de audio? (ver README seccion 4, Task A).
//
// TODO: implementar RadViz.
//   - Anclajes: uno por feature en meta.features, distribuidos en un circulo.
//   - Posicion de cada pista = promedio ponderado de sus columnas `<feature>_norm`
//     sobre los anclajes activos (dimensional anchoring).
//   - Interaccion esperada: click en un anclaje lo activa/desactiva.
const RadViz = (() => {
  let svg;

  function init(meta) {
    svg = d3.select("#radvizSvg");
    svg.selectAll("*").remove();
    svg.append("text")
      .attr("x", "50%").attr("y", "50%")
      .attr("text-anchor", "middle")
      .attr("fill", "currentColor")
      .text("RadViz — pendiente de implementar");
  }

  function render(tracks) {
    // TODO: dibujar anclajes + puntos a partir de `tracks`
    // (cada track trae `<feature>_norm` para las features en meta.features).
  }

  return { init, render };
})();
