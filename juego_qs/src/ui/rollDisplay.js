import { resolverTirada, localizacionPorUnidad } from "../rules/dice.js";
import { aplicarProgreso } from "../rules/progression.js";
import { penalizadorPorNivel } from "../rules/woundPenalty.js";
import { obtenerMiembro, gastarPuntoEpico, registrarTirada, nivelHeridaDe } from "../gameState.js";

// Muestra una tirada de forma visible y comprensible: quién tira, con qué
// habilidad, dificultad, animación d100, resultado — y si procede, progreso.
//
// Único punto central del pipeline de Habilidad efectiva:
//   base + dificultad (de la escena) + penalización por herida (automática,
//   según el nivel de vida ACTUAL del actor) + Punto Épico (opcional) = efectiva.
// Ninguna escena tiene que acordarse de restar la penalización por herida:
// se calcula aquí siempre, a partir del estado real del actor que tira.
//
// opts:
//   actorId          id del miembro del grupo que tira ("player" o id de characters.json)
//   etiquetaHabilidad texto descriptivo ("Diagnóstico — examinar el cuerpo")
//   skillId           clave dentro de habilidades{} del actor (para poder progresar)
//   habilidadBase     valor numérico ya resuelto (categoría+concreta) del actor
//   dificultad/dificultadTexto
//   permitirPuntoEpico
//   escenaId          para el historial de tiradas
//   onResuelto(resultado)  resultado trae además actorId, skillId y progreso (o null)
export function mostrarTirada({ actorId = "player", actorNombre, etiquetaHabilidad, skillId, habilidadBase, dificultad = 0, dificultadTexto = "Normal", permitirPuntoEpico = true, escenaId = null, onResuelto }) {
  const actor = obtenerMiembro(actorId);
  const nombreActor = actorNombre || actor?.base?.nombre || "Personaje";
  const nivel = actor ? nivelHeridaDe(actor) : "sano";
  const penalizacionHerida = penalizadorPorNivel(nivel);
  const dificultadTotal = dificultad + penalizacionHerida;

  const overlay = document.createElement("div");
  overlay.className = "roll-overlay";

  const permitido = permitirPuntoEpico && actor && actor.puntosEpicosActuales > 0;

  overlay.innerHTML = `
    <div class="roll-card">
      <div class="roll-header">${nombreActor} — ${etiquetaHabilidad}</div>
      <div class="roll-line"><span>Habilidad base</span><strong>${habilidadBase}</strong></div>
      <div class="roll-line"><span>Dificultad (${dificultadTexto})</span><strong>${dificultad >= 0 ? "+" : ""}${dificultad}</strong></div>
      ${penalizacionHerida ? `<div class="roll-line res-herida"><span>Herida (${nivel})</span><strong>${penalizacionHerida}</strong></div>` : ""}
      <div class="roll-line roll-efectiva"><span>Efectiva</span><strong id="rl-efectiva">${habilidadBase + dificultadTotal}</strong></div>
      ${permitido ? `<button id="rl-pe" class="btn-epico">Gastar 1 Punto Épico de ${nombreActor} (+50)</button>` : ""}
      <div class="roll-dice" id="rl-dice">··</div>
      <div class="roll-result" id="rl-result"></div>
      <button id="rl-continuar" class="btn-continuar" hidden>Continuar</button>
    </div>
  `;
  document.body.appendChild(overlay);

  let peGastado = false;
  const efectivaEl = overlay.querySelector("#rl-efectiva");
  const peBtn = overlay.querySelector("#rl-pe");
  if (peBtn) {
    peBtn.addEventListener("click", () => {
      if (peGastado) return;
      if (!gastarPuntoEpico(actorId)) return;
      peGastado = true;
      peBtn.disabled = true;
      peBtn.textContent = "Punto Épico gastado (+50)";
      efectivaEl.textContent = habilidadBase + dificultadTotal + 50;
    });
  }

  const diceEl = overlay.querySelector("#rl-dice");
  const resultEl = overlay.querySelector("#rl-result");
  const continuarBtn = overlay.querySelector("#rl-continuar");

  setTimeout(() => {
    let frames = 0;
    const anim = setInterval(() => {
      diceEl.textContent = String(Math.floor(Math.random() * 100)).padStart(2, "0");
      frames++;
      if (frames > 10) {
        clearInterval(anim);
        const resultado = resolverTirada({ habilidadBase, dificultad: dificultadTotal, puntoEpicoGastado: peGastado });
        diceEl.textContent = resultado.tiradaTexto;
        renderResultado(resultado);
      }
    }, 60);
  }, 250);

  function renderResultado(resultadoBase) {
    let clase = resultadoBase.exito ? "res-exito" : "res-fallo";
    let titulo = resultadoBase.exito ? "ÉXITO" : "FALLO";
    if (resultadoBase.esCritico) { clase = "res-critico"; titulo = "CRÍTICO"; }
    if (resultadoBase.esPifia) { clase = "res-pifia"; titulo = "PIFIA"; }

    const loc = localizacionPorUnidad(resultadoBase.tirada);

    // Progresión: separado de la resolución de la tirada, tal como pide la arquitectura.
    const progreso = (actor && skillId) ? aplicarProgreso(actor, skillId, resultadoBase) : null;

    const resultado = { ...resultadoBase, actorId, actorNombre: nombreActor, skillId, progreso, penalizacionHerida };

    registrarTirada({
      escena: escenaId,
      actorId,
      actorNombre: nombreActor,
      skillId,
      etiqueta: etiquetaHabilidad,
      habilidadEfectiva: resultado.habilidadEfectiva,
      dificultad,
      penalizacionHerida,
      d100: resultado.tirada,
      exitos: resultado.exitos,
      critico: resultado.esCritico,
      pifia: resultado.esPifia,
      progreso: progreso ? `${progreso.skillId} ${progreso.anterior} → ${progreso.nuevo}` : null
    });

    resultEl.className = `roll-result ${clase}`;
    resultEl.innerHTML = `
      <div class="res-titulo">${titulo} — ${resultado.exitos >= 0 ? resultado.exitos + " éxito" + (resultado.exitos === 1 ? "" : "s") : resultado.exitos + " (fallo)"}</div>
      <div class="res-sub">Localización si aplica: ${loc}</div>
      ${progreso ? `<div class="res-progreso">${nombreActor} mejora ${progreso.skillId}: ${progreso.anterior} → ${progreso.nuevo}</div>` : ""}
    `;
    continuarBtn.hidden = false;
    continuarBtn.addEventListener("click", () => {
      overlay.remove();
      onResuelto && onResuelto(resultado);
    }, { once: true });
  }
}
