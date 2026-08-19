import { state, obtenerJugador, nivelHeridaDe } from "../gameState.js";
import { rutaAsset } from "../engine/moduleLoader.js";
import { fichaColapsada, establecerFichaColapsada } from "./uiSettings.js";

// Ficha lateral: solo la información necesaria en cada momento. `contexto` decide
// qué bloques adicionales se muestran (exploración / persecución / combate) — ver
// docs/PARTY_SYSTEM.md, sección HUD dinámico.
//
// Iteración 0.3 (UI/UX): plegable — el escenario debe poder recuperar el
// espacio que ocupa la ficha (punto 7-9 del encargo). Estado persistido en
// uiSettings.js, nunca perdido al remontar. Colapsada, se muestra una tira
// compacta con lo crítico (nombre/vida/PE/estado) — nunca un icono sin
// texto: "no diseñar una mini-ficha ilegible".
export function renderFicha(container, contexto = "callejon") {
  const m = obtenerJugador();
  if (!m) { container.innerHTML = ""; container.classList.remove("colapsada"); return; }
  const base = m.base;

  const nivel = nivelHeridaDe(m);
  const vida = m.vidaActual;
  const totalVida = base.niveles.sano + base.niveles.herido + base.niveles.tullido;
  const vidaRestante = vida.sano + vida.herido + vida.tullido;
  const colapsada = fichaColapsada();
  container.classList.toggle("colapsada", colapsada);

  const iconoToggle = colapsada ? "‹" : "›";
  const tituloToggle = colapsada ? "Mostrar ficha" : "Ocultar ficha";
  const botonToggle = `<button type="button" class="ficha-toggle" id="btn-ficha-toggle" aria-label="${tituloToggle}" aria-expanded="${!colapsada}" title="${tituloToggle}">${iconoToggle}</button>`;

  if (colapsada) {
    const epicosCompacto = `${m.puntosEpicosActuales}/${base.puntosEpicos}`;
    container.innerHTML = `
      ${botonToggle}
      <div class="ficha-compacta" id="btn-ficha-expandir" role="button" tabindex="0" aria-label="Mostrar ficha completa">
        <div class="fc-nombre">${base.nombre}</div>
        <div class="fc-vida">${nivel.toUpperCase()} · ${vidaRestante}/${totalVida}</div>
        <div class="fc-pe">PE ${epicosCompacto}</div>
      </div>
    `;
    const expandir = () => { establecerFichaColapsada(false); renderFicha(container, contexto); };
    container.querySelector("#btn-ficha-toggle")?.addEventListener("click", expandir);
    const compacta = container.querySelector("#btn-ficha-expandir");
    compacta?.addEventListener("click", expandir);
    compacta?.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); expandir(); } });
    return;
  }

  const epicos = Array.from({ length: base.puntosEpicos }, (_, i) =>
    `<span class="ep-dot ${i < m.puntosEpicosActuales ? "activo" : ""}">●</span>`).join("");

  let bloqueContextual = "";
  if (contexto === "combate") {
    // Arma activa (punto 20 del encargo): el runtime ya conoce
    // munición/cargador/reserva desde Combat UX 0.2 (m.municion) — mostrarlo
    // aquí es solo lectura, no una mecánica nueva de selección de equipo.
    const municionTexto = m.municion ? `${m.municion.cargador}/${m.municion.reserva}` : null;
    bloqueContextual = `
      <div class="ficha-bloque">
        <div class="ficha-titulo">Arma activa</div>
        <div>${base.arma?.nombre ?? "—"} — daño ${base.arma?.danio ?? 0}${base.arma?.cadenciaMax ? " · " + base.arma.cadenciaMax : ""}</div>
        ${municionTexto ? `<div class="ficha-municion">${municionTexto}</div>` : ""}
        <div class="ficha-titulo">Protección</div>
        <div>${base.armadura?.blindaje ? base.armadura.nombre + " (Blindaje " + base.armadura.blindaje + ")" : "Sin protección"}</div>
        <div class="ficha-titulo">Estado</div>
        <div>${m.estadoDisponibilidad}</div>
      </div>`;
  } else if (contexto === "persecucion") {
    const ep = state.estadoPersecucion;
    bloqueContextual = `
      <div class="ficha-bloque">
        <div class="ficha-titulo">Atlética / Esquivar</div>
        <div>${base.habilidades["Atlética"]} / ${base.habilidades["Esquivar"]}</div>
        <div class="ficha-titulo">Persecución</div>
        <div>${ep ? `Perseguidor a ${ep.distanciaActual?.toFixed?.(1) ?? "—"} m` : "—"}</div>
        <div class="ficha-titulo">Objetivo</div>
        <div>${ep?.objetivo ?? "Llegar a un refugio o vehículo"}</div>
      </div>`;
  }

  container.innerHTML = `
    ${botonToggle}
    <div class="ficha">
      <img class="ficha-retrato" src="${rutaAsset(base.retrato)}" alt="${base.nombre}">
      <div class="ficha-nombre">${base.nombre}</div>
      <div class="ficha-rol">${base.rol}</div>

      <div class="ficha-bloque">
        <div class="ficha-titulo">Vida (${nivel.toUpperCase()})</div>
        <div class="barra-vida"><div class="barra-vida-fill" style="width:${Math.max(0, (vidaRestante / totalVida) * 100)}%"></div></div>
        <div class="vida-detalle">Sano ${vida.sano}/${base.niveles.sano} · Herido ${vida.herido}/${base.niveles.herido} · Tullido ${vida.tullido}/${base.niveles.tullido}</div>
      </div>

      ${bloqueContextual}

      <div class="ficha-bloque">
        <div class="ficha-titulo">Puntos Épicos</div>
        <div class="ep-dots">${epicos}</div>
      </div>

      <div class="ficha-bloque">
        <div class="ficha-titulo">Inventario</div>
        <ul class="ficha-inventario">${m.inventario.map(i => `<li>${i}</li>`).join("")}</ul>
      </div>

      <button class="btn-historial" id="btn-abrir-historial">Historial de tiradas</button>
    </div>
  `;

  container.querySelector("#btn-ficha-toggle")?.addEventListener("click", () => {
    establecerFichaColapsada(true);
    renderFicha(container, contexto);
  });
  container.querySelector("#btn-abrir-historial")?.addEventListener("click", () => {
    import("./rollLog.js").then(m => m.mostrarHistorial());
  });
}
