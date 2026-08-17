// Selector de ayudantes para una tirada colaborativa (Ayudar). Muestra el
// resto de candidatos disponibles como casillas — "Nadie ayuda" es siempre
// una opción válida y no cambia el comportamiento respecto a una tirada
// normal en solitario.
export function elegirAyudantes({ titulo, primario, candidatos, onConfirmar }) {
  if (!candidatos.length) { onConfirmar([]); return; }

  const overlay = document.createElement("div");
  overlay.className = "roll-overlay";
  overlay.innerHTML = `
    <div class="roll-card">
      <div class="roll-header">${titulo}</div>
      <p style="font-size:.8em;color:var(--muted);margin:4px 0 8px">
        ${primario} tira. ¿Alguien más ayuda? Todos los que ayuden tiran también
        y sus éxitos (o fallos) se suman al resultado.
      </p>
      <div class="delegar-lista" id="ayuda-lista">
        ${candidatos.map(c => `
          <label class="delegar-opcion" style="cursor:pointer;display:flex;align-items:center;gap:8px">
            <input type="checkbox" value="${c.id}" style="width:16px;height:16px">
            <span>${c.nombre}</span>
            <span class="deleg-hab" style="margin-left:auto">${c.habilidadNombre} ${c.habilidadValor}</span>
          </label>`).join("")}
      </div>
      <button class="btn-continuar" id="ayuda-confirmar" style="margin-top:10px;width:100%">Confirmar</button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector("#ayuda-confirmar").addEventListener("click", () => {
    const elegidos = [...overlay.querySelectorAll('input[type="checkbox"]:checked')].map(i => i.value);
    overlay.remove();
    onConfirmar(elegidos);
  });
}
