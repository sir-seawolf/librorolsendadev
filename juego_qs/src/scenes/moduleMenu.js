// Nivel 1 del arranque: selector de módulos. Lee modules/modules.json — no
// hardcodea ningún título ni id de módulo concreto. Solo los módulos con
// status "playable" y enabled:true son cargables; el resto se muestra como
// referencia ("coming_soon"/"development"/"disabled") sin intentar
// fetch(module.json) para ellos, porque no tienen por qué existir todavía
// (ver docs/MODULE_ARCHITECTURE.md).
import { cargarListaModulos, cargarModulo } from "../engine/moduleLoader.js";
import { cambiarEscena } from "../gameState.js";

const ETIQUETA_ESTADO = {
  playable: "JUGAR",
  development: "EN DESARROLLO",
  coming_soon: "PRÓXIMAMENTE",
  disabled: "NO DISPONIBLE"
};

export async function montarSelectorModulos(container) {
  const modulos = await cargarListaModulos();
  const wrap = document.createElement("div");
  wrap.className = "menu-screen";
  wrap.innerHTML = `
    <div class="menu-titulo">LA SENDA DE LOS ERRANTES</div>
    <div class="menu-subtitulo">Elige una aventura</div>
    <div class="modulos-grid">
      ${modulos.map(m => {
        const jugable = m.enabled && m.status === "playable";
        return `
          <div class="card-modulo ${jugable ? "jugable" : "bloqueado"}" data-id="${m.id}" data-jugable="${jugable}">
            <div class="cm-titulo">${m.title}</div>
            ${m.subtitle ? `<div class="cm-subtitulo">${m.subtitle}</div>` : ""}
            ${m.description ? `<div class="cm-desc">${m.description}</div>` : ""}
            <div class="cm-estado">${ETIQUETA_ESTADO[m.status] || m.status}</div>
          </div>`;
      }).join("")}
    </div>
  `;
  container.appendChild(wrap);

  wrap.querySelectorAll(".card-modulo.jugable").forEach(card => {
    card.addEventListener("click", async () => {
      await cargarModulo(card.dataset.id);
      cambiarEscena("menu");
    });
  });
}
