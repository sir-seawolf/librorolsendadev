// Configuración ligera (Iteración Audio, punto 22-23): SOLO música por
// ahora — on/off + volumen. No es el menú de configuración definitivo
// (ficha plegable, volumen FX, tamaño UI... quedan para la siguiente
// iteración de UI, ver docs/AUDIO_SYSTEM.md). Vive fuera de #scenario a
// propósito: no debe remontarse cada vez que cambia de escena (mismo
// motivo que #sheet-panel, pero independiente de él).
export function montarAjustesAudio(panel, toggleBtn, audioManager) {
  const prefs = audioManager.obtenerPreferencias();

  panel.innerHTML = `
    <div class="ajustes-caja" role="dialog" aria-label="Configuración de audio">
      <div class="ajustes-fila">
        <span class="ajustes-etiqueta">MÚSICA</span>
        <button type="button" class="ajustes-onoff" id="ajustes-musica-onoff" aria-pressed="${prefs.musicEnabled}">${prefs.musicEnabled ? "ON" : "OFF"}</button>
      </div>
      <div class="ajustes-fila">
        <span class="ajustes-etiqueta">VOLUMEN</span>
        <input type="range" id="ajustes-volumen" min="0" max="100" step="1" value="${Math.round(prefs.musicVolume * 100)}" aria-label="Volumen de música">
      </div>
      <button type="button" class="ajustes-cerrar" id="ajustes-cerrar">CERRAR</button>
    </div>
  `;
  panel.hidden = true;

  const btnOnOff = panel.querySelector("#ajustes-musica-onoff");
  const sliderVolumen = panel.querySelector("#ajustes-volumen");
  const btnCerrar = panel.querySelector("#ajustes-cerrar");

  btnOnOff.addEventListener("click", () => {
    const nuevoEstado = btnOnOff.getAttribute("aria-pressed") !== "true";
    audioManager.establecerMute(!nuevoEstado);
    btnOnOff.setAttribute("aria-pressed", String(nuevoEstado));
    btnOnOff.textContent = nuevoEstado ? "ON" : "OFF";
  });

  sliderVolumen.addEventListener("input", () => {
    audioManager.establecerVolumen(Number(sliderVolumen.value) / 100);
  });

  function abrir() { panel.hidden = false; toggleBtn.setAttribute("aria-expanded", "true"); }
  function cerrar() { panel.hidden = true; toggleBtn.setAttribute("aria-expanded", "false"); }

  toggleBtn.setAttribute("aria-expanded", "false");
  toggleBtn.addEventListener("click", () => { panel.hidden ? abrir() : cerrar(); });
  btnCerrar.addEventListener("click", cerrar);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) cerrar(); });
}
