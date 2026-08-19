import { state, cambiarEscena, borrarGuardado, obtenerJugador, nivelHeridaDe } from "../../gameState.js";
import { cargarEscena } from "../sceneEngine.js";

// Renderer genérico de finales: la escena JSON define un mapa `endings` de
// clave -> { titulo, texto }. La clave activa es `state.finalTipo`, fijada por
// la escena que llevó hasta aquí (combate, persecución, esconderse...).
//
// Presentación (Iteración 7.2): "expediente cerrado", no una card genérica
// con botón. Todos los datos de cierre (personaje, vida, Puntos Épicos,
// pistas, decisiones) ya existían en gameState — no se inventa ninguno; si
// un dato no aplica (p.ej. sin jugador activo) su línea simplemente no se
// pinta. Nada aquí conoce el módulo activo por nombre.
export async function montarFinal(container, escenaId) {
  const escena = await cargarEscena(escenaId);
  const clave = state.finalTipo || escena.defaultEnding;
  const final = escena.endings[clave] || escena.endings[escena.defaultEnding];

  const jugador = obtenerJugador();
  const NIVEL_ETIQUETA = { sano: "Sano", herido: "Herido", tullido: "Tullido" };

  const wrap = document.createElement("div");
  wrap.className = "final-screen";
  wrap.innerHTML = `
    <div class="final-expediente">
      <div class="final-eyebrow">Expediente cerrado</div>
      <div class="final-titulo">${final.titulo}</div>
      <div class="final-texto"><em>${final.texto}</em></div>
      <div class="final-datos">
        ${jugador ? `<div class="final-dato"><span>Personaje</span><strong>${jugador.base.nombre} — ${NIVEL_ETIQUETA[nivelHeridaDe(jugador)] || "Sano"}</strong></div>` : ""}
        ${jugador ? `<div class="final-dato"><span>Puntos Épicos restantes</span><strong>${jugador.puntosEpicosActuales} / ${jugador.base.puntosEpicos}</strong></div>` : ""}
        <div class="final-dato"><span>Pistas descubiertas</span><strong>${state.pistasDescubiertas.length ? state.pistasDescubiertas.length : "ninguna"}</strong></div>
        <div class="final-dato"><span>Decisiones tomadas</span><strong>${state.decisiones.length ? state.decisiones.join(" · ") : "ninguna registrada"}</strong></div>
      </div>
      <button class="btn-cerrar-expediente" id="btn-menu-final">Volver al menú</button>
    </div>
  `;
  container.appendChild(wrap);

  wrap.querySelector("#btn-menu-final").addEventListener("click", () => {
    borrarGuardado();
    state.partyMembers = {};
    state.playerCharacterId = null;
    state.finalTipo = null;
    cambiarEscena("menu");
  });
}
