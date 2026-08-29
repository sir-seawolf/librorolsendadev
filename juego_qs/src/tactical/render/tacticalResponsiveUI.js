// Interfaz táctica DOM responsive -- Production Integration Phase 6B
// (docs/TACTICAL_PRODUCTION_PHASE6_AUDIT.md §5,
// docs/PROPUESTA_UI_TACTICA_RESPONSIVE_PREDATOR.md).
//
// Capa HTML/CSS montada como hermana del <canvas> de Phaser dentro de
// `#tactical-root` -- NUNCA dibuja sobre el canvas ni compite por su
// input de tablero (clics de movimiento/selección de objetivo siguen
// siendo responsabilidad de TacticalScene, sin cambios). Esta capa
// SOLO: (a) muestra el snapshot que emite `tactical-ui-state`, (b)
// traduce clics/toques/teclado en llamadas al controlador de acciones
// compartido (tacticalActionController.js, vía `scene.controlador`) o
// al puente mínimo `scene.alternarModoMover()`. Cero lógica de reglas
// aquí -- si una acción es legal o no ya viene decidido en el snapshot
// (tacticalActionCatalog.js).
//
// Detrás de `config.tactical.responsiveUI` (dev flag, default false) --
// ver TacticalScene.js `_montarInterfazResponsive()`.
import { construirSnapshotUI } from "./tacticalUIState.js";

const ESTILOS_ID = "tactical-responsive-ui-styles";

// Colores Y recurso de panel vía la capa de tema (encargo de sesión,
// 2026-08-21, ver theme.css): esta interfaz genérica ya NO fija su
// propia paleta ni conoce ningún recurso concreto de ningún módulo --
// lee los mismos tokens semánticos que el resto del motor (`--color-*`,
// `--panel-decorado`), seleccionados por `[data-theme]` según el
// módulo activo (moduleLoader.js). Con eso, la estructura de esta
// interfaz no cambia nunca por tema, solo su color/decoración:
// exactamente lo pedido ("la estructura, dimensiones y comportamiento
// de la interfaz no cambian con el tema"). Qué textura (si alguna) usa
// cada tema para `--panel-decorado` -- p.ej. la textura CC0 de hormigón
// del tema predator-urban, ver docs/PREDATOR_VISUAL_RESOURCES_MANIFEST_6D.md
// -- es responsabilidad exclusiva de theme.css, no de este archivo:
// este motor es agnóstico de módulo (ver tests/tacticalCoreHygiene.test.mjs).
// Mapeo semántico (mismo criterio que theme.css): superficie/borde son
// fondo neutro; texto es la información legible; selección es el
// acento de decisión; peligro es el aviso de riesgo; información es el
// acento instrumental, usado con moderación, nunca como color base.
const CSS = `
.tui-root { position: absolute; inset: 0; pointer-events: none; font-family: "Barlow Condensed", sans-serif; color: var(--color-texto); z-index: 500; }
.tui-root * { box-sizing: border-box; }
.tui-root button { font-family: inherit; cursor: pointer; }
.tui-summary { position: absolute; top: 8px; left: 8px; pointer-events: auto; }
.tui-summary-btn {
  display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 6px 12px;
  background: rgba(20,23,25,0.9); border: 1px solid var(--color-borde); border-radius: 3px; color: var(--color-texto); font-size: 12px;
  /* La economía de acciones (Hallazgo 3) alarga el texto de estado --
     se limita el ancho al viewport real y se deja envolver en vez de
     desbordar fuera de pantalla en móvil. */
  max-width: min(360px, calc(100vw - 16px));
}
.tui-summary-estado { white-space: normal; }
.tui-summary-btn:focus-visible, .tui-root button:focus-visible { outline: 2px solid var(--color-seleccion); outline-offset: 2px; }
/* Retrato provisional (encargo de sesión, 2026-08-21): placa
   chaflanada en vez de círculo plano -- lenguaje de "credencial/rango"
   de terminal militar, sin depender de ningún recurso de icono nuevo
   (evita abrir un sourcing CC0 para algo tan pequeño). */
.tui-summary-portrait {
  width: 22px; height: 22px; flex: none; background: var(--color-informacion);
  clip-path: polygon(30% 0, 100% 0, 100% 70%, 70% 100%, 0 100%, 0 30%);
}
.tui-summary-portrait.abajo { background: #555; }
.tui-summary-nombre { font-weight: bold; letter-spacing: .3px; }
.tui-summary-estado { font-size: 10px; color: var(--color-informacion); }
.tui-summary-estado.herido { color: var(--color-seleccion); }
.tui-summary-estado.tullido { color: var(--color-peligro); }

.tui-sheet {
  position: absolute; pointer-events: auto; border: 1px solid var(--color-borde);
  overflow-y: auto; padding: 14px; font-size: 12px; line-height: 1.6; color: var(--color-texto);
  background-color: var(--color-superficie);
  background-image: var(--panel-decorado, none);
  background-size: cover; background-position: center;
}
.tui-sheet[hidden] { display: none; }
/* Marco industrial discreto (encargo de sesión, 2026-08-21): esquinas
   marcadas en el panel principal, motivo de "placa/terminal" ya
   establecido en el resto de la interfaz -- puramente decorativo
   (.tui-sheet ya es position:absolute, así que estas esquinas se
   posicionan contra ese mismo bloque; no reserva espacio ni desplaza
   ningún hijo). */
.tui-sheet::before, .tui-sheet::after {
  content: ""; position: absolute; width: 14px; height: 14px; pointer-events: none; opacity: .55;
  border-color: var(--color-informacion); border-style: solid; border-width: 0;
}
.tui-sheet::before { top: 6px; left: 6px; border-top-width: 2px; border-left-width: 2px; }
.tui-sheet::after { bottom: 6px; right: 6px; border-bottom-width: 2px; border-right-width: 2px; }
.tui-sheet h3 { margin: 0 0 8px; font-size: 14px; color: var(--color-seleccion); letter-spacing: .5px; }
.tui-sheet .tui-close { position: sticky; top: 0; float: right; min-width: 44px; min-height: 44px; background: var(--color-fondo); border: 1px solid var(--color-borde); color: var(--color-peligro); border-radius: 3px; }
.tui-sheet dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; margin: 0; }
.tui-sheet dt { color: var(--color-informacion); }

.tui-actionbar {
  position: absolute; left: 0; right: 0; bottom: 0; pointer-events: auto;
  display: flex; gap: 6px; padding: 8px; background: rgba(20,23,25,0.85); flex-wrap: wrap;
  border-top: 1px solid var(--color-borde);
}
.tui-actionbar::before {
  content: ""; position: absolute; top: 4px; left: 4px; width: 14px; height: 14px; opacity: .55; pointer-events: none;
  border-top: 2px solid var(--color-informacion); border-left: 2px solid var(--color-informacion);
}
.tui-fam-btn, .tui-contextual-btn {
  min-width: 44px; min-height: 44px; padding: 6px 14px; background: var(--color-fondo); border: 1px solid var(--color-borde);
  color: var(--color-texto); border-radius: 3px; font-size: 13px; letter-spacing: .3px;
}
/* Acento por familia (MATRIZ_UI_ACCIONES_PREDATOR.md §"Lenguaje visual") --
   el color nunca es el único código: cada botón lleva su etiqueta de
   texto siempre visible, el color solo refuerza. */
.tui-fam-btn[data-familia="ofensivas"][aria-expanded="true"] { border-color: var(--color-peligro); color: var(--color-peligro); }
.tui-fam-btn[data-familia="tacticas"][aria-expanded="true"] { border-color: var(--color-informacion); color: var(--color-informacion); }
.tui-fam-btn[data-familia="defensivas"][aria-expanded="true"] { border-color: var(--color-seleccion); color: var(--color-seleccion); }
.tui-fam-btn.tui-todas-ilegales { opacity: 0.45; }
.tui-contextual-btn { margin-left: auto; color: var(--color-peligro); }
.tui-contextual-btn.tui-activo { border-color: var(--color-seleccion); color: var(--color-seleccion); }

.tui-tray {
  position: absolute; left: 8px; right: 8px; bottom: 60px; pointer-events: auto;
  background: rgba(20,23,25,0.97); border: 1px solid var(--color-borde); border-radius: 4px; padding: 8px;
  display: flex; flex-direction: column; gap: 4px; max-height: 40vh; overflow-y: auto;
}
.tui-tray[hidden] { display: none; }
.tui-action-btn {
  min-height: 44px; padding: 6px 10px; text-align: left; background: var(--color-fondo); border: 1px solid var(--color-borde);
  color: var(--color-texto); border-radius: 3px; font-size: 12px; display: flex; justify-content: space-between; gap: 8px;
}
.tui-action-btn[disabled] { opacity: 0.4; cursor: not-allowed; color: #999; }
.tui-action-btn .tui-motivo { font-size: 10px; color: var(--color-peligro); }

.tui-flow {
  position: absolute; left: 8px; right: 8px; bottom: 60px; pointer-events: auto;
  background: rgba(20,23,25,0.98); border: 1px solid var(--color-seleccion); border-radius: 4px; padding: 10px;
  display: flex; flex-direction: column; gap: 8px; color: var(--color-texto);
}
.tui-flow[hidden] { display: none; }
.tui-flow-botones { display: flex; gap: 8px; }
.tui-flow-botones button { flex: 1; min-height: 44px; border-radius: 3px; border: 1px solid var(--color-borde); font-size: 13px; }
.tui-flow-confirmar { background: rgba(101,183,199,0.15); color: var(--color-informacion); border-color: var(--color-informacion); }
.tui-flow-confirmar[disabled] { opacity: 0.4; cursor: not-allowed; }
.tui-flow-cancelar { background: rgba(184,75,71,0.12); color: var(--color-peligro); border-color: var(--color-peligro); }

/* PC (puntero fino, ancho suficiente): ficha como panel lateral */
@media (min-width: 900px) and (pointer: fine) {
  .tui-sheet { top: 0; right: 0; bottom: 0; width: 320px; border-left: 1px solid var(--color-borde); border-top: none; border-bottom: none; border-right: none; }
}
/* Móvil vertical: ficha como hoja inferior (65-75% alto) */
@media (max-width: 899px), (pointer: coarse) {
  @media (orientation: portrait) {
    .tui-sheet { left: 0; right: 0; bottom: 0; height: 70dvh; border-radius: 12px 12px 0 0; border-top: 1px solid var(--color-borde); border-left: none; border-right: none; border-bottom: none; }
    .tui-sheet-grabber { display: block; width: 40px; height: 4px; background: var(--color-borde); border-radius: 2px; margin: 0 auto 8px; }
  }
  /* Móvil horizontal: ficha como panel lateral 35-40% ancho */
  @media (orientation: landscape) {
    .tui-sheet { top: 0; right: 0; bottom: 0; width: 38%; border-left: 1px solid var(--color-borde); border-top: none; border-bottom: none; border-right: none; }
  }
}
.tui-sheet-grabber { display: none; }
`;

function asegurarEstilos() {
  if (document.getElementById(ESTILOS_ID)) return;
  const style = document.createElement("style");
  style.id = ESTILOS_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

const LABEL_FAMILIA = { ofensivas: "Ofensivas", tacticas: "Tácticas", defensivas: "Defensivas" };
const MOTIVO_LEGIBLE = {
  NO_AMMO: "sin munición", NO_RESERVE: "sin reserva", MAIN_ACTION_SPENT: "acción ya gastada",
  MINOR_ACTION_SPENT: "acción menor ya gastada", NOT_ENOUGH_MOVEMENT: "sin movimiento suficiente",
  NO_MOVEMENT_REMAINING: "sin movimiento restante", TARGET_FULLY_COVERED: "objetivo sin línea de tiro",
  NO_SECONDARY_WEAPON: "sin arma secundaria", NO_DODGE_CAPABILITY: "sin capacidad de esquiva",
  NO_TARGETS_AVAILABLE: "sin objetivos", WEAPON_ALREADY_READY: "arma ya lista",
  POSITION_OCCUPIED: "posición ocupada por otro actor"
};
function motivoLegible(reasons) {
  if (!reasons?.length) return "";
  return reasons.map(r => MOTIVO_LEGIBLE[r] ?? r).join(", ");
}

/**
 * @param {HTMLElement} rootEl - `#tactical-root`, mismo contenedor del <canvas>
 * @param {import("./TacticalScene.js").TacticalScene} scene
 * @returns {{destroy(): void}}
 */
export function montarInterfazResponsive(rootEl, scene) {
  asegurarEstilos();

  const estado = { fichaAbierta: false, familiaAbierta: null, accionPreparada: null, hoverTimer: null };

  const root = document.createElement("div");
  root.className = "tui-root";

  const summary = document.createElement("div");
  summary.className = "tui-summary";
  const summaryBtn = document.createElement("button");
  summaryBtn.className = "tui-summary-btn";
  summaryBtn.setAttribute("aria-haspopup", "dialog");
  summaryBtn.innerHTML = `<span class="tui-summary-portrait"></span><span><span class="tui-summary-nombre"></span><br><span class="tui-summary-estado"></span></span>`;
  summary.appendChild(summaryBtn);

  const sheet = document.createElement("div");
  sheet.className = "tui-sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-label", "Ficha del personaje");
  sheet.hidden = true;

  const actionbar = document.createElement("div");
  actionbar.className = "tui-actionbar";
  const botonesFamilia = {};
  for (const fam of ["ofensivas", "tacticas", "defensivas"]) {
    const b = document.createElement("button");
    b.className = "tui-fam-btn";
    b.type = "button";
    b.dataset.familia = fam;
    b.textContent = LABEL_FAMILIA[fam];
    b.setAttribute("aria-expanded", "false");
    b.setAttribute("aria-haspopup", "true");
    actionbar.appendChild(b);
    botonesFamilia[fam] = b;
  }
  const contextualBtn = document.createElement("button");
  contextualBtn.className = "tui-contextual-btn";
  contextualBtn.type = "button";
  contextualBtn.textContent = "Terminar";
  actionbar.appendChild(contextualBtn);

  const tray = document.createElement("div");
  tray.className = "tui-tray";
  tray.hidden = true;
  tray.setAttribute("role", "menu");

  const flow = document.createElement("div");
  flow.className = "tui-flow";
  flow.hidden = true;

  root.append(summary, sheet, tray, flow, actionbar);
  rootEl.appendChild(root);

  let ultimoSnapshot = construirSnapshotUI(scene.session, scene.adapter, scene.session.currentActorId, { modoMoverActivo: scene._modoMover });

  function cerrarTray() { estado.familiaAbierta = null; tray.hidden = true; for (const fam in botonesFamilia) botonesFamilia[fam].setAttribute("aria-expanded", "false"); }
  function cerrarFlow() { estado.accionPreparada = null; flow.hidden = true; }
  function cerrarFicha() { estado.fichaAbierta = false; sheet.hidden = true; }

  // CORRECCIÓN (verificación de activación 6B, 2026-08-21): la barra de
  // familias puede envolver a más de una fila en un viewport estrecho
  // (4 botones -- 3 familias + Terminar -- no siempre caben en una
  // fila). Un `bottom` fijo en CSS asumía una altura de barra constante
  // y la bandeja/el flujo de confirmación quedaban parcialmente debajo
  // de la barra real cuando esta envolvía. Se posiciona en JS con la
  // altura REAL medida de la barra (mismo criterio que la corrección
  // del menú contextual táctil en narrative.js).
  function ajustarSobreBarra(el) {
    el.style.bottom = `${actionbar.getBoundingClientRect().height + 4}px`;
  }

  function abrirFamilia(fam) {
    cerrarFlow();
    if (estado.familiaAbierta === fam) { cerrarTray(); return; }
    estado.familiaAbierta = fam;
    for (const f in botonesFamilia) botonesFamilia[f].setAttribute("aria-expanded", String(f === fam));
    renderTray();
    ajustarSobreBarra(tray);
    tray.hidden = false;
  }

  function ejecutarAccionSimple(id) {
    const c = scene.controlador;
    if (id === "mover") { scene.alternarModoMover(); cerrarTray(); return; }
    if (id === "recargar") c.recargar();
    else if (id === "cambiarArma") c.cambiarArma();
    else if (id === "defender") c.defender();
    else if (id === "esquivar") c.evadir();
    cerrarTray();
  }

  function prepararAccionConObjetivo(accion) {
    estado.accionPreparada = accion;
    cerrarTray();
    renderFlow();
    ajustarSobreBarra(flow);
    flow.hidden = false;
  }

  function onAccionElegida(accion) {
    if (!accion.legal) return;
    if (accion.id === "disparar" || accion.id === "cc") prepararAccionConObjetivo(accion);
    else ejecutarAccionSimple(accion.id);
  }

  function renderTray() {
    tray.innerHTML = "";
    const acciones = ultimoSnapshot.catalogo.familias[estado.familiaAbierta] ?? [];
    for (const a of acciones) {
      const btn = document.createElement("button");
      btn.className = "tui-action-btn";
      btn.type = "button";
      btn.disabled = !a.legal;
      btn.setAttribute("role", "menuitem");
      btn.setAttribute("aria-disabled", String(!a.legal));
      btn.innerHTML = `<span>${a.label}</span>${!a.legal ? `<span class="tui-motivo">${motivoLegible(a.reasons)}</span>` : ""}`;
      btn.addEventListener("click", () => onAccionElegida(a));
      tray.appendChild(btn);
    }
  }

  function renderFlow() {
    const a = estado.accionPreparada;
    if (!a) return;
    const necesitaObjetivo = a.id === "disparar" || a.id === "cc";
    const objetivoListo = !necesitaObjetivo || !!ultimoSnapshot.targetActorId;
    flow.innerHTML = `
      <div><strong>${a.label}</strong></div>
      <div>${necesitaObjetivo ? (ultimoSnapshot.targetActorId ? `Objetivo: ${ultimoSnapshot.targetActorId}` : "Selecciona un objetivo en el tablero.") : "Confirma para ejecutar."}</div>
      <div class="tui-flow-botones">
        <button class="tui-flow-confirmar" type="button" ${objetivoListo ? "" : "disabled"}>Confirmar</button>
        <button class="tui-flow-cancelar" type="button">Cancelar</button>
      </div>`;
    flow.querySelector(".tui-flow-confirmar").addEventListener("click", () => {
      if (a.id === "disparar") scene.controlador.atacar(ultimoSnapshot.targetActorId, { cc: false });
      else if (a.id === "cc") scene.controlador.atacar(ultimoSnapshot.targetActorId, { cc: true });
      cerrarFlow();
    });
    flow.querySelector(".tui-flow-cancelar").addEventListener("click", cerrarFlow);
  }

  function renderSheet() {
    const f = ultimoSnapshot.ficha;
    sheet.innerHTML = `<div class="tui-sheet-grabber"></div><button class="tui-close" type="button" aria-label="Cerrar ficha">✕</button><h3>${f?.nombre ?? "--"}</h3>`;
    if (f) {
      const dl = document.createElement("dl");
      dl.innerHTML = `
        <dt>Herida</dt><dd>${f.nivelHerida}</dd>
        <dt>PV</dt><dd>${f.vida.sano}/${f.vida.herido}/${f.vida.tullido}</dd>
        <dt>Disparo</dt><dd>${f.habilidadDisparo ?? "--"}</dd>
        <dt>CaC</dt><dd>${f.habilidadCC ?? "--"}</dd>
        <dt>Esquiva</dt><dd>${f.habilidadEsquivar ?? "sin esquiva"}</dd>
        <dt>Arma activa</dt><dd>${f.armaActiva}</dd>`;
      sheet.appendChild(dl);
    }
    sheet.querySelector(".tui-close").addEventListener("click", cerrarFicha);
  }

  function renderResumen() {
    const r = ultimoSnapshot.resumen;
    const portrait = summaryBtn.querySelector(".tui-summary-portrait");
    const nombre = summaryBtn.querySelector(".tui-summary-nombre");
    const estadoEl = summaryBtn.querySelector(".tui-summary-estado");
    if (!r) { nombre.textContent = "Sin actor activo"; estadoEl.textContent = ""; portrait.classList.remove("abajo"); return; }
    nombre.textContent = r.nombre;
    portrait.classList.toggle("abajo", r.abajo);
    estadoEl.className = `tui-summary-estado ${r.nivelHerida}`;
    // "Economía de acciones visible" (Hallazgo 3 del playtest real,
    // encargo de cierre vertical 2026-08-22): acción principal, acción
    // menor y movimiento restante ya los calcula el motor
    // (activation.mainActionAvailable/minorActionAvailable/
    // movementRemaining, ver tacticalUIState.js resumenCompacto) -- antes
    // solo se mostraba el movimiento. No son fórmulas nuevas, solo se
    // exponen las que ya existían.
    const accionTxt = r.accionPrincipalDisponible === null ? "" : ` · acción ${r.accionPrincipalDisponible ? "libre" : "gastada"}`;
    const menorTxt = r.accionMenorDisponible === null ? "" : ` · menor ${r.accionMenorDisponible ? "libre" : "gastada"}`;
    estadoEl.textContent = r.abajo ? "ABAJO" : `${r.nivelHerida} · mov ${r.movimientoRestante}m${accionTxt}${menorTxt} · ${r.arma.nombre} ${r.arma.cargador}/${r.arma.reserva}`;
  }

  function renderContextual() {
    contextualBtn.classList.toggle("tui-activo", ultimoSnapshot.modoMoverActivo);
    const activo = !!ultimoSnapshot.resumen?.esControladoPorJugador && !ultimoSnapshot.resultado;
    for (const fam in botonesFamilia) {
      const acciones = ultimoSnapshot.catalogo.familias[fam] ?? [];
      botonesFamilia[fam].disabled = !activo;
      botonesFamilia[fam].classList.toggle("tui-todas-ilegales", acciones.length > 0 && acciones.every(a => !a.legal));
    }
    contextualBtn.disabled = !activo;
  }

  function onEstado(snapshot) {
    ultimoSnapshot = snapshot;
    renderResumen();
    renderContextual();
    if (estado.fichaAbierta) renderSheet();
    if (estado.familiaAbierta) renderTray();
    if (estado.accionPreparada) renderFlow();
  }

  // ===== Interacción =====
  summaryBtn.addEventListener("click", () => {
    estado.fichaAbierta = !estado.fichaAbierta;
    sheet.hidden = !estado.fichaAbierta;
    if (estado.fichaAbierta) renderSheet();
  });

  for (const fam in botonesFamilia) {
    const btn = botonesFamilia[fam];
    btn.addEventListener("click", () => abrirFamilia(fam));
    // Hover/foco con retardo (solo ratón real -- el hover NUNCA ejecuta,
    // solo previsualiza; PROPUESTA_UI_TACTICA_RESPONSIVE_PREDATOR.md §4).
    btn.addEventListener("mouseenter", () => {
      if (estado.familiaAbierta) return; // ya hay una fijada -- el hover no la reemplaza
      estado.hoverTimer = window.setTimeout(() => { estado.familiaAbierta = fam; renderTray(); ajustarSobreBarra(tray); tray.hidden = false; }, 300);
    });
    btn.addEventListener("mouseleave", () => {
      window.clearTimeout(estado.hoverTimer);
    });
  }

  // CORRECCIÓN (Hallazgo 2 del playtest real, encargo de cierre
  // vertical 2026-08-22): llamar a `scene.controlador.terminarActuacion()`
  // directamente ejecuta el coste de fin de actuación pero NUNCA cede
  // el turno -- `_avanzarTurno()` solo lo llama el método de la
  // ESCENA `_accionTerminarActuacion()` (ver TacticalScene.js, usado
  // por el panel clásico), no el controlador puro. La bandeja 6B
  // llamaba solo al controlador, así que "Terminar" quedaba sin
  // efecto visible: reproducido en vivo ("Turno de Salim (manual)"
  // seguía activo después de pulsar Terminar). Se reutiliza el mismo
  // método de escena que ya usa el panel clásico -- cero lógica nueva.
  contextualBtn.addEventListener("click", () => scene._accionTerminarActuacion());

  document.addEventListener("keydown", onKeydown);
  function onKeydown(e) {
    if (e.key !== "Escape") return;
    if (!flow.hidden) { cerrarFlow(); return; }
    if (!tray.hidden) { cerrarTray(); return; }
    if (estado.fichaAbierta) cerrarFicha();
  }

  function onClickFuera(e) {
    if (root.contains(e.target)) return;
    cerrarTray();
  }
  scene.game.canvas?.addEventListener("pointerdown", onClickFuera);

  // Giro de móvil (encargo: "sin perder acción ni turno"): el estado
  // (familia abierta, acción preparada) ya sobrevive sin más -- vive en
  // `estado`, ajeno al ciclo de vida de Phaser -- pero la POSICIÓN de la
  // bandeja/flujo (dependiente de la altura real de la barra, ver
  // ajustarSobreBarra) sí debe recalcularse si la orientación cambia
  // mientras están abiertos.
  function onResize() {
    if (!tray.hidden) ajustarSobreBarra(tray);
    if (!flow.hidden) ajustarSobreBarra(flow);
  }
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);

  scene.events.on("tactical-ui-state", onEstado);
  renderResumen();
  renderContextual();

  return {
    destroy() {
      scene.events.off("tactical-ui-state", onEstado);
      document.removeEventListener("keydown", onKeydown);
      scene.game.canvas?.removeEventListener("pointerdown", onClickFuera);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      window.clearTimeout(estado.hoverTimer);
      root.remove();
    }
  };
}
