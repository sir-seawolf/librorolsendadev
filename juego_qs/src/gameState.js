import { moduloIdActivo, manifiestoActivo, MODULE_ID_MIGRACION_GUARDADO_ANTIGUO } from "./engine/moduleLoader.js";

// Estado central del motor. Un único objeto mutable + suscriptores simples.
//
// Refactor de arquitectura (iteración 2): el estado ya no asume un único
// "personaje" — mantiene un grupo (`partyMembers`) de copias runtime mutables
// sobre los datos base de `characters.json`. Los datos base (atributos, retrato,
// nombre, rol, arma, armadura) NUNCA se duplican ni se mutan: solo se referencian
// desde `base`. Lo único que vive como copia mutable por miembro es lo que puede
// cambiar durante la partida: habilidades (progresión), vida, inventario, Puntos
// Épicos y disponibilidad.
// Prefijo específico y no genérico a propósito: el sitio publicado
// (sir-seawolf.github.io) sirve varios proyectos bajo el mismo origen, y
// localStorage se comparte por origen, no por subcarpeta — una clave como
// "save_v2" podría chocar con cualquier otra página del sitio que también
// use localStorage. Ver docs/PUBLISHING.md.
//
// Iteración 5: el motor ahora carga módulos de contenido — el guardado debe
// distinguir cuál (dos módulos jugados en el mismo navegador no deben
// pisarse el guardado entre sí). Una clave POR MÓDULO, no un contenedor
// único con todos dentro: así escribir el guardado de un módulo nunca
// obliga a releer/reescribir el de los demás. Ver docs/SAVE_MIGRATION.md
// para la clave antigua (anterior a los módulos) y cómo se migra.
const STORAGE_KEY_ANTIGUA = "la_senda_errantes_juego_qs_save_v1";
function claveGuardado(moduleId) {
  return `la_senda_module_${moduleId}_save_v1`;
}

// Dos canales de notificación separados a propósito:
//   - `listenersEscena`: SOLO navegación (cambiarEscena/iniciarPartida). Provoca
//     un remount completo de #scenario. Debe ser rara.
//   - `listenersFicha`: cualquier otra mutación (inventario, flags, vida, PE,
//     progreso). Solo refresca la ficha lateral, NUNCA #scenario — de lo
//     contrario un combate o una persecución en curso (con su propio bucle de
//     requestAnimationFrame y estado local en closures) se desmontaría a mitad
//     de ejecución cada vez que algo tan trivial como coger un objeto disparase
//     un cambio de estado.
const listenersEscena = new Set();
const listenersFicha = new Set();

export const state = {
  moduloId: null,           // id del módulo activo — ver src/engine/moduleLoader.js
  moduloVersion: null,
  playerCharacterId: null,
  partyMembers: {},        // id -> runtime (ver crearRuntimeDesdeBase)
  posicion: "callejon",
  escena: "module_select",
  flags: {},                // banderas genéricas que leen/escriben las escenas JSON
  enemigosActivos: [],
  objetosDescubiertos: [],
  pistasDescubiertas: [],
  decisiones: [],
  historialTiradas: [],     // log de tiradas — ver registrarTirada()
  mapaDescubierto: {},      // fog-of-war del minimapa: { "x,y": true }
  estadoPersecucion: null,
  estadoCombate: null,
  finalTipo: null
};

function crearRuntimeDesdeBase(base) {
  return {
    baseId: base.id,
    base,                                       // referencia de solo lectura a characters.json
    habilidades: { ...base.habilidades },        // copia mutable: aquí escribe la progresión
    vidaActual: { ...base.niveles },
    puntosEpicosActuales: base.puntosEpicos,
    inventario: [...base.equipo],
    estadoDisponibilidad: "disponible"           // disponible | separado | herido | inconsciente | ocupado | ausente
  };
}

// Arranca una partida nueva: crea runtime para TODOS los pregenerados (barato, son
// 5 objetos de datos) y marca cuál pilota el jugador. Qué otros miembros están
// presentes en cada escena lo decide el JSON de la escena (`availableParty`), no
// este arranque — "no asumir que los cinco están siempre juntos".
export function iniciarPartida(pregenerados, playerBaseId) {
  const manifest = manifiestoActivo();
  state.moduloId = moduloIdActivo();
  state.moduloVersion = manifest?.version ?? null;
  state.partyMembers = {};
  pregenerados.forEach(base => {
    state.partyMembers[base.id] = crearRuntimeDesdeBase(base);
  });
  state.playerCharacterId = playerBaseId;
  state.flags = {};
  state.objetosDescubiertos = [];
  state.pistasDescubiertas = [];
  state.decisiones = [];
  state.historialTiradas = [];
  state.mapaDescubierto = {};
  state.finalTipo = null;
  notificarEscena();
}

export function obtenerJugador() {
  return state.partyMembers[state.playerCharacterId] || null;
}

export function obtenerMiembro(id) {
  if (id === "player") return obtenerJugador();
  return state.partyMembers[id] || null;
}

// Estados que impiden delegar una acción en ese miembro. "herido" queda FUERA
// a propósito: en el QS, Herido es un penalizador de −10 a las habilidades
// (CAP03 / QUICKSTART línea 230), no una incapacitación — un compañero herido
// sigue pudiendo actuar, solo que peor. Los estados narrativos de verdad
// ausente son los que bloquean la delegación.
const ESTADOS_NO_DELEGABLES = new Set(["inconsciente", "ausente", "separado", "ocupado"]);

// Miembros presentes en la escena actual (según su lista `availableParty`,
// deduplicada — "player" se resuelve al elegido) y mecánicamente disponibles
// para ejecutar o recibir una acción delegada.
export function miembrosDisponibles(idsListaEscena = []) {
  const idsResueltos = [...new Set(idsListaEscena.map(id => (id === "player" ? state.playerCharacterId : id)))];
  return idsResueltos
    .map(id => state.partyMembers[id])
    .filter(m => m && !ESTADOS_NO_DELEGABLES.has(m.estadoDisponibilidad));
}

export function establecerDisponibilidad(miembroId, estado) {
  const m = obtenerMiembro(miembroId);
  if (!m) return;
  m.estadoDisponibilidad = estado;
  notificarFicha();
  guardar();
}

export function esJugador(id) {
  return id === "player" || id === state.playerCharacterId;
}

export function nombreVisible(miembroRuntime) {
  return miembroRuntime.base.nombre;
}

export function registrarDecision(texto) {
  state.decisiones.push(texto);
  guardar();
}

export function descubrirObjeto(nombre) {
  if (!state.objetosDescubiertos.includes(nombre)) state.objetosDescubiertos.push(nombre);
  guardar();
}

export function descubrirPista(texto) {
  if (!state.pistasDescubiertas.includes(texto)) state.pistasDescubiertas.push(texto);
  guardar();
}

export function establecerFlag(nombre, valor = true) {
  state.flags[nombre] = valor;
}

export function tieneFlag(nombre) {
  return !!state.flags[nombre];
}

export function gastarPuntoEpico(miembroId = "player") {
  const m = obtenerMiembro(miembroId);
  if (!m || m.puntosEpicosActuales <= 0) return false;
  m.puntosEpicosActuales -= 1;
  notificarFicha();
  guardar();
  return true;
}

// Registra una tirada en el historial. `entrada` ya trae los campos calculados
// por rules/dice.js más contexto (escena, actor, habilidad, progreso).
export function registrarTirada(entrada) {
  state.historialTiradas.push({ orden: state.historialTiradas.length + 1, ...entrada });
  guardar();
}

export function aplicarDanio(miembroId, localizacion, danioFinal) {
  const m = obtenerMiembro(miembroId);
  if (!m) return false;
  let restante = danioFinal;
  for (const nivel of ["sano", "herido", "tullido"]) {
    if (restante <= 0) break;
    const disponible = m.vidaActual[nivel];
    const consumido = Math.min(disponible, restante);
    m.vidaActual[nivel] -= consumido;
    restante -= consumido;
  }
  if (nivelHeridaDe(m) !== "sano") m.estadoDisponibilidad = m.estadoDisponibilidad === "disponible" ? "herido" : m.estadoDisponibilidad;
  notificarFicha();
  guardar();
  return restante > 0; // true = ha muerto (desbordó Tullido)
}

export function nivelHeridaDe(miembroRuntime) {
  const v = miembroRuntime.vidaActual;
  const base = miembroRuntime.base.niveles;
  if (v.sano === 0 && v.herido === 0 && v.tullido < base.tullido) return "tullido";
  if (v.sano === 0) return "herido";
  return "sano";
}

// Compatibilidad: la mayoría de pantallas solo necesitan el nivel del jugador.
export function nivelHeridaActual() {
  const j = obtenerJugador();
  return j ? nivelHeridaDe(j) : "sano";
}

export function cambiarEscena(nombre) {
  state.escena = nombre;
  notificarEscena();
  guardar();
}

// Fuerza un refresco de SOLO la ficha lateral + guardado tras mutar el estado
// directamente (p.ej. empujar al inventario o marcar un flag). Nunca remonta
// la escena en curso — ver comentario junto a los sets de listeners arriba.
export function actualizar() {
  notificarFicha();
  guardar();
}

export function suscribirEscena(fn) {
  listenersEscena.add(fn);
  return () => listenersEscena.delete(fn);
}

export function suscribirFicha(fn) {
  listenersFicha.add(fn);
  return () => listenersFicha.delete(fn);
}

function notificarEscena() {
  for (const fn of listenersEscena) fn(state);
}

function notificarFicha() {
  for (const fn of listenersFicha) fn(state);
}

export function guardar() {
  // Sin módulo activo (pantalla de selección de módulos) no hay nada propio
  // de una partida que guardar todavía.
  if (!state.moduloId) return;
  try {
    localStorage.setItem(claveGuardado(state.moduloId), JSON.stringify(state));
  } catch (e) {
    // localStorage puede no estar disponible (file://) — no bloquear el prototipo por esto.
  }
}

// Ambas funciones operan sobre el módulo actualmente CARGADO (moduloIdActivo(),
// fijado por moduleLoader.cargarModulo() al entrar desde el selector de
// módulos) — así "Continuar partida" en el menú de un módulo solo ve el
// guardado de ESE módulo, nunca el de otro.
export function hayPartidaGuardada() {
  const moduleId = moduloIdActivo();
  if (!moduleId) return false;
  try {
    return !!localStorage.getItem(claveGuardado(moduleId));
  } catch (e) {
    return false;
  }
}

export function cargar() {
  const moduleId = moduloIdActivo();
  if (!moduleId) return false;
  try {
    const raw = localStorage.getItem(claveGuardado(moduleId));
    if (!raw) return false;
    const datos = JSON.parse(raw);
    Object.assign(state, datos);
    notificarEscena();
    return true;
  } catch (e) {
    return false;
  }
}

export function borrarGuardado() {
  const moduleId = moduloIdActivo();
  if (!moduleId) return;
  try { localStorage.removeItem(claveGuardado(moduleId)); } catch (e) {}
}

// Migración del guardado de la iteración 4 (anterior al concepto de módulo,
// ver docs/SAVE_MIGRATION.md). Se ejecuta una sola vez al arrancar la app,
// antes de mostrar cualquier pantalla — si existe la clave antigua y NO
// existe ya la nueva del módulo de migración, copia los datos añadiendo
// moduloId/moduloVersion y BORRA la clave antigua (política documentada:
// no se conserva, para no reintentar la migración en cada arranque ni dejar
// datos duplicados obsoletos). Si la clave nueva ya existe, no hace nada
// (no pisa una partida ya migrada o empezada de cero en el módulo).
export function migrarGuardadoAntiguoSiExiste() {
  try {
    const antiguo = localStorage.getItem(STORAGE_KEY_ANTIGUA);
    if (!antiguo) return false;
    const claveNueva = claveGuardado(MODULE_ID_MIGRACION_GUARDADO_ANTIGUO);
    if (localStorage.getItem(claveNueva)) {
      localStorage.removeItem(STORAGE_KEY_ANTIGUA);
      return false;
    }
    const datos = JSON.parse(antiguo);
    datos.moduloId = MODULE_ID_MIGRACION_GUARDADO_ANTIGUO;
    datos.moduloVersion = datos.moduloVersion ?? "migrado";
    localStorage.setItem(claveNueva, JSON.stringify(datos));
    localStorage.removeItem(STORAGE_KEY_ANTIGUA);
    return true;
  } catch (e) {
    return false;
  }
}
