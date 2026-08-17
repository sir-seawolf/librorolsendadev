import { state, cambiarEscena, borrarGuardado } from "../../gameState.js";
import { cargarEscena } from "../sceneEngine.js";

// Renderer genérico de finales: la escena JSON define un mapa `endings` de
// clave -> { titulo, texto }. La clave activa es `state.finalTipo`, fijada por
// la escena que llevó hasta aquí (combate, persecución, esconderse...).
export async function montarFinal(container, escenaId) {
  const escena = await cargarEscena(escenaId);
  const clave = state.finalTipo || escena.defaultEnding;
  const final = escena.endings[clave] || escena.endings[escena.defaultEnding];

  const wrap = document.createElement("div");
  wrap.className = "final-screen";
  wrap.innerHTML = `
    <div class="final-titulo">${final.titulo}</div>
    <div style="max-width:560px;line-height:1.6;font-size:.95em"><em>${final.texto}</em></div>
    <div style="margin-top:10px;color:var(--muted);font-size:.8em">
      Decisiones tomadas: ${state.decisiones.length ? state.decisiones.join(" · ") : "ninguna registrada"}
    </div>
    <button class="btn-menu" id="btn-menu-final" style="width:280px;margin-top:20px">Volver al menú</button>
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
