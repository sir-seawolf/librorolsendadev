// Catálogo de acciones legales -- Production Integration Phase 6B
// (docs/TACTICAL_PRODUCTION_PHASE6_AUDIT.md §3.3/§5).
//
// Hoy NO existe en el motor una función que calcule "qué acciones son
// legales ahora mismo" -- el panel Phaser actual solo tiene un
// atenuado GLOBAL ("¿es mi turno?") y cada botón descubre su propia
// legalidad al pulsarlo, llamando a validateIntent() y solo logueando
// el rechazo. Este módulo cierra ese hueco SIN reimplementar ninguna
// regla: construye, por cada tipo de acción que el motor ya soporta,
// un intent candidato y consulta validateIntent() (función pura, sin
// efectos secundarios, ya verificado en fases anteriores) en modo
// consulta -- nunca decide legalidad por sí mismo.
//
// Familias (PROPUESTA_UI_TACTICA_RESPONSIVE_PREDATOR.md §3): la
// pertenencia se fija aquí por USO concreto de la acción, no por el
// nombre de una Habilidad -- "Ofensivas" (dañar), "Tácticas"
// (posición/utilidad/preparación, aunque internamente sea `mixed`),
// "Defensivas" (esquiva/protección). `terminar` queda fuera de las
// tres familias a propósito (§5: "acción contextual" como acceso
// rápido, no forma parte del selector de familias).
import {
  movementRemaining, cambiarArma as accionCambiarArmaLegal, validateIntent
} from "../bridge/qsRulesBridge.js";
import { toQsActor, toQsAttackIntent } from "../bridge/qsDataAdapter.js";

export const FAMILIA = Object.freeze({
  OFENSIVAS: "ofensivas",
  TACTICAS: "tacticas",
  DEFENSIVAS: "defensivas",
  CONTEXTUAL: "contextual" // fuera de las tres familias -- ver nota arriba
});

function evaluarObjetivoAtaque(atacanteConfig, objetivoConfig, activation, adapter, actorId, targetId, cc) {
  const qsActor = toQsActor(atacanteConfig);
  const spatialContext = cc ? null : adapter.getCover(actorId, targetId);
  const intentBase = toQsAttackIntent(atacanteConfig, objetivoConfig, { cc });
  if (cc && objetivoConfig.exitosDefensaPendiente) intentBase.exitosDefensa = objetivoConfig.exitosDefensaPendiente;
  const validacion = validateIntent(qsActor, intentBase, activation, spatialContext);
  return { targetId, valid: validacion.valid, reasons: validacion.reasons, cover: spatialContext?.level ?? null };
}

// Agrega la legalidad de un ataque sobre TODOS los objetivos vivos
// disponibles: legal si existe al menos un objetivo válido; si
// ninguno lo es, el motivo mostrado es el del primer objetivo
// evaluado (consistente, no arbitrario -- mismo orden que session.enemies/party).
function evaluarAtaque(session, adapter, actorId, actorConfig, activation, objetivosPosibles, cc) {
  const evaluaciones = objetivosPosibles.map(t => evaluarObjetivoAtaque(actorConfig, session.configDe(t.id), activation, adapter, actorId, t.id, cc));
  const objetivoValido = evaluaciones.find(e => e.valid);
  if (objetivoValido) return { legal: true, reasons: [], objetivosValidos: evaluaciones.filter(e => e.valid).map(e => e.targetId) };
  const motivo = evaluaciones[0]?.reasons ?? ["NO_TARGETS"];
  return { legal: false, reasons: evaluaciones.length ? motivo : ["NO_TARGETS_AVAILABLE"], objetivosValidos: [] };
}

/**
 * Construye el catálogo de acciones legales/ilegales-con-motivo para el
 * actor activo. Puramente derivado de datos existentes -- no muta
 * `session`/`activation` en ningún caso (validateIntent() es de solo
 * lectura, confirmado en fases previas).
 *
 * @returns {{familias: object, contextuales: Array}} estructura plana
 *   serializable: cada acción es {id, label, familia, legal, reasons}.
 */
export function construirCatalogoAcciones({ session, adapter, actorId = session.currentActorId }) {
  if (!actorId) return { familias: { [FAMILIA.OFENSIVAS]: [], [FAMILIA.TACTICAS]: [], [FAMILIA.DEFENSIVAS]: [] }, contextuales: [] };

  const actor = session.configDe(actorId);
  const activation = session.activations.get(actorId);
  const qsActor = toQsActor(actor);
  const esParty = session.esParty(actorId);
  const objetivosVivos = (esParty ? session.vivos(session.enemies) : session.vivos(session.party)).map(o => ({ id: o.id }));

  const acciones = [];

  // Ofensivas
  const disparar = evaluarAtaque(session, adapter, actorId, actor, activation, objetivosVivos, false);
  acciones.push({ id: "disparar", label: "Disparar", familia: FAMILIA.OFENSIVAS, legal: disparar.legal, reasons: disparar.reasons, objetivosValidos: disparar.objetivosValidos });

  const cc = evaluarAtaque(session, adapter, actorId, actor, activation, objetivosVivos, true);
  acciones.push({ id: "cc", label: "Cuerpo a cuerpo", familia: FAMILIA.OFENSIVAS, legal: cc.legal, reasons: cc.reasons, objetivosValidos: cc.objetivosValidos });

  // Tácticas
  const mover = validateIntent(qsActor, { type: "MOVE" }, activation);
  acciones.push({ id: "mover", label: "Mover", familia: FAMILIA.TACTICAS, legal: mover.valid && movementRemaining(activation) > 0, reasons: mover.valid ? (movementRemaining(activation) > 0 ? [] : ["NO_MOVEMENT_REMAINING"]) : mover.reasons });

  const recargar = validateIntent(qsActor, { type: "RELOAD" }, activation);
  acciones.push({ id: "recargar", label: "Recargar", familia: FAMILIA.TACTICAS, legal: recargar.valid, reasons: recargar.reasons });

  const puedeCambiarArma = accionCambiarArmaLegal(activation.minorActionAvailable) && !!actor.armaSecundaria;
  acciones.push({
    id: "cambiarArma", label: "Cambiar arma", familia: FAMILIA.TACTICAS, legal: puedeCambiarArma,
    reasons: puedeCambiarArma ? [] : (!actor.armaSecundaria ? ["NO_SECONDARY_WEAPON"] : ["MINOR_ACTION_SPENT"])
  });

  // Defensivas -- requieren habilidadEsquivar (guard P5/6, ver
  // docs/TACTICAL_PRODUCTION_PHASE5_AUDIT.md); si el actor no la tiene
  // (p.ej. ejecutores MORT) la acción es directamente ilegal, no
  // "desconocida" -- por eso NO se omite del catálogo (sigue visible,
  // deshabilitada, con motivo).
  const tieneEsquiva = typeof actor.habilidadEsquivar === "number";
  const defender = tieneEsquiva ? validateIntent(qsActor, { type: "DODGE_TOTAL", cc: true }, activation) : { valid: false, reasons: ["NO_DODGE_CAPABILITY"] };
  acciones.push({ id: "defender", label: "Defender", familia: FAMILIA.DEFENSIVAS, legal: defender.valid, reasons: defender.reasons });

  const esquivar = tieneEsquiva ? validateIntent(qsActor, { type: "EVASIVE_MOVEMENT" }, activation) : { valid: false, reasons: ["NO_DODGE_CAPABILITY"] };
  acciones.push({ id: "esquivar", label: "Movimiento evasivo", familia: FAMILIA.DEFENSIVAS, legal: esquivar.valid, reasons: esquivar.reasons });

  const familias = { [FAMILIA.OFENSIVAS]: [], [FAMILIA.TACTICAS]: [], [FAMILIA.DEFENSIVAS]: [] };
  for (const a of acciones) familias[a.familia].push(a);

  const contextuales = [
    { id: "terminar", label: "Terminar actuación", familia: FAMILIA.CONTEXTUAL, legal: true, reasons: [] }
  ];

  return { familias, contextuales };
}
