// Task D - Proyeccion PCA/t-SNE: "Linea de tiempo sonora y la paradoja de la popularidad".
// Pregunta: ¿sigue la musica una trayectoria sonora continua entre decadas? ¿los
// "hits" de distintas epocas convergen sonoramente? (ver README seccion 4, Task D).
//
// TODO: implementar la vista de proyeccion.
//   - El backend ya expone GET /api/projection?method=pca|tsne (respeta filtros
//     de genero/decada), devuelve {points, explained_variance, loadings, centroides}.
//   - Sugerido: dibujar los puntos, y conectar los `centroides` (uno por decada)
//     con una linea para visualizar la "trayectoria sonora".
const Projection = (() => {
  let svg;

  function init(meta) {
    svg = d3.select("#projectionSvg");
    svg.selectAll("*").remove();
    svg.append("text")
      .attr("x", "50%").attr("y", "50%")
      .attr("text-anchor", "middle")
      .attr("fill", "currentColor")
      .text("Proyeccion (PCA / t-SNE) — pendiente de implementar");
  }

  function render() {
    // TODO: fetch a /api/projection y dibujar puntos + trayectoria de centroides.
  }

  return { init, render };
})();
