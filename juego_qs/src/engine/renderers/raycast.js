// Renderer genérico de exploración 2.5D. El mapa (muros, metas, puntos
// interactivos) sale de paths.maps del módulo activo — este archivo no
// conoce "callejon_entorno" por nombre, solo el campo `map` de la escena.
import { state, cambiarEscena } from "../../gameState.js";
import { Raycaster } from "../../renderer/raycaster.js";
import { cargarEscena, aplicarConsecuencias, ejecutarInteraccion } from "../sceneEngine.js";
import { rutaDeManifiesto, rutaAsset } from "../moduleLoader.js";
import { config } from "../../config.js";

const cacheMapas = new Map();
async function cargarMapa(id) {
  const clave = `${rutaDeManifiesto("maps")}${id}`;
  if (cacheMapas.has(clave)) return cacheMapas.get(clave);
  const res = await fetch(`${clave}.json`);
  const data = await res.json();
  cacheMapas.set(clave, data);
  return data;
}

let manifiestoSpritesCache = null;
async function cargarManifiestoSprites() {
  if (manifiestoSpritesCache) return manifiestoSpritesCache;
  try {
    const res = await fetch(rutaDeManifiesto("assets") + "sprites.json");
    manifiestoSpritesCache = await res.json();
  } catch (e) {
    manifiestoSpritesCache = { assets: {} };
  }
  return manifiestoSpritesCache;
}

const imagenesSpriteCache = new Map();
// Sprite billboard con fallback: si el asset no está disponible, devuelve
// null y el renderer simplemente no dibuja ese billboard (nunca rompe el
// juego por un PNG que falte — punto 25 del encargo).
async function cargarSprite(clave) {
  if (imagenesSpriteCache.has(clave)) return imagenesSpriteCache.get(clave);
  const manifiesto = await cargarManifiestoSprites();
  const spec = manifiesto.assets?.[clave];
  if (!spec) { imagenesSpriteCache.set(clave, null); return null; }
  const promesa = new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = rutaAsset(`assets/generated/${spec.outFile}`);
  });
  imagenesSpriteCache.set(clave, promesa);
  return promesa;
}

export async function montarPersecucion(container, escenaId) {
  const escena = await cargarEscena(escenaId);
  const mapa = await cargarMapa(escena.map);

  const wrap = document.createElement("div");
  wrap.className = "persecucion-wrap";
  wrap.innerHTML = `
    <canvas id="raycast-canvas"></canvas>
    ${config.visualEffects.vignette ? '<div class="raycast-vignette"></div>' : ""}
    ${config.visualEffects.rain ? '<div class="raycast-rain"></div>' : ""}
    <div class="interaction-prompt" id="prompt" hidden></div>
    <div class="persecucion-hud">
      <div class="hud-datos">
        <div><span class="hud-etiqueta">PERSEGUIDOR</span><strong id="hud-dist">—</strong></div>
        <div><span class="hud-etiqueta">OBJETIVO</span><strong id="hud-objetivo">Refugio o vehículo</strong></div>
        <div><span class="hud-etiqueta">ESTADO</span><strong id="hud-estado">En movimiento</strong></div>
      </div>
      <div class="hud-mensaje" id="hud-msg">${escena.hudText || ""}</div>
      <div class="hud-controles">WASD MOVER · MAYÚS CORRER · E INTERACTUAR</div>
    </div>
  `;
  container.appendChild(wrap);

  const canvas = wrap.querySelector("#raycast-canvas");
  const promptEl = wrap.querySelector("#prompt");
  const raycaster = new Raycaster(canvas, mapa.grid, {
    wallTypes: mapa.wallTypes,
    rutaManifiestoTexturas: rutaDeManifiesto("assets") + "textures.json",
    resolverAsset: rutaAsset
  });

  // `mapa.start.angle` es el nombre del campo en los datos (inglés, como el
  // resto del esquema JSON); el motor usa `angulo` internamente en español —
  // se traduce aquí, en el único punto de entrada, para no tener que acordarse
  // en cada sitio que lo lee.
  const jugador = { x: mapa.start.x, y: mapa.start.y, angulo: mapa.start.angle ?? 0 };
  const perseguidor = { ...mapa.pursuer, pausaTicks: 0, boostTicks: 0 };
  const puntosUsados = new Set();
  const teclas = {};
  let activo = true;
  let bobFase = 0;

  // Precarga de sprites billboard: perseguidor + cualquier punto interactivo
  // que declare un asset visual (contenedor, verja...). Los que no cargan
  // (o no tienen "sprite" en el JSON) simplemente no se dibujan.
  const spritePerseguidor = { image: null };
  cargarSprite("executor_front").then(img => { spritePerseguidor.image = img; });
  const spritesPuntos = new Map();
  (mapa.interactionPoints || []).forEach(p => {
    if (!p.sprite) return;
    cargarSprite(p.sprite).then(img => { if (img) spritesPuntos.set(p.id, img); });
  });

  function onKeyDown(e) {
    teclas[e.key.toLowerCase()] = true;
    if (e.key.toLowerCase() === "e") intentarInteractuar();
  }
  function onKeyUp(e) { teclas[e.key.toLowerCase()] = false; }
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  function esMuro(x, y) {
    const celda = mapa.grid[Math.floor(y)]?.[Math.floor(x)];
    return celda === undefined || (celda !== 0 && !mapa.goals[celda]);
  }

  function puntoCercano() {
    return (mapa.interactionPoints || [])
      .filter(p => !puntosUsados.has(p.id))
      .find(p => Math.hypot(jugador.x - p.x, jugador.y - p.y) < p.radius);
  }

  // Cada punto interactivo del mapa tiene la misma forma que una interacción
  // de escena (executors/roll/onSuccess/onFailure) — se delega en el motor
  // genérico (src/engine/sceneEngine.js → ejecutarInteraccion) en vez de
  // duplicar aquí la lógica de delegación y Ayudar (SOURCE_OVERRIDE:
  // MANUAL_CANON) ya escrita y probada para el callejón. `escenaConParty`
  // conserva el fallback a `mapa.availableParty` que ya tenía este renderer.
  const escenaConParty = { ...escena, availableParty: escena.availableParty || mapa.availableParty };

  function intentarInteractuar() {
    if (!activo) return;
    const punto = puntoCercano();
    if (!punto) return;
    activo = false; // pausa el movimiento mientras se resuelve
    puntosUsados.add(punto.id);

    ejecutarInteraccion({
      escenaId,
      escena: escenaConParty,
      interaccion: punto,
      onTexto: (t) => { wrap.querySelector("#hud-msg").textContent = t; },
      onCustom: (c) => {
        if (c.pursuerPauseTicks) perseguidor.pausaTicks += c.pursuerPauseTicks;
        if (c.pursuerBoostTicks) perseguidor.boostTicks += c.pursuerBoostTicks;
        activo = true;
        requestAnimationFrame(tick);
      }
    });
  }

  function tick() {
    if (!activo) return;

    const corriendo = !!teclas["shift"];
    const vel = (mapa.player?.speed ?? 0.045) * (corriendo ? 1.6 : 1);
    const giro = mapa.player?.turnSpeed ?? 0.035;
    // "E" queda reservada para interactuar — girar usa flechas o Q (izquierda).
    if (teclas["arrowleft"] || teclas["q"]) jugador.angulo -= giro;
    if (teclas["arrowright"]) jugador.angulo += giro;

    let mx = 0, my = 0;
    if (teclas["w"] || teclas["arrowup"]) { mx += Math.cos(jugador.angulo); my += Math.sin(jugador.angulo); }
    if (teclas["s"] || teclas["arrowdown"]) { mx -= Math.cos(jugador.angulo); my -= Math.sin(jugador.angulo); }
    if (teclas["a"]) { mx += Math.cos(jugador.angulo - Math.PI / 2); my += Math.sin(jugador.angulo - Math.PI / 2); }
    if (teclas["d"]) { mx += Math.cos(jugador.angulo + Math.PI / 2); my += Math.sin(jugador.angulo + Math.PI / 2); }

    const moviendo = mx !== 0 || my !== 0;
    const nx = jugador.x + mx * vel;
    const ny = jugador.y + my * vel;
    if (!esMuro(nx, jugador.y)) jugador.x = nx;
    if (!esMuro(jugador.x, ny)) jugador.y = ny;

    if (config.visualEffects.headBob && moviendo) {
      bobFase += 0.25;
      canvas.style.transform = `translateY(${Math.sin(bobFase) * 3}px)`;
    } else if (config.visualEffects.headBob) {
      canvas.style.transform = "translateY(0)";
    }

    // Perseguidor: greedy hacia el jugador, con pausas/impulsos de los puntos interactivos.
    let pasoP = mapa.pursuer?.speed ?? 0.028;
    if (perseguidor.pausaTicks > 0) { perseguidor.pausaTicks--; pasoP = 0; }
    else if (perseguidor.boostTicks > 0) { perseguidor.boostTicks--; pasoP *= 2; }

    const dx = jugador.x - perseguidor.x;
    const dy = jugador.y - perseguidor.y;
    const distTotal = Math.hypot(dx, dy);
    if (pasoP > 0) {
      if (Math.abs(dx) > Math.abs(dy)) {
        const npx = perseguidor.x + Math.sign(dx) * pasoP;
        if (!esMuro(npx, perseguidor.y)) perseguidor.x = npx;
        else { const npy = perseguidor.y + Math.sign(dy) * pasoP; if (!esMuro(perseguidor.x, npy)) perseguidor.y = npy; }
      } else {
        const npy = perseguidor.y + Math.sign(dy) * pasoP;
        if (!esMuro(perseguidor.x, npy)) perseguidor.y = npy;
        else { const npx = perseguidor.x + Math.sign(dx) * pasoP; if (!esMuro(npx, perseguidor.y)) perseguidor.x = npx; }
      }
    }

    wrap.querySelector("#hud-dist").textContent = `${distTotal.toFixed(1)} m`;
    wrap.querySelector("#hud-estado").textContent = perseguidor.pausaTicks > 0
      ? "PERSEGUIDOR DESPISTADO"
      : (corriendo ? "CORRIENDO" : "EN MOVIMIENTO");
    state.estadoPersecucion = { distanciaActual: distTotal, objetivo: "Refugio o vehículo" };

    if (distTotal < (mapa.pursuer?.catchDistance ?? 0.7)) {
      activo = false;
      if (config.visualEffects.screenShake) wrap.classList.add("screen-shake");
      limpiar();
      aplicarConsecuencias(escena.onCatch, "player", { onTexto: () => {} });
      return;
    }

    const celdaJugador = mapa.grid[Math.floor(jugador.y)][Math.floor(jugador.x)];
    const meta = mapa.goals[celdaJugador];
    if (meta) {
      activo = false;
      limpiar();
      resolverMeta(meta);
      return;
    }

    const punto = puntoCercano();
    promptEl.hidden = !punto;
    if (punto) promptEl.textContent = `Pulsa E para ${punto.label}`;

    raycaster.render(jugador.x, jugador.y, jugador.angulo);

    const billboards = [{ x: perseguidor.x, y: perseguidor.y, image: spritePerseguidor.image, escala: 1.1 }];
    (mapa.interactionPoints || []).forEach(p => {
      if (puntosUsados.has(p.id)) return; // ya resuelto: el objeto "se consumió" narrativamente
      const img = spritesPuntos.get(p.id);
      if (img) billboards.push({ x: p.x, y: p.y, image: img, escala: 0.9 });
    });
    raycaster.renderSprites(jugador.x, jugador.y, jugador.angulo, billboards);

    dibujarMinimapa(wrap, mapa, jugador, perseguidor);
    requestAnimationFrame(tick);
  }

  function limpiar() {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  }

  function resolverMeta(meta) {
    if (!meta.requiresRoll) {
      state.finalTipo = meta.final;
      cambiarEscena("finales");
      return;
    }
    // Igual que los puntos interactivos: se delega en el motor genérico para
    // que la meta admita delegación (p.ej. Bishop puenteando el vehículo,
    // como ya describía docs/DESIGN.md antes de que el código lo permitiera)
    // y Ayudar cuando el propio dato de la meta lo declare.
    ejecutarInteraccion({
      escenaId,
      escena: escenaConParty,
      interaccion: {
        executors: meta.requiresRoll.executors ?? "party",
        delegationTitle: meta.requiresRoll.label,
        roll: meta.requiresRoll,
        onSuccess: { setFinalTipo: meta.onSuccessFinal, transition: "finales" },
        onFailure: { transition: meta.onFailureTransition }
      },
      onTexto: (t) => { wrap.querySelector("#hud-msg").textContent = t; }
    });
  }

  // Primer frame síncrono: si la pestaña está en segundo plano al montar,
  // requestAnimationFrame no se dispara hasta que vuelve a primer plano — sin
  // esto la escena se queda en negro/sin textura hasta el primer movimiento.
  tick();
}

function dibujarMinimapa(wrap, mapa, jugador, perseguidor) {
  let mm = wrap.querySelector("#minimapa");
  if (!mm) {
    mm = document.createElement("canvas");
    mm.id = "minimapa";
    mm.width = 100; mm.height = 100;
    mm.style.cssText = "position:absolute;right:10px;top:10px;background:rgba(0,0,0,.6);border:1px solid #333;";
    wrap.appendChild(mm);
  }
  const ctx = mm.getContext("2d");
  ctx.clearRect(0, 0, 100, 100);
  for (let y = 0; y < mapa.grid.length; y++) {
    for (let x = 0; x < mapa.grid[y].length; x++) {
      const c = mapa.grid[y][x];
      if (c === 0) continue;
      ctx.fillStyle = mapa.goals[c] ? (c == 3 ? "#3ba0c9" : "#d4af37") : "#555";
      ctx.fillRect(x * 10, y * 10, 10, 10);
    }
  }
  (mapa.interactionPoints || []).forEach(p => {
    ctx.fillStyle = "#8b93a1";
    ctx.fillRect(p.x * 10 - 1, p.y * 10 - 1, 3, 3);
  });
  ctx.fillStyle = "#3f9e5e";
  ctx.fillRect(jugador.x * 10 - 2, jugador.y * 10 - 2, 4, 4);
  ctx.fillStyle = "#b3323c";
  ctx.fillRect(perseguidor.x * 10 - 2, perseguidor.y * 10 - 2, 4, 4);
}
