import { state, suscribirEscena, suscribirFicha, migrarGuardadoAntiguoSiExiste } from "./gameState.js";
import { renderFicha } from "./ui/sheet.js";
import { montarMenu } from "./scenes/menu.js";
import { montarSelectorModulos } from "./scenes/moduleMenu.js";
import { montarEscenaPorId } from "./engine/renderers/index.js";
import { cargarEscena } from "./engine/sceneEngine.js";
import { aplicarAccesibilidad, config } from "./config.js";
import { audioManager } from "./engine/audioManager.js";
import { montarAjustesAudio } from "./ui/audioSettings.js";
import { moduloIdActivo } from "./engine/moduleLoader.js";

const scenario = document.getElementById("scenario");
const sheetPanel = document.getElementById("sheet-panel");
const configPanel = document.getElementById("config-panel");
const configToggle = document.getElementById("config-toggle");

aplicarAccesibilidad();
migrarGuardadoAntiguoSiExiste(); // ver docs/SAVE_MIGRATION.md — no-op si no hay nada que migrar

// Audio (Iteración Audio): se inicializa siempre, pero no suena nada hasta
// desbloquear() — el primer gesto real del usuario en ESTE documento (los
// gestos de una página anterior, p.ej. el gateway en juego.html, no
// desbloquean el autoplay de un documento nuevo tras una navegación
// completa; ver docs/AUDIO_SYSTEM.md). Un solo listener, una sola vez.
if (audioManager) {
  audioManager.inicializar();
  function primerGestoDesbloqueaAudio() {
    audioManager.desbloquear();
    document.removeEventListener("pointerdown", primerGestoDesbloqueaAudio);
    document.removeEventListener("keydown", primerGestoDesbloqueaAudio);
  }
  document.addEventListener("pointerdown", primerGestoDesbloqueaAudio, { once: true });
  document.addEventListener("keydown", primerGestoDesbloqueaAudio, { once: true });
  document.addEventListener("visibilitychange", () => audioManager.alCambiarVisibilidad(document.hidden));
  if (configPanel && configToggle) montarAjustesAudio(configPanel, configToggle, audioManager);
}

let renderToken = 0;
let sheetContextActual = null; // qué contexto de ficha pinta la escena montada ahora mismo

// Remonta #scenario por completo. SOLO se llama en navegación real (cambio de
// escena) — ver el comentario en gameState.js sobre por qué existen dos
// canales de notificación separados.
async function renderEscena() {
  const miToken = ++renderToken;
  scenario.innerHTML = "";
  if (config.visualEffects.sceneFade) {
    scenario.classList.remove("fundiendo");
    void scenario.offsetWidth;
    scenario.classList.add("fundiendo");
  }

  if (state.escena === "module_select") {
    montarSelectorModulos(scenario);
    sheetContextActual = null;
    sheetPanel.innerHTML = "";
    audioManager?.reproducirEstado(null, "menu"); // "menu" global = senda_game_zone.mp3, ver src/data/audio/audioConfig.json
    return;
  }

  if (state.escena === "menu") {
    montarMenu(scenario);
    sheetContextActual = null;
    sheetPanel.innerHTML = "";
    audioManager?.reproducirEstado(moduloIdActivo(), "exploration"); // menú del módulo ya es "entrar" al módulo (punto 15) — state.moduloId todavía no existe aquí, solo se rellena en iniciarPartida()
    return;
  }

  const escena = await cargarEscena(state.escena);
  if (miToken !== renderToken) return; // el estado cambió mientras cargábamos

  await montarEscenaPorId(scenario, state.escena);
  if (miToken !== renderToken) return;

  // Música por ESTADO musical de la escena, no por su id (punto 10): si la
  // escena no declara "musicState", se deja sonando lo que ya sonaba — no
  // se asume silencio ni se reinicia nada.
  if (escena.musicState) audioManager?.reproducirEstado(moduloIdActivo(), escena.musicState);

  sheetContextActual = escena.sheetContext || null;
  renderFichaSiProcede();
}

// Refresca SOLO la ficha lateral (inventario, vida, PE, progreso...) sin tocar
// la escena en curso — así un combate o una persecución con su propio bucle
// de animación no se reinicia cada vez que cambia un flag o se coge un objeto.
function renderFichaSiProcede() {
  if (sheetContextActual && state.playerCharacterId) {
    renderFicha(sheetPanel, sheetContextActual);
  } else {
    sheetPanel.innerHTML = "";
  }
}

suscribirEscena(renderEscena);
suscribirFicha(renderFichaSiProcede);
renderEscena();
