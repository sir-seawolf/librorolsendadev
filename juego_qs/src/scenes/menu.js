import { state, iniciarPartida, cambiarEscena, cargar, hayPartidaGuardada, borrarGuardado } from "../gameState.js";
import { manifiestoActivo, rutaDeManifiesto, rutaAsset } from "../engine/moduleLoader.js";

const personajesCachePorModulo = new Map();
async function cargarPersonajes() {
  const ruta = rutaDeManifiesto("characters");
  if (personajesCachePorModulo.has(ruta)) return personajesCachePorModulo.get(ruta);
  const res = await fetch(ruta);
  const data = await res.json();
  personajesCachePorModulo.set(ruta, data.pregenerados);
  return data.pregenerados;
}

export function montarMenu(container) {
  const manifest = manifiestoActivo();
  const wrap = document.createElement("div");
  wrap.className = "menu-screen";
  const continuarDisponible = hayPartidaGuardada();
  // Entradas de desarrollo (encargo de calibración, 2026-08-22): campo
  // genérico del module.json, mismo patrón que "theme"/"music" -- este
  // archivo no conoce ningún id de escena por nombre, solo pinta lo que el
  // manifiesto declare. Ningún módulo sin devEntryPoints ve nada distinto.
  const entradasDev = manifest.devEntryPoints || [];
  wrap.innerHTML = `
    <div class="menu-titulo">LA SENDA DE LOS ERRANTES</div>
    <div class="menu-subtitulo">${manifest.title}${manifest.subtitle ? " — " + manifest.subtitle : ""}</div>
    <div class="menu-botones">
      <button class="btn-menu" id="btn-nueva">Nueva partida</button>
      <button class="btn-menu" id="btn-continuar" ${continuarDisponible ? "" : "disabled"}>Continuar partida</button>
      <button class="btn-menu" id="btn-como">Cómo jugar</button>
      <button class="btn-menu" id="btn-creditos">Créditos / prototipo</button>
      <button class="btn-menu" id="btn-borrar" ${continuarDisponible ? "" : "disabled"}>Borrar partida</button>
    </div>
    ${entradasDev.length ? `
    <div class="menu-dev-entradas">
      <div class="menu-dev-etiqueta">Desarrollo</div>
      ${entradasDev.map(e => `<button class="btn-menu btn-menu-dev" data-dev-scene="${e.id}" title="${e.nota || ""}">${e.label}</button>`).join("")}
    </div>` : ""}
    <p class="volver-modulos"><a href="#" id="link-cambiar-modulo">&larr; Cambiar de módulo</a></p>
  `;
  container.appendChild(wrap);

  wrap.querySelector("#btn-nueva").addEventListener("click", () => montarSeleccion(container));
  wrap.querySelector("#btn-continuar").addEventListener("click", () => {
    if (cargar()) return; // cargar() ya dispara la navegación a la escena guardada
  });
  wrap.querySelector("#btn-como").addEventListener("click", () => montarComoJugar(container));
  wrap.querySelector("#btn-creditos").addEventListener("click", () => montarCreditos(container));
  wrap.querySelector("#btn-borrar").addEventListener("click", () => {
    borrarGuardado();
    montarMenu(replace(container));
  });
  wrap.querySelector("#link-cambiar-modulo").addEventListener("click", (e) => {
    e.preventDefault();
    cambiarEscena("module_select");
  });
  wrap.querySelectorAll(".btn-menu-dev").forEach(btn => {
    btn.addEventListener("click", async () => {
      // Una entrada de desarrollo debe poder abrirse sin pasar antes por la
      // selección de personaje real -- si no hay ya un personaje activo EN
      // MEMORIA (no solo guardado en disco, para no pisar una partida en
      // curso sin guardar), arranca con el primer pregenerado solo para
      // tener un actor con el que probar la escena.
      if (!state.playerCharacterId) {
        const personajes = await cargarPersonajes();
        iniciarPartida(personajes, personajes[0].id);
      }
      cambiarEscena(btn.dataset.devScene);
    });
  });
}

async function montarSeleccion(container) {
  const personajes = await cargarPersonajes();
  const wrap = document.createElement("div");
  wrap.className = "menu-screen";
  wrap.innerHTML = `
    <div class="menu-subtitulo">ELEGIR PREGENERADO</div>
    <div class="seleccion-grid">
      ${personajes.map(p => `
        <div class="card-pj" data-id="${p.id}">
          <img src="${rutaAsset(p.retrato)}" alt="${p.nombre}">
          <div class="cp-nombre">${p.nombre}</div>
          <div class="cp-rol">${p.rol}</div>
          ${p.fortaleza ? `<div class="cp-fortaleza">${p.fortaleza}</div>` : ""}
        </div>`).join("")}
    </div>
    <button class="btn-menu" id="btn-volver" style="width:320px;margin-top:10px">Volver</button>
  `;
  container.innerHTML = "";
  container.appendChild(wrap);

  wrap.querySelectorAll(".card-pj").forEach(card => {
    card.addEventListener("click", () => {
      iniciarPartida(personajes, card.dataset.id);
      cambiarEscena(manifiestoActivo().startScene);
    });
  });
  wrap.querySelector("#btn-volver").addEventListener("click", () => montarMenu(replace(container)));
}

function montarComoJugar(container) {
  const wrap = document.createElement("div");
  wrap.className = "menu-screen";
  wrap.innerHTML = `
    <div class="menu-subtitulo">CÓMO JUGAR</div>
    <div style="max-width:560px;text-align:left;line-height:1.6;font-size:.9em">
      <p>Cuando una acción es incierta, el juego tira un <strong>d100</strong>: si el resultado
      queda igual o por debajo de tu <strong>Habilidad efectiva</strong>, tienes éxito. Cuanta más
      diferencia, más <strong>éxitos</strong> consigues.</p>
      <p><strong>00, 01, 02</strong> son siempre crítico. <strong>97, 98, 99</strong> son siempre pifia.
      Un crítico o una pifia también pueden hacer que la habilidad usada mejore permanentemente.</p>
      <p>Antes de tirar puedes gastar un <strong>Punto Épico</strong> para sumar +50 a tu Habilidad
      efectiva — resérvalos para el momento que de verdad importa.</p>
      <p>Cuando una acción lo permite, puedes <strong>delegarla</strong> en otro miembro del grupo
      presente en la escena: el juego te muestra su habilidad efectiva antes de elegir.</p>
      <p>Usa los verbos <strong>MIRAR, COGER, USAR, HABLAR, MOVERSE</strong> para interactuar con la
      escena. Cuando aparezcan perseguidores tendrás que elegir entre <strong>HUIR, LUCHAR o
      ESCONDERTE</strong>.</p>
    </div>
    <button class="btn-menu" id="btn-volver" style="width:320px;margin-top:16px">Volver</button>
  `;
  container.innerHTML = "";
  container.appendChild(wrap);
  wrap.querySelector("#btn-volver").addEventListener("click", () => montarMenu(replace(container)));
}

function montarCreditos(container) {
  const manifest = manifiestoActivo();
  const wrap = document.createElement("div");
  wrap.className = "menu-screen";
  wrap.innerHTML = `
    <div class="menu-subtitulo">CRÉDITOS / PROTOTIPO</div>
    <div style="max-width:560px;text-align:left;line-height:1.6;font-size:.9em">
      ${(manifest.credits || []).map(p => `<p>${p}</p>`).join("")}
      <p>Motor de escenas data-driven, común a todos los módulos — ver
      <code>docs/MODULE_ARCHITECTURE.md</code>, <code>docs/SCENE_SCHEMA.md</code> y
      <code>docs/PARTY_SYSTEM.md</code>.</p>
    </div>
    <button class="btn-menu" id="btn-volver" style="width:320px;margin-top:16px">Volver</button>
  `;
  container.innerHTML = "";
  container.appendChild(wrap);
  wrap.querySelector("#btn-volver").addEventListener("click", () => montarMenu(replace(container)));
}

function replace(container) {
  container.innerHTML = "";
  return container;
}
