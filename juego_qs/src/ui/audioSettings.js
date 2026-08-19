// Configuración (Iteración Audio, ampliada en 0.3 con la primera
// preferencia no sonora: ficha por defecto — punto 10 del encargo de
// Iteración 0.3, "convertirla en un pequeño sistema coherente", sin
// convertirla en un menú enorme). Vive fuera de #scenario a propósito: no
// debe remontarse cada vez que cambia de escena (mismo motivo que
// #sheet-panel, pero independiente de él).
export function montarAjustesAudio(panel, toggleBtn, audioManager) {
  const prefs = audioManager.obtenerPreferencias();
  // import perezoso: uiSettings.js no depende de audio, y viceversa —
  // se combinan solo aquí, en la UI del panel, sin acoplar los dos módulos.
  const uiSettingsPromise = import("./uiSettings.js");

  panel.innerHTML = `
    <div class="ajustes-caja" role="dialog" aria-label="Configuración">
      <div class="ajustes-fila">
        <span class="ajustes-etiqueta">MÚSICA</span>
        <button type="button" class="ajustes-onoff" id="ajustes-musica-onoff" aria-pressed="${prefs.musicEnabled}">${prefs.musicEnabled ? "ON" : "OFF"}</button>
      </div>
      <div class="ajustes-fila">
        <span class="ajustes-etiqueta">VOLUMEN</span>
        <input type="range" id="ajustes-volumen" min="0" max="100" step="1" value="${Math.round(prefs.musicVolume * 100)}" aria-label="Volumen de música">
      </div>
      <div class="ajustes-fila">
        <span class="ajustes-etiqueta">FICHA POR DEFECTO</span>
        <button type="button" class="ajustes-onoff" id="ajustes-ficha-defecto" aria-pressed="false">EXPANDIDA</button>
      </div>
      <button type="button" class="ajustes-cerrar" id="ajustes-cerrar">CERRAR</button>
    </div>
  `;
  panel.hidden = true;

  const btnOnOff = panel.querySelector("#ajustes-musica-onoff");
  const sliderVolumen = panel.querySelector("#ajustes-volumen");
  const btnCerrar = panel.querySelector("#ajustes-cerrar");
  const btnFicha = panel.querySelector("#ajustes-ficha-defecto");

  btnOnOff.addEventListener("click", () => {
    const nuevoEstado = btnOnOff.getAttribute("aria-pressed") !== "true";
    audioManager.establecerMute(!nuevoEstado);
    btnOnOff.setAttribute("aria-pressed", String(nuevoEstado));
    btnOnOff.textContent = nuevoEstado ? "ON" : "OFF";
  });

  sliderVolumen.addEventListener("input", () => {
    audioManager.establecerVolumen(Number(sliderVolumen.value) / 100);
  });

  // El botón alterna la MISMA preferencia que usa sheet.js (uiSettings.js) —
  // fuente única, nunca dos copias del estado "ficha colapsada".
  uiSettingsPromise.then(({ fichaColapsada }) => {
    const colapsada = fichaColapsada();
    btnFicha.setAttribute("aria-pressed", String(colapsada));
    btnFicha.textContent = colapsada ? "COLAPSADA" : "EXPANDIDA";
  });
  btnFicha.addEventListener("click", async () => {
    const { fichaColapsada, establecerFichaColapsada } = await uiSettingsPromise;
    const nuevoColapsada = !fichaColapsada();
    establecerFichaColapsada(nuevoColapsada);
    btnFicha.setAttribute("aria-pressed", String(nuevoColapsada));
    btnFicha.textContent = nuevoColapsada ? "COLAPSADA" : "EXPANDIDA";
    // Si la ficha ya está montada en pantalla ahora mismo, refleja el
    // cambio al instante en vez de esperar al próximo remontaje de escena
    // — reutiliza el canal de refresco de SOLO-ficha que ya existe
    // (gameState.js: actualizar()), nunca un simulacro de clic sobre el
    // propio botón de la ficha (ese botón siempre alterna hacia el estado
    // CONTRARIO al que tenía en pantalla, así que simularlo aquí habría
    // revertido el cambio que acabamos de guardar).
    const { actualizar } = await import("../gameState.js");
    actualizar();
  });

  function abrir() { panel.hidden = false; toggleBtn.setAttribute("aria-expanded", "true"); }
  function cerrar() { panel.hidden = true; toggleBtn.setAttribute("aria-expanded", "false"); }

  toggleBtn.setAttribute("aria-expanded", "false");
  toggleBtn.addEventListener("click", () => { panel.hidden ? abrir() : cerrar(); });
  btnCerrar.addEventListener("click", cerrar);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) cerrar(); });
}
