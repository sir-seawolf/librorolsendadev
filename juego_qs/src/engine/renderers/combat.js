// Renderer genérico de combate por turnos d100. Lee la escena (tipo "combat"),
// el catálogo de enemigos y la cadencia del módulo activo, y — si la escena
// lo declara — un encuentro data-driven (composición de enemigos, cobertura,
// condiciones de victoria/retirada) en vez de tenerlo cableado en la propia
// escena. No conoce ningún módulo, enemigo ni escena concreta por nombre —
// todo sale de datos. Ver docs/MODULE_ARCHITECTURE.md, sección "Encuentros",
// y docs/COMBAT_UX.md para munición/cobertura/modos automáticos (0.2).
import {
  state, obtenerMiembro, esJugador, miembrosDisponibles, aplicarDanio,
  nivelHeridaDe, gastarPuntoEpico, registrarDecision, cambiarEscena, establecerDisponibilidad,
  consumirMunicion, recargarArma, establecerCobertura
} from "../../gameState.js";
import { resolverAtaque, ordenDeActuacion, modificadorCadencia, cargarCadencia } from "../../combat/combat.js";
import { valorCobertura, etiquetaCoberturaVisible, NIVELES_COBERTURA } from "../../rules/cover.js";
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

function claveCoberturaDeValor(valor) {
  return Object.keys(NIVELES_COBERTURA).find(k => NIVELES_COBERTURA[k].valor === valor) || "ninguna";
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
  return Array.from({ length: fila.cantidad }, (_, i) => {
    const copia = JSON.parse(JSON.stringify(plantilla));
    return {
      id: `${fila.enemyId}-${i}`,
      nombre: `${plantilla.nombre} ${i + 1}`,
      ...copia,
      pv: plantilla.pvBase,
      cobertura: 0,
      // Munición propia del enemigo si su arma la declara (punto 27 del
      // encargo Combat UX): mismo sistema que el jugador, reserva generosa
      // documentada en enemies.json — nunca Infinity (complica el guardado
      // y ni siquiera hace falta: los enemigos no persisten entre partidas).
      municion: copia.arma?.magazineSize !== undefined
        ? { cargador: copia.arma.magazineSize, reserva: copia.arma.ammoReserve ?? 0 }
        : null
    };
  });
}

// Velocidad de presentación (punto 16 del encargo): 1×/2×/4× solo escala
// pausas de puesta en escena entre acciones — nunca probabilidades, tiradas
// ni reglas (esas siguen exactamente el mismo resolvedor a cualquier
// velocidad). La animación del dado en sí (rollDisplay.js) no se toca —
// tiene su propio ritmo ya probado desde la Iteración 6 — pero en modos
// automáticos el "Continuar" se pulsa solo (ver autoContinuarSiProcede),
// así que la velocidad sí nota en el tiempo total entre turnos.
function ms(base, velocidad) {
  return Math.max(60, Math.round(base / velocidad));
}

export async function montarCombate(container, escenaId) {
  const escenaBase = await cargarEscena(escenaId);
  const escena = await cargarEncuentroSiProcede(escenaBase);
  const catalogo = await cargarEnemigos();
  const cadenciaData = await cargarCadencia();

  const party = miembrosDisponibles(escena.availableParty);
  const enemigos = construirEnemigos(escena, catalogo, party.length);

  // modo: "manual" (todo el mundo se controla a mano, comportamiento previo
  // a esta iteración, DEFAULT — punto 34: conservador para partidas ya en
  // curso) | "pj_manual_auto" (el jugador controla solo su PJ, el motor
  // resuelve compañeros con la misma regla que "Automático" ya tenía) |
  // "automatico" (el motor resuelve TODO el grupo, incluido el PJ, con el
  // mismo resolvedor real — nunca un simulador aparte, punto 14).
  // resolviendo: guarda de doble-clic (punto 41) — mientras una acción está
  // en curso (tirada abierta, turno automático resolviéndose) no se acepta
  // otra hasta que termine.
  const combateState = { orden: [], log: [], modo: "manual", velocidad: 1, resolviendo: false };

  const wrap = document.createElement("div");
  wrap.className = "combate-wrap";
  wrap.innerHTML = `
    <div class="combate-escena" style="background-image:url('${rutaAsset(escena.background)}')">
      <div class="fx-overlay fx-muzzle"></div>
      <div class="fx-overlay fx-impact"></div>
      <div class="fx-overlay fx-danio"></div>
      <div class="combate-turno-indicador" id="turno-indicador">Iniciativa...</div>
      <div class="combate-orden" id="combate-orden"></div>
      <div class="combate-tactico" id="combate-tactico"></div>
      <div class="combate-log" id="combate-log"></div>
    </div>
    <div class="combate-modo" id="combate-modo"></div>
    <div class="combate-acciones" id="combate-acciones"></div>
  `;
  container.appendChild(wrap);

  const logEl = wrap.querySelector("#combate-log");
  const accionesEl = wrap.querySelector("#combate-acciones");
  const turnoEl = wrap.querySelector("#turno-indicador");
  const ordenEl = wrap.querySelector("#combate-orden");
  const tacticoEl = wrap.querySelector("#combate-tactico");
  const modoEl = wrap.querySelector("#combate-modo");

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

  // Estado táctico compacto (puntos 9-11, 23): vida/cobertura/munición de
  // cada miembro del grupo, visible SIEMPRE, no solo cuando le toca actuar
  // — así nunca hay que recordar qué se hizo dos turnos antes. Cobertura
  // vive en el propio runtime del combatiente (m.cobertura, gameState.js),
  // no en un booleano suelto del combate: por eso puede leerse aquí igual
  // que desde la ficha lateral (src/ui/sheet.js).
  function renderTactico() {
    const filas = party.map(m => {
      const cob = m.cobertura > 0
        ? `<span class="tactico-cobertura activa">${etiquetaCoberturaVisible(claveCoberturaDeValor(m.cobertura))}</span>`
        : `<span class="tactico-cobertura">sin cobertura</span>`;
      const mun = m.municion ? `<span class="tactico-municion">${m.municion.cargador}/${m.municion.reserva}</span>` : "";
      const vivo = (m.vidaActual.sano + m.vidaActual.herido + m.vidaActual.tullido) > 0;
      return `<div class="tactico-fila ${vivo ? "" : "caido"}">
        <span class="tactico-nombre">${m.base.nombre}${esJugador(m.baseId) ? "" : ` <em>(${combateState.modo === "manual" ? "manual" : "auto"})</em>`}</span>
        ${cob}${mun}
      </div>`;
    }).join("");
    tacticoEl.innerHTML = filas;
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

  // Selector de modo (punto 33: dentro del combate, no en Configuración
  // global) + velocidad + DETENER AUTO. DETENER AUTO no interrumpe nada a
  // media tirada (punto 15): solo cambia combateState.modo a "manual", y el
  // próximo punto de decisión real (siguienteTurno(), que se llama tras
  // CADA acción resuelta) ya lo respeta — nunca corta una resolución en curso.
  function renderControlModo() {
    const enAuto = combateState.modo !== "manual";
    modoEl.innerHTML = `
      <div class="modo-fila">
        <button type="button" class="modo-btn ${combateState.modo === "manual" ? "activo" : ""}" data-modo="manual">MANUAL</button>
        <button type="button" class="modo-btn ${combateState.modo === "pj_manual_auto" ? "activo" : ""}" data-modo="pj_manual_auto">PJ MANUAL · COMPAÑEROS AUTO</button>
        <button type="button" class="modo-btn ${combateState.modo === "automatico" ? "activo" : ""}" data-modo="automatico">AUTOMÁTICO</button>
      </div>
      ${enAuto ? `
      <div class="modo-fila modo-fila-velocidad">
        ${[1, 2, 4].map(v => `<button type="button" class="modo-vel ${combateState.velocidad === v ? "activo" : ""}" data-vel="${v}">${v}×</button>`).join("")}
        <button type="button" class="modo-detener" id="btn-detener-auto">DETENER AUTO</button>
      </div>` : ""}
    `;
    modoEl.querySelectorAll(".modo-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        if (combateState.resolviendo) return; // guarda de doble-clic: no cambiar de modo a media resolución
        combateState.modo = btn.dataset.modo;
        renderControlModo();
        renderTactico();
      });
    });
    modoEl.querySelectorAll(".modo-vel").forEach(btn => {
      btn.addEventListener("click", () => {
        combateState.velocidad = Number(btn.dataset.vel);
        renderControlModo();
      });
    });
    modoEl.querySelector("#btn-detener-auto")?.addEventListener("click", () => {
      combateState.modo = "manual";
      renderControlModo();
      renderTactico();
    });
  }
  renderControlModo();

  // Pulsa "Continuar" en cuanto el resultado de la tirada está pintado —
  // solo se usa para acciones resueltas automáticamente (compañeros/auto
  // completo): un jugador manual sigue pulsando "Continuar" él mismo,
  // porque ahí es donde decide si gasta un Punto Épico (Iteración 6, no se
  // toca). No interrumpe la animación del dado, solo evita la espera de un
  // clic AL FINAL, cuando ya no hay ninguna decisión real que tomar.
  function autoContinuarSiProcede() {
    const intervalo = setInterval(() => {
      const btn = document.querySelector(".roll-overlay #rl-continuar");
      if (btn && !btn.hidden) {
        clearInterval(intervalo);
        setTimeout(() => btn.click(), ms(300, combateState.velocidad));
      }
    }, 80);
  }

  function siguienteTurno() {
    combateState.resolviendo = false;
    renderTactico();
    if (enemigosVivos().length === 0) {
      accionesEl.innerHTML = "";
      turnoEl.textContent = "Victoria";
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
      const esPJ = esJugador(miembroActor.baseId);
      const modoAutoParaEste = combateState.modo === "automatico" || (combateState.modo === "pj_manual_auto" && !esPJ);
      if (modoAutoParaEste) {
        combateState.resolviendo = true;
        accionesEl.innerHTML = "";
        const armaInfo = habilidadArmaDe(miembroActor.base);
        setTimeout(() => ejecutarAccionAutomatica(miembroActor, armaInfo), ms(500, combateState.velocidad));
      } else if (esPJ) {
        renderAccionesJugador(miembroActor);
      } else {
        renderAccionesCompanero(miembroActor);
      }
    } else {
      const enemigo = enemigos.find(e => e.id === evento.id);
      if (!enemigo || enemigo.pv <= 0) return siguienteTurno();
      turnoEl.textContent = `Turno de ${enemigo.nombre}`;
      accionesEl.innerHTML = "";
      combateState.resolviendo = true;
      setTimeout(() => turnoEnemigo(enemigo), ms(700, combateState.velocidad));
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

  // Cuánta munición consume cada acción — regla fija QS L.166-168 (punto 5
  // del encargo): Disparo 1, Ráfaga 3. Nunca se confunde con el bonus de
  // éxitos de cadencia (modificadorCadencia), que es un efecto de la
  // tirada, no de cuánta munición se gasta.
  const COSTO_MUNICION = { disparar: 1, rafaga: 3 };

  function renderAccionesJugador(miembro) {
    const base = miembro.base;
    const armaInfo = habilidadArmaDe(base);
    accionesEl.innerHTML = "";

    const tieneArmaDistancia = !!(base.arma && miembro.municion);
    const cargador = miembro.municion?.cargador ?? 0;
    const reserva = miembro.municion?.reserva ?? 0;
    const magSize = base.arma?.magazineSize ?? cargador;

    if (tieneArmaDistancia) {
      const armaEl = document.createElement("div");
      armaEl.className = "combate-hud-arma";
      armaEl.innerHTML = `<span class="hud-arma-nombre">${base.arma.nombre}</span><span class="hud-arma-municion">${cargador} / ${reserva}</span>`;
      accionesEl.appendChild(armaEl);
    }

    const acciones = [
      // "principal" es la primera acción ofensiva disponible (disparar si
      // el actor lleva arma a distancia, si no cuerpo a cuerpo) — nunca
      // hardcodeada por id, se decide por lo que el propio actor lleva
      // encima (dato, no una lista de casos especiales).
      { id: "disparar", etiqueta: "Disparo", tag: "[1]", visible: tieneArmaDistancia, disabled: cargador < COSTO_MUNICION.disparar, rol: "principal" },
      { id: "rafaga", etiqueta: "Ráfaga", tag: "[3]", visible: tieneArmaDistancia && base.arma?.cadenciaMax && base.arma.cadenciaMax !== "Tiro a tiro", disabled: cargador < COSTO_MUNICION.rafaga, rol: "secundaria" },
      { id: "recargar", etiqueta: "Recargar", visible: tieneArmaDistancia && cargador < magSize, disabled: reserva <= 0, rol: "secundaria" },
      { id: "cc", etiqueta: "Cuerpo a cuerpo", visible: !!base.armaCC && base.armaCC.danio > 0, rol: tieneArmaDistancia ? "secundaria" : "principal" },
      { id: "cubrirse", etiqueta: "Cubrirse", visible: true, rol: "secundaria" },
      { id: "mover", etiqueta: "Mover", visible: true, rol: "secundaria" },
      { id: "huir", etiqueta: "Huir", visible: true, rol: "salida" }
    ];

    acciones.filter(a => a.visible).forEach(a => {
      const btn = document.createElement("button");
      btn.className = `btn-accion btn-accion-${a.rol}`;
      btn.disabled = !!a.disabled;
      if (a.id === "disparar" || a.id === "rafaga") {
        const prob = Math.min(100, armaInfo.valor);
        btn.innerHTML = `${a.etiqueta} <span class="combate-tag">${a.tag}</span> <span class="combate-prob">(${prob}%${a.id === "rafaga" ? " +cadencia" : ""})</span>`;
        if (a.disabled) btn.title = "Sin munición suficiente en el cargador";
      } else if (a.id === "recargar") {
        btn.textContent = a.etiqueta;
        if (a.disabled) btn.title = "Sin munición de reserva";
      } else {
        btn.textContent = a.etiqueta;
      }
      btn.addEventListener("click", () => {
        if (combateState.resolviendo) return; // guarda de doble-clic (punto 41)
        ejecutarAccionJugador(miembro, a.id, armaInfo);
      });
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

    const cargador = miembro.municion?.cargador ?? 0;
    const magSize = base.arma?.magazineSize ?? cargador;

    const acciones = [
      { id: "disparar", etiqueta: "Disparar", visible: !!(base.arma && miembro.municion), disabled: cargador < COSTO_MUNICION.disparar },
      { id: "recargar", etiqueta: "Recargar", visible: !!(base.arma && miembro.municion) && cargador < magSize, disabled: (miembro.municion?.reserva ?? 0) <= 0 },
      { id: "cubrirse", etiqueta: "Cubrirse", visible: true },
      { id: "mover", etiqueta: "Mover", visible: true },
      { id: "automatico", etiqueta: "Automático", visible: true }
    ];

    acciones.filter(a => a.visible).forEach(a => {
      const btn = document.createElement("button");
      btn.className = "btn-accion";
      btn.disabled = !!a.disabled;
      btn.textContent = a.etiqueta;
      btn.addEventListener("click", () => {
        if (combateState.resolviendo) return;
        if (a.id === "automatico") return ejecutarAccionAutomatica(miembro, armaInfo);
        ejecutarAccionJugador(miembro, a.id, armaInfo);
      });
      accionesEl.appendChild(btn);
    });
  }

  // Regla fija y transparente, no una IA compleja (punto 13 del encargo):
  //   1. si necesita recargar y puede -> recarga;
  //   2. si tiene arma a distancia con munición -> dispara al objetivo con
  //      menos vida visible;
  //   3. si no puede disparar (sin munición o sin arma) -> se cubre.
  // Nunca usa información que el personaje no tendría (solo estado visible:
  // estadoVisibleEnemigo(), nunca los PV exactos). Reutiliza exactamente
  // dispararA()/mostrarTirada() — el mismo resolvedor que el modo manual,
  // nunca un simulador aparte (punto 14).
  function ejecutarAccionAutomatica(miembro, armaInfo) {
    const base = miembro.base;
    const cargador = miembro.municion?.cargador ?? 0;
    const magSize = base.arma?.magazineSize ?? cargador;

    if (miembro.municion && cargador < COSTO_MUNICION.disparar && miembro.municion.reserva > 0) {
      const transferido = recargarArma(miembro.baseId);
      log(`${base.nombre} (automático) recarga — ${transferido} proyectiles al cargador.`);
      return siguienteTurno();
    }
    if (base.arma && miembro.municion && cargador >= COSTO_MUNICION.disparar) {
      const vivos = enemigosVivos();
      const objetivoDebil = [...vivos].sort((a, b) => a.pv - b.pv)[0];
      log(`${base.nombre} (automático) dispara al objetivo más débil visible.`);
      dispararA(miembro, "disparar", armaInfo, objetivoDebil);
      autoContinuarSiProcede();
    } else {
      const opcion = opcionesCobertura()[0];
      const nivel = valorCobertura(opcion.nivel);
      miembro.cobertura = nivel;
      establecerCobertura(miembro.baseId, nivel);
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
        const nivel = valorCobertura(opcion.nivel);
        miembro.cobertura = nivel;
        establecerCobertura(miembro.baseId, nivel);
        log(`${base.nombre} se agazapa tras ${opcion.etiqueta.toLowerCase()} (${etiquetaCoberturaVisible(opcion.nivel)}) hasta su próxima acción ofensiva.`);
        siguienteTurno();
      });
    }
    if (id === "mover") {
      log(`${base.nombre} se reposiciona.`);
      return siguienteTurno();
    }
    if (id === "recargar") {
      const transferido = recargarArma(miembro.baseId);
      if (transferido <= 0) { log(`${base.nombre} no tiene munición de reserva.`); return siguienteTurno(); }
      log(`${base.nombre} recarga — ${transferido} ${transferido === 1 ? "proyectil pasa" : "proyectiles pasan"} al cargador (${miembro.municion.cargador}/${miembro.municion.reserva}).`);
      renderAccionesJugador(miembro); // sigue siendo su turno: recargar consume la acción, pero refresca el HUD antes de resolver
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
      const costo = COSTO_MUNICION[id] ?? 1;
      if (!consumirMunicion(miembro.baseId, costo)) { log(`${base.nombre} no tiene munición suficiente.`); return siguienteTurno(); }
      skillId = armaInfo.nombre;
      habilidadBase = miembro.habilidades[skillId] ?? armaInfo.valor;
      danioBase = base.arma.danio;
      etiqueta = `${base.arma.nombre} — ${armaInfo.nombre}`;
      if (id === "rafaga") {
        cadenciaBonus = modificadorCadencia("rafaga", cadenciaData);
        etiqueta += " (Ráfaga)";
      }
    }

    miembro.cobertura = 0; // atacar rompe la cobertura activa
    establecerCobertura(miembro.baseId, 0);

    combateState.resolviendo = true;
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
    const blindajeEfectivo = Math.max(0, objetivo.blindaje + (objetivo.cobertura || 0));
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
    combateState.resolviendo = true;
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

    // Munición del enemigo (si su arma la declara): sin cargador suficiente
    // para ráfaga, cae a tiro simple; sin nada de cargador, no dispara ese
    // turno (misma regla que el jugador — punto 6 del encargo).
    const tieneMunicionEnemigo = !enemigo.municion || enemigo.municion.cargador >= 1;
    if (!tieneMunicionEnemigo) {
      log(`${enemigo.nombre} se queda sin munición y se cubre.`);
      enemigo.cobertura = valorCobertura("parcial");
      return siguienteTurno();
    }
    const puedeRafaga = !enemigo.municion || enemigo.municion.cargador >= 3;
    const usaRafaga = puedeRafaga && Math.random() > 0.5;
    if (enemigo.municion) enemigo.municion.cargador -= (usaRafaga ? 3 : 1);
    const cadenciaBonus = usaRafaga ? modificadorCadencia("rafaga", cadenciaData) : 0;
    const cobertura = objetivo.cobertura || 0;
    enemigo.cobertura = 0; // atacar rompe su propia cobertura, igual que al jugador

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
        // Bajo control automático (compañero en modo auto, o CUALQUIERA en
        // AUTOMÁTICO) nadie va a pulsar este diálogo — dejarlo esperando
        // congelaría el combate para siempre (punto 15/36 del encargo: el
        // motor nunca debe quedarse colgado en un modo automático). La
        // decisión por defecto de un piloto automático es sobrevivir:
        // gastar el Punto Épico, igual que casi cualquier jugador real
        // elegiría en su lugar. En modo manual (o PJ manual con este
        // miembro bajo control humano) se sigue preguntando de verdad.
        const bajoControlAutomatico = combateState.modo === "automatico"
          || (combateState.modo === "pj_manual_auto" && !esJugador(objetivo.baseId));
        if (bajoControlAutomatico) {
          log(`${objetivo.base.nombre} (automático) gasta un Punto Épico para sobrevivir al golpe.`);
          gastarPuntoEpico(objetivo.baseId);
          establecerDisponibilidad(objetivo.baseId, "inconsciente");
          aplicarConsecuencias(escena.onDeathWithEpicPoint, objetivo.baseId, { onTexto: () => {} });
          return;
        }
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

  renderTactico();
  siguienteTurno();
}
