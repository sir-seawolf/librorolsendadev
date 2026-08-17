// Único punto de despacho por TIPO de escena (nunca por nombre de escena).
// Añadir una escena nueva de un tipo ya soportado no toca este archivo.
// Añadir un tipo de escena nuevo (p.ej. "dialogue") sí lo toca, una vez.
import { cargarEscena } from "../sceneEngine.js";
import { montarNarrativa } from "./narrative.js";
import { montarPersecucion } from "./raycast.js";
import { montarCombate } from "./combat.js";
import { montarFinal } from "./ending.js";
import { montarDialogo } from "./dialogue.js";

const RENDERERS_POR_TIPO = {
  point_click: montarNarrativa,
  decision: montarNarrativa,
  single_roll: montarNarrativa,
  raycast: montarPersecucion,
  combat: montarCombate,
  ending: montarFinal,
  dialogue: montarDialogo
};

export async function montarEscenaPorId(container, escenaId) {
  const escena = await cargarEscena(escenaId);
  const renderer = RENDERERS_POR_TIPO[escena.type];
  if (!renderer) throw new Error(`Tipo de escena sin renderer: ${escena.type}`);
  return renderer(container, escenaId);
}

export function sheetContextDe(escena) {
  return escena?.sheetContext ?? null;
}
