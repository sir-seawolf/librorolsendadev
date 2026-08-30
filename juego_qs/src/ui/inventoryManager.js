import { state, estadoEquipoDe, establecerEstadoEquipo, transferirEquipo } from "../gameState.js";

let overlayActivo = null;

function escapar(texto) {
  return String(texto).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function mostrarGestorInventario(miembroInicialId = state.playerCharacterId) {
  overlayActivo?.remove();
  const overlay = document.createElement("div");
  overlay.className = "inventario-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Gestión de inventario del grupo");
  document.body.appendChild(overlay);
  overlayActivo = overlay;
  let miembroId = miembroInicialId;

  const cerrar = () => { overlay.remove(); if (overlayActivo === overlay) overlayActivo = null; };
  function render() {
    const miembros = Object.entries(state.partyMembers).filter(([, m]) => m.estadoDisponibilidad !== "ausente");
    if (!state.partyMembers[miembroId]) miembroId = miembros[0]?.[0];
    const miembro = state.partyMembers[miembroId];
    overlay.innerHTML = `
      <section class="inventario-panel">
        <header class="inventario-cabecera">
          <div><span class="inventario-kicker">Logística de campo</span><h2>Inventario del grupo</h2></div>
          <button class="inventario-cerrar" type="button" aria-label="Cerrar"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4l12 12M16 4 4 16"/></svg></button>
        </header>
        <nav class="inventario-miembros" aria-label="Personajes">${miembros.map(([id, m]) => `<button type="button" data-miembro="${escapar(id)}" class="${id === miembroId ? "activo" : ""}">${escapar(m.base.nombre)}</button>`).join("")}</nav>
        <div class="inventario-lista">
          ${(miembro?.inventario || []).map((item, indice) => `
            <article class="inventario-item">
              <div><strong>${escapar(item)}</strong><span>Asignado a ${escapar(miembro.base.nombre)}</span></div>
              <label>Estado<select data-estado="${indice}">
                ${[["equipado","Equipado"],["guardado","Guardado"],["en_uso","En uso"]].map(([valor, label]) => `<option value="${valor}" ${estadoEquipoDe(miembroId, item, indice) === valor ? "selected" : ""}>${label}</option>`).join("")}
              </select></label>
              ${miembros.length > 1 ? `<label>Transferir<select data-transferir="${indice}"><option value="">Elegir…</option>${miembros.filter(([id]) => id !== miembroId).map(([id, m]) => `<option value="${escapar(id)}">${escapar(m.base.nombre)}</option>`).join("")}</select></label>` : ""}
            </article>`).join("") || '<p class="inventario-vacio">Este personaje no lleva objetos.</p>'}
        </div>
        <footer>El estado organiza el equipo; no altera por sí solo las reglas de combate del módulo.</footer>
      </section>`;
    overlay.querySelector(".inventario-cerrar").addEventListener("click", cerrar);
    overlay.querySelectorAll("[data-miembro]").forEach(btn => btn.addEventListener("click", () => { miembroId = btn.dataset.miembro; render(); }));
    overlay.querySelectorAll("[data-estado]").forEach(select => select.addEventListener("change", () => {
      const indice = Number(select.dataset.estado);
      establecerEstadoEquipo(miembroId, miembro.inventario[indice], select.value, indice); render();
    }));
    overlay.querySelectorAll("[data-transferir]").forEach(select => select.addEventListener("change", () => {
      const item = miembro.inventario[Number(select.dataset.transferir)];
      if (select.value && transferirEquipo(miembroId, select.value, item, Number(select.dataset.transferir))) render();
    }));
  }
  overlay.addEventListener("pointerdown", event => { if (event.target === overlay) cerrar(); });
  document.addEventListener("keydown", function alTeclado(event) { if (!overlay.isConnected) return document.removeEventListener("keydown", alTeclado); if (event.key === "Escape") cerrar(); });
  render();
  overlay.querySelector(".inventario-cerrar")?.focus();
}
