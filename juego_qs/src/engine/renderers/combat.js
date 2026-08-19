// Renderer genérico de combate por turnos d100. Lee la escena (tipo "combat"),
// el catálogo de enemigos y la cadencia del módulo activo, y — si la escena
// lo declara — un encuentro data-driven (composición de enemigos, cobertura,
// condiciones de victoria/retirada) en vez de tenerlo cableado en la propia
// escena. No conoce ningún módulo, enemigo ni escena concreta por nombre —
// todo sale de datos. Ver docs/MODULE_ARCHITECTURE.md, sección "Encuentros".
import {
  state, obtenerMiembro, esJugador, miembrosDisponibles, aplicarDanio,
  nivelHeridaDe, gastarPuntoEpico, registrarDecision, cambiarEscena, establecerDisponibilidad
} from "../../gameState.js";
import { resolverAtaque, ordenDeActuacion, modificadorCadencia, cargarCadencia } from "../../combat/combat.js";
import { valorCobertura, etiquetaCoberturaVisible } from "../../rules/cover.js";
import { mostrarTirada } from "../../ui/rollDisplay.js";
import { cargarEscena, aplicarConsecuencias } from "../sceneEngine.js";
import { rutaDeManifiesto, rutaAsset } from "../moduleLoader.js";
import { config } from "../../config.js";

let enemiesCache = null;
async function cargarEnemigos() {
  if (enemiesCache) return enemiesCache;
  const res = await fetch(rutaDeManifiesto("enemies"));
  enemiesCache = await res.json();
  return enemiesCache;
}

const cacheEncuentros = new Map();
// Un encuentro es opcional (`escena.encounter`, el id de un archivo en
// paths.encounters): si existe, sus campos (ajusteEjecutores, coberturaDisponible,
// onVictory/onFlee/onDeathWithEpicPoint/onDeath...) se combinan con los de la
// escena — así una escena de combate puede seguir siendo autosuficiente
// (como antes de esta iteración) o delegar la composición táctica a un
// encuentro reutilizable/nombrado. La escena SIEMPRE gana si declara el
// mismo campo que el encuentro, para poder sobreescribir puntualmente.
async function cargarEncuentroSiProcede(escena) {
  if (!escena.encounter) return escena;
  if (!cacheEncuentros.has(escena.encounter)) {
    const res = await fetch(`${rutaDeManifiesto("encounters")}${escena.encounter}.json`);
    if (!res.ok) throw new Error(`Encuentro no encontrado: ${escena.encounter}`);
    cacheEncuentros.set(escena.encounter, await res.json());
  }
  return { ...cacheEncuentros.get(escena.encounter), ...escena };
}

// Efecto visual barato y corto (muzzle flash / impacto / daño). Desactivable
// por completo en config.js sin tocar la lógica de combate.
function flashEfecto(wrap, clase) {
  if (clase === "fx-muzzle" && !config.visualEffects.muzzleFlash) return;
  if ((clase === "fx-impact" || clase === "fx-danio") && !config.visualEffects.impactFlash) return;
  const el = wrap.querySelector(`.${clase}`);
  if (!el) return;
  el.classList.remove("activo");
  void el.offsetWidth; // reinicia la animación si se dispara dos veces seguidas
  el.classList.add("activo");
}

function habilidadArmaDe(base) {
  if (!base.arma) return { nombre: "Sin Armas", valor: base.habilidades["Sin Armas"] ?? 30 };
  if (base.arma.nombre === "Subfusil") return { nombre: "Distancia Media", valor: base.habilidades["Distancia Media"] };
  return { nombre: "Distancia Corta", valor: base.habilidades["Distancia Corta"] };
}

// Estado visible del enemigo SIN revelar sus PV exactos (punto 20 del encargo:
// "no mostrar números ocultos del enemigo salvo que el sistema lo justifique").
function estadoVisibleEnemigo(enemigo) {
  const frac = enemigo.pv / enemigo.pvBase;
  if (frac >= 0.7) return "ileso";
  if (frac >= 0.35) return "herido";
  return "muy dañado";
}

function construirEnemigos(escena, catalogo, numPresentes) {
  const tabla = escena.ajusteEjecutores?.tabla || [];
  const fila = tabla.find(f => f.personajes === numPresentes)
    || [...tabla].sort((a, b) => a.personajes - b.personajes).find(f => f.personajes >= numPresentes)
    || tabla[tabla.length - 1];
  const plantilla = catalogo[fila.enemyId];
  return Array.from({ length: fila.cantidad }, (_, i) => ({
    id: `${fila.enemyId}-${i}`,
    nombre: `${plantilla.nombre} ${i + 1}`,
    ...JSON.parse(JSON.stringify(plantilla)),
    pv: plantilla.pvBase
  }));
}

export async function montarCombate(container, escenaId) {
  const escenaBase = await cargarEscena(escenaId);
  const escena = await cargarEncuentroSiProcede(escenaBase);
  const catalogo = await cargarEnemigos();
  const cadenciaData = await cargarCadencia();

  const party = miembrosDisponibles(escena.availableParty);
  const enemigos = construirEnemigos(escena, catalogo, party.length);

  const combateState = { coberturaPorActor: {}, orden: [], log: [] };

  const wrap = document.createElement("div");
  wrap.className = "combate-wrap";
  wrap.innerHTML = `
    <div class="combate-escena" style="background-image:url('${rutaAsset(escena.background)}')">
      <div class="fx-overlay fx-muzzle"></div>
      <div class="fx-overlay fx-impact"></div>
      <div class="fx-overlay fx-danio"></div>
      <div class="combate-turno-indicador" id="turno-indicador">Iniciativa...</div>
      <div class="combate-orden" id="combate-orden"></div>
      <div class="combate-log" id="combate-log"></div>
    </div>
    <div class="combate-acciones" id="combate-acciones"></div>
  `;
  container.appendChild(wrap);

  const logEl = wrap.querySelector("#combate-log");
  const accionesEl = wrap.querySelector("#combate-acciones");
  const turnoEl = wrap.querySelector("#turno-indicador");
  const ordenEl = wrap.querySelector("#combate-orden");

  function log(msg) {
    combateState.log.push(msg);
    logEl.innerHTML = combateState.log.slice(-6).map(m => `<div>${m}</div>`).join("");
    logEl.scrollTop = logEl.scrollHeight;
  }

  function nombreDe(id) {
    const m = party.find(p => p.baseId === id);
    if (m) return m.base.nombre;
    const e = enemigos.find(en => en.id === id);
    return e ? e.nombre : id;
  }

  // "KOVA → EJECUTOR 1 → BISHOP → EJECUTOR 2 → SALIM" — vista compacta del
  // orden de turnos que queda por resolver en esta ronda.
  function renderOrden() {
    const proximos = combateState.orden.slice(0, 5).map(e => nombreDe(e.id));
    ordenEl.textContent = proximos.length ? proximos.join(" → ") : "";
  }

  log(escena.introText);

  function generarOrden() {
    const combatientes = [
      ...party.map(m => ({ id: m.baseId, iniciativa: m.habilidades["Iniciativa"] ?? 30 })),
      ...enemigos.map(e => ({ id: e.id, iniciativa: e.iniciativa }))
    ];
    combateState.orden = ordenDeActuacion(combatientes);
  }
  generarOrden();

  function enemigosVivos() { return enemigos.filter(e => e.pv > 0); }
  function partyVivo() { return party.filter(m => m.vidaActual.sano + m.vidaActual.herido + m.vidaActual.tullido > 0); }

  function siguienteTurno() {
    if (enemigosVivos().length === 0) {
      aplicarConsecuencias(escena.onVictory, party[0].baseId, { onTexto: () => {} });
      return;
    }
    if (partyVivo().length === 0) return; // gestionado en el momento de la muerte

    if (combateState.orden.length === 0) generarOrden();
    const evento = combateState.orden.shift();
    renderOrden();

    const miembroActor = party.find(m => m.baseId === evento.id);
    if (miembroActor) {
      if (!partyVivo().includes(miembroActor)) return siguienteTurno();
      turnoEl.textContent = `Turno de ${miembroActor.base.nombre}`;
      if (esJugador(miembroActor.baseId)) {
        renderAccionesJugador(miembroActor);
      } else {
        renderAccionesCompanero(miembroActor);
      }
    } else {
      const enemigo = enemigos.find(e => e.id === evento.id);
      if (!enemigo || enemigo.pv <= 0) return siguienteTurno();
      turnoEl.textContent = `Turno de ${enemigo.nombre}`;
      accionesEl.innerHTML = "";
      setTimeout(() => turnoEnemigo(enemigo), 700);
    }
  }

  // Elige objetivo cuando hay más de un enemigo vivo. Con uno solo, se ataca
  // directamente sin preguntar (no añadir fricción cuando no hay elección real).
  function elegirObjetivo(onElegido) {
    const vivos = enemigosVivos();
    if (vivos.length <= 1) return onElegido(vivos[0]);

    const overlay = document.createElement("div");
    overlay.className = "roll-overlay";
    overlay.innerHTML = `
      <div class="roll-card">
        <div class="roll-header">Elegir objetivo</div>
        <div class="delegar-lista">
          ${vivos.map(e => `
            <button class="delegar-opcion" data-id="${e.id}">
              <span>${e.nombre}</span>
              <span class="deleg-hab">${estadoVisibleEnemigo(e)}</span>
            </button>`).join("")}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelectorAll(".delegar-opcion").forEach(btn => {
      btn.addEventListener("click", () => {
        overlay.remove();
        onElegido(vivos.find(e => e.id === btn.dataset.id));
      });
    });
  }

  // Cobertura variable (docs/DESIGN.md, "próxima iteración" #2): la escena
  // declara qué objetos sirven de cobertura y qué nivel dan (src/rules/cover.js),
  // en vez de un único valor fijo cableado en el motor. Sin objetos declarados,
  // se mantiene un nivel genérico para no romper escenas de combate antiguas.
  function opcionesCobertura() {
    return escena.coberturaDisponible?.length
      ? escena.coberturaDisponible
      : [{ id: "cobertura_generica", etiqueta: "la cobertura disponible", nivel: "solida" }];
  }

  function elegirCobertura(onElegida) {
    const opciones = opcionesCobertura();
    if (opciones.length <= 1) return onElegida(opciones[0]);

    const overlay = document.createElement("div");
    overlay.className = "roll-overlay";
    overlay.innerHTML = `
      <div class="roll-card">
        <div class="roll-header">Elegir cobertura</div>
        <div class="delegar-lista">
          ${opciones.map(o => `
            <button class="delegar-opcion" data-id="${o.id}">
              <span>${o.etiqueta}</span>
              <span class="deleg-hab">${etiquetaCoberturaVisible(o.nivel)}</span>
            </button>`).join("")}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelectorAll(".delegar-opcion").forEach(btn => {
      btn.addEventListener("click", () => {
        overlay.remove();
        onElegida(opciones.find(o => o.id === btn.dataset.id));
      });
    });
  }

  function renderAccionesJugador(miembro) {
    const base = miembro.base;
    const armaInfo = habilidadArmaDe(base);
    accionesEl.innerHTML = "";

    const tieneDisparo = !!(base.arma && base.arma.municion !== undefined);
    const acciones = [
      // "principal" es la primera acción ofensiva disponible (disparar si
      // el actor lleva arma a distancia, si no cuerpo a cuerpo) — nunca
      // hardcodeada por id, se decide por lo que el propio actor lleva
      // encima (dato, no una lista de casos especiales).
      { id: "disparar", etiqueta: "Disparar", visible: tieneDisparo, rol: "principal" },
      { id: "rafaga", etiqueta: "Ráfaga", visible: base.arma?.cadenciaMax && base.arma.cadenciaMax !== "Tiro a tiro", rol: "secundaria" },
      { id: "cc", etiqueta: "Cuerpo a cuerpo", visible: !!base.armaCC && base.armaCC.danio > 0, rol: tieneDisparo ? "secundaria" : "principal" },
      { id: "cubrirse", etiqueta: "Cubrirse", visible: true, rol: "secundaria" },
      { id: "mover", etiqueta: "Mover", visible: true, rol: "secundaria" },
      { id: "huir", etiqueta: "Huir", visible: true, rol: "salida" }
    ];

    acciones.filter(a => a.visible).forEach(a => {
      const btn = document.createElement("button");
      btn.className = `btn-accion btn-accion-${a.rol}`;
      if (a.id === "disparar" || a.id === "rafaga") {
        const prob = Math.min(100, armaInfo.valor);
        btn.innerHTML = `${a.etiqueta} <span class="combate-prob">(${prob}%${a.id === "rafaga" ? " +cadencia" : ""})</span>`;
      } else {
        btn.textContent = a.etiqueta;
      }
      btn.addEventListener("click", () => ejecutarAccionJugador(miembro, a.id, armaInfo));
      accionesEl.appendChild(btn);
    });
  }

  // Turno de un compañero de grupo (no el jugador): menú reducido, más
  // "Automático" para no obligar a microgestionar a todo el grupo. Sin IA
  // compleja — Automático es una regla fija y previsible (ver elegirAccionAutomatica).
  function renderAccionesCompanero(miembro) {
    const base = miembro.base;
    const armaInfo = habilidadArmaDe(base);
    accionesEl.innerHTML = "";

    const aviso = document.createElement("div");
    aviso.className = "combate-companero-aviso";
    aviso.textContent = `${base.nombre} puede actuar`;
    accionesEl.appendChild(aviso);

    const acciones = [
      { id: "disparar", etiqueta: "Disparar", visible: !!(base.arma && base.arma.municion !== undefined) },
      { id: "cubrirse", etiqueta: "Cubrirse", visible: true },
      { id: "mover", etiqueta: "Mover", visible: true },
      { id: "automatico", etiqueta: "Automático", visible: true }
    ];

    acciones.filter(a => a.visible).forEach(a => {
      const btn = document.createElement("button");
      btn.className = "btn-accion";
      btn.textContent = a.etiqueta;
      btn.addEventListener("click", () => {
        if (a.id === "automatico") return ejecutarAccionAutomatica(miembro, armaInfo);
        ejecutarAccionJugador(miembro, a.id, armaInfo);
      });
      accionesEl.appendChild(btn);
    });
  }

  // Regla fija y transparente, no una IA: dispara si tiene arma a distancia
  // (al objetivo con menos vida visible), si no puede disparar se cubre.
  function ejecutarAccionAutomatica(miembro, armaInfo) {
    const base = miembro.base;
    if (base.arma && base.arma.municion !== undefined) {
      const vivos = enemigosVivos();
      const objetivoDebil = [...vivos].sort((a, b) => a.pv - b.pv)[0];
      log(`${base.nombre} (automático) dispara al objetivo más débil visible.`);
      dispararA(miembro, "disparar", armaInfo, objetivoDebil);
    } else {
      const opcion = opcionesCobertura()[0];
      combateState.coberturaPorActor[miembro.baseId] = valorCobertura(opcion.nivel);
      log(`${base.nombre} (automático) se cubre tras ${opcion.etiqueta.toLowerCase()} (${etiquetaCoberturaVisible(opcion.nivel)}).`);
      siguienteTurno();
    }
  }

  // Ayudar no disponible para ataques directos por fidelidad a reglas: ni el
  // QS ni el manual (CAP03 líneas 213-223) describen tiradas colaborativas
  // para un ataque — solo para tareas compartidas (forzar, cargar, examinar,
  // puentear...). Un ataque en combate ya tiene sus propios mecanismos de
  // apoyo real (cadencia, cobertura, iniciativa); sumar Ayudar al daño sería
  // una regla no publicada. Por eso "Disparar"/"Ráfaga"/"Cuerpo a cuerpo" van
  // directos a `elegirObjetivo` sin pasar por `ejecutarInteraccion`/Ayudar,
  // a diferencia de "Cubrirse" (que si es data-driven, ver cover.js) y de las
  // interacciones de la persecución (ver docs/QS_RULE_MAP.md, fila "Ayudar").
  function ejecutarAccionJugador(miembro, id, armaInfo) {
    const base = miembro.base;

    if (id === "cubrirse") {
      return elegirCobertura(opcion => {
        combateState.coberturaPorActor[miembro.baseId] = valorCobertura(opcion.nivel);
        log(`${base.nombre} se agazapa tras ${opcion.etiqueta.toLowerCase()} (${etiquetaCoberturaVisible(opcion.nivel)}) hasta su próxima acción ofensiva.`);
        siguienteTurno();
      });
    }
    if (id === "mover") {
      log(`${base.nombre} se reposiciona.`);
      return siguienteTurno();
    }
    if (id === "huir") return intentarHuir(miembro);

    elegirObjetivo(objetivo => dispararA(miembro, id, armaInfo, objetivo));
  }

  function dispararA(miembro, id, armaInfo, objetivo) {
    const base = miembro.base;
    if (!objetivo) return siguienteTurno();

    let habilidadBase, skillId, danioBase, cadenciaBonus = 0, etiqueta;
    if (id === "cc") {
      skillId = "Arma CC Corta";
      habilidadBase = miembro.habilidades[skillId] ?? miembro.habilidades["Sin Armas"];
      danioBase = base.armaCC.danio;
      etiqueta = `${base.armaCC.nombre} cuerpo a cuerpo`;
    } else {
      skillId = armaInfo.nombre;
      habilidadBase = miembro.habilidades[skillId] ?? armaInfo.valor;
      danioBase = base.arma.danio;
      etiqueta = `${base.arma.nombre} — ${armaInfo.nombre}`;
      if (id === "rafaga") {
        cadenciaBonus = modificadorCadencia("rafaga", cadenciaData);
        etiqueta += " (Ráfaga)";
      }
    }

    combateState.coberturaPorActor[miembro.baseId] = 0; // atacar rompe la cobertura activa

    mostrarTirada({
      actorId: miembro.baseId,
      etiquetaHabilidad: etiqueta,
      skillId,
      habilidadBase,
      dificultad: 0,
      dificultadTexto: "Normal",
      escenaId,
      onResuelto: (tiradaResultado) => {
        if (id === "disparar" || id === "rafaga") flashEfecto(wrap, "fx-muzzle");
        aplicarResultadoAtaqueJugador(objetivo, tiradaResultado, danioBase, cadenciaBonus, base.nombre);
      }
    });
  }

  function aplicarResultadoAtaqueJugador(objetivo, tirada, danioBase, cadenciaBonus, nombreAtacante) {
    if (!tirada.exito) {
      log(`${nombreAtacante} falla contra ${objetivo.nombre}.`);
      return siguienteTurno();
    }
    const blindajeEfectivo = Math.max(0, objetivo.blindaje - 0);
    let exitosNetos = tirada.exitos - blindajeEfectivo + cadenciaBonus;
    if (exitosNetos <= 0) {
      log(`El blindaje de ${objetivo.nombre} absorbe el impacto.`);
      return siguienteTurno();
    }
    const danio = danioBase * exitosNetos;
    objetivo.pv -= danio;
    flashEfecto(wrap, "fx-impact");
    log(`${tirada.esCritico ? "¡CRÍTICO! " : ""}${nombreAtacante} impacta a ${objetivo.nombre} por ${danio} de daño (${exitosNetos} éxitos netos).`);
    if (objetivo.pv <= 0) log(`${objetivo.nombre} cae.`);
    siguienteTurno();
  }

  function intentarHuir(miembro) {
    mostrarTirada({
      actorId: miembro.baseId,
      etiquetaHabilidad: "Movimiento evasivo para huir",
      skillId: "Esquivar",
      habilidadBase: miembro.habilidades["Esquivar"] ?? 30,
      dificultad: -10,
      dificultadTexto: "Difícil",
      escenaId,
      onResuelto: (resultado) => {
        if (resultado.exito) {
          aplicarConsecuencias(escena.onFlee, miembro.baseId, {
            onTexto: () => log(`${miembro.base.nombre} rompe el contacto y corre calle abajo.`)
          });
        } else {
          log(`${miembro.base.nombre} no consigue zafarse. Sigue en combate.`);
          siguienteTurno();
        }
      }
    });
  }

  function turnoEnemigo(enemigo) {
    const objetivos = partyVivo();
    if (objetivos.length === 0) return;
    const objetivo = objetivos[Math.floor(Math.random() * objetivos.length)];

    const usaRafaga = Math.random() > 0.5;
    const cadenciaBonus = usaRafaga ? modificadorCadencia("rafaga", cadenciaData) : 0;
    const cobertura = combateState.coberturaPorActor[objetivo.baseId] || 0;

    const resultado = resolverAtaque({
      habilidadBase: enemigo.distancia,
      dificultad: 0,
      penetracion: 0,
      blindajeObjetivo: objetivo.base.armadura?.blindaje ?? 0,
      coberturaObjetivo: cobertura,
      cadenciaBonus,
      danioBase: enemigo.arma.danio
    });

    // Verbo genérico según el tipo de arma del enemigo (dato, no lógica
    // específica de ningún módulo) — evita que una criatura cuerpo a cuerpo
    // (arma.tipo:"cc") "dispare" en el registro de combate.
    const esCC = enemigo.arma?.tipo === "cc";
    const verboAccion = esCC ? "ataca a" : "dispara a";
    const verboImpacto = esCC ? "el golpe" : "el disparo";

    if (!resultado.exito) {
      log(`${enemigo.nombre} ${verboAccion} ${objetivo.base.nombre} (tirada ${resultado.tiradaTexto} vs ${enemigo.distancia}) y falla.`);
      return siguienteTurno();
    }
    if (resultado.exitosNetos <= 0) {
      log(`${enemigo.nombre} impacta a ${objetivo.base.nombre} (tirada ${resultado.tiradaTexto}) pero su protección absorbe ${verboImpacto}.`);
      return siguienteTurno();
    }

    log(`${resultado.esCritico ? "¡CRÍTICO! " : ""}${enemigo.nombre} alcanza a ${objetivo.base.nombre} en ${resultado.localizacion} por ${resultado.danioFinal} de daño.`);
    flashEfecto(wrap, "fx-danio");
    if (config.visualEffects.screenShake) {
      wrap.classList.remove("screen-shake");
      void wrap.offsetWidth;
      wrap.classList.add("screen-shake");
    }
    const muerte = aplicarDanio(objetivo.baseId, resultado.localizacion, resultado.danioFinal);

    if (muerte) {
      if (objetivo.puntosEpicosActuales > 0) {
        mostrarConfirmPE(objetivo, () => {
          gastarPuntoEpico(objetivo.baseId);
          establecerDisponibilidad(objetivo.baseId, "inconsciente");
          aplicarConsecuencias(escena.onDeathWithEpicPoint, objetivo.baseId, { onTexto: () => {} });
        }, () => {
          aplicarConsecuencias(escena.onDeath, objetivo.baseId, { onTexto: () => {} });
        });
        return;
      }
      aplicarConsecuencias(escena.onDeath, objetivo.baseId, { onTexto: () => {} });
      return;
    }

    siguienteTurno();
  }

  function mostrarConfirmPE(objetivo, onSi, onNo) {
    const overlay = document.createElement("div");
    overlay.className = "roll-overlay";
    overlay.innerHTML = `
      <div class="roll-card">
        <div class="roll-header">Golpe mortal — ${objetivo.base.nombre}</div>
        <p style="font-size:.85em;line-height:1.5">El impacto debería haber matado a ${objetivo.base.nombre}.
        Puedes gastar 1 de sus Puntos Épicos para activar <em>"Parecía que había muerto"</em>: queda
        inconsciente y estabilizado en vez de morir.</p>
        <button class="btn-epico" id="pe-si">Gastar Punto Épico</button>
        <button class="btn-continuar" id="pe-no" style="margin-top:8px">No — asumir las consecuencias</button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector("#pe-si").addEventListener("click", () => { overlay.remove(); onSi(); });
    overlay.querySelector("#pe-no").addEventListener("click", () => { overlay.remove(); onNo(); });
  }

  siguienteTurno();
}
