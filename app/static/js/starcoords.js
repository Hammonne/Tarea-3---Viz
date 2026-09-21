// Task B - Star Coordinates (axis weighting / dragging): "Detector de genero-bender".
// Pregunta: ¿que pistas suenan "raro" para el genero que tienen declarado?
// (ver README seccion 4, Task B).
//
// TODO: implementar Star Coordinates.
//   - Un eje-vector por feature (angulo + peso ajustable via drag o slider).
//   - Posicion de cada pista = suma de `<feature>_norm * peso` proyectado sobre
//     el vector del eje (a diferencia de RadViz, no se normaliza por la suma).
//   - El backend ya expone `anomaly_score_norm` por pista (distancia normalizada
//     al centroide de su genero) en /api/tracks — util como canal de color.
const StarCoords = (() => {
  let svg;

  function init(meta) {
    svg = d3.select("#starSvg");
    svg.selectAll("*").remove();
    svg.append("text")
      .attr("x", "50%").attr("y", "50%")
      .attr("text-anchor", "middle")
      .attr("fill", "currentColor")
      .text("Star Coordinates — pendiente de implementar");
  }

  function render(tracks) {
    // TODO: dibujar ejes arrastrables + puntos a partir de `tracks`.
  }

  return { init, render };
})();
