import { state, suscribirEscena, suscribirFicha, migrarGuardadoAntiguoSiExiste } from "./gameState.js";
import { renderFicha } from "./ui/sheet.js";
import { montarMenu } from "./scenes/menu.js";
import { montarSelectorModulos } from "./scenes/moduleMenu.js";
import { montarEscenaPorId } from "./engine/renderers/index.js";
import { cargarEscena } from "./engine/sceneEngine.js";
import { aplicarAccesibilidad, config } from "./config.js";

const scenario = document.getElementById("scenario");
const sheetPanel = document.getElementById("sheet-panel");

aplicarAccesibilidad();
migrarGuardadoAntiguoSiExiste(); // ver docs/SAVE_MIGRATION.md — no-op si no hay nada que migrar

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
    return;
  }

  if (state.escena === "menu") {
    montarMenu(scenario);
    sheetContextActual = null;
    sheetPanel.innerHTML = "";
    return;
  }

  const escena = await cargarEscena(state.escena);
  if (miToken !== renderToken) return; // el estado cambió mientras cargábamos

  await montarEscenaPorId(scenario, state.escena);
  if (miToken !== renderToken) return;

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
