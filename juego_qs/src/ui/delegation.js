// Selector de ejecutor: cuando una interacción admite varios ejecutores posibles,
// muestra sus nombres + habilidad efectiva (sin inventar valores: siempre sale de
// characters.json a través del runtime del grupo) y deja elegir con quién tirar.
export function elegirEjecutor({ titulo, candidatos, onElegido }) {
  const overlay = document.createElement("div");
  overlay.className = "roll-overlay";
  overlay.innerHTML = `
    <div class="roll-card">
      <div class="roll-header">${titulo}</div>
      <div class="delegar-lista">
        ${candidatos.map(c => `
          <button class="delegar-opcion" data-id="${c.id}">
            <span>${c.esJugador ? `Hacerlo tú mismo (${c.nombre})` : `Pedir a ${c.nombre}`}</span>
            <span class="deleg-hab">${c.habilidadNombre} ${c.habilidadValor}</span>
          </button>`).join("")}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelectorAll(".delegar-opcion").forEach(btn => {
    btn.addEventListener("click", () => {
      overlay.remove();
      onElegido(btn.dataset.id);
    });
  });
}

export function mostrarToast(texto) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = texto;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("mostrar"));
  setTimeout(() => { el.classList.remove("mostrar"); setTimeout(() => el.remove(), 400); }, 2600);
}
