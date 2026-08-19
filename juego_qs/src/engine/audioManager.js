// Gestor de audio común del motor (Iteración Audio). Motor-genérico a
// propósito: no conoce "Predator" ni "Jaula" ni ningún nombre de archivo —
// solo conceptos: track, musicState, volume, muted, fade, moduleMusicMap.
// Los nombres de fichero viven en datos (src/data/audio/audioConfig.json
// para lo global, module.json → "music" para lo de cada módulo).
// Ver docs/AUDIO_SYSTEM.md para la arquitectura completa.
//
// Dos canales (A/B) para crossfade real — nunca una sola instancia de
// audio intentando hacer fade contra sí misma. En cada transición se carga
// la pista siguiente en el canal INACTIVO y se cruzan los volúmenes; el
// canal que pierde queda en pausa (no se destruye ni se resetea su
// posición) por si el mismo estado vuelve a pedirse más tarde en la misma
// sesión (punto 11 del encargo: reanudar sin reiniciar, aprovechando que
// ya son solo 2 canales por diseño).

const CLAVE_PREFERENCIAS = "la_senda_audio_settings_v1";

function resolverFadeMs(config, from, to) {
  const regla = (config.fadeRules || []).find(r =>
    (r.from === from || r.from === "*") && r.to === to
  );
  return regla ? regla.fadeMs : config.defaultFadeMs;
}

function cargarPreferencias(storage) {
  try {
    const raw = storage?.getItem(CLAVE_PREFERENCIAS);
    if (!raw) return null;
    const datos = JSON.parse(raw);
    if (typeof datos.musicEnabled !== "boolean" || typeof datos.musicVolume !== "number") return null;
    return datos;
  } catch (e) {
    return null;
  }
}

function guardarPreferencias(storage, prefs) {
  try {
    storage?.setItem(CLAVE_PREFERENCIAS, JSON.stringify(prefs));
  } catch (e) {
    // localStorage no disponible (file://, cuota llena...) — nunca bloquear el audio por esto.
  }
}

// crearCanal() por defecto construye un <audio> real; los tests inyectan un
// doble que registra llamadas (play/pause/volume/src) sin reproducir nada
// de verdad — ver tests/audioManager.test.mjs.
function canalPorDefecto() {
  const audio = new Audio();
  audio.preload = "none";
  return audio;
}

export function crearGestorAudio({
  crearCanal = canalPorDefecto,
  storage = (typeof localStorage !== "undefined" ? localStorage : null),
  config = null,
  debug = false,
  log = (...args) => { if (debug) console.log("[audio]", ...args); }
} = {}) {
  const canales = [crearCanal(), crearCanal()];
  const canalTrackUrl = [null, null]; // qué URL lógica tiene cargada cada canal (no el .src normalizado del navegador)
  let activo = -1; // índice del canal que suena ahora, -1 = silencio
  let estadoActual = null;
  let moduloIdActual = null;
  let mapasPorModulo = {}; // moduloId -> { estado: archivo }
  let cfg = config; // se rellena con inicializar() si no se pasa ya cargado
  let desbloqueado = false;
  let pendiente = null; // { moduloId, estado, opts } último pedido mientras estaba bloqueado
  let fadeTimer = null; // id de setInterval del fade en curso (nunca más de uno)

  const prefsGuardadas = cargarPreferencias(storage);
  let muted = prefsGuardadas ? !prefsGuardadas.musicEnabled : false;
  let volumen = prefsGuardadas ? prefsGuardadas.musicVolume : 0.65; // se ajusta a defaultVolume tras inicializar() si no había preferencia

  function volumenEfectivo() {
    return muted ? 0 : volumen;
  }

  async function inicializar(rutaConfig = "src/data/audio/audioConfig.json") {
    if (!cfg) {
      try {
        const res = await fetch(rutaConfig);
        cfg = await res.json();
      } catch (e) {
        cfg = { basePath: "assets/shared/audio/music/", defaultVolume: 0.65, defaultFadeMs: 2500, global: {}, fadeRules: [] };
      }
    }
    if (!prefsGuardadas) volumen = cfg.defaultVolume ?? 0.65;
    canales.forEach(c => { c.volume = 0; c.onerror = () => log("error al cargar", c.src); });
  }

  function registrarMapaModulo(moduloId, mapaMusica) {
    mapasPorModulo[moduloId] = mapaMusica || {};
  }

  function resolverArchivo(moduloId, estado) {
    if (!cfg) return null;
    if (estado === "gateway" || estado === "menu") return cfg.global?.[estado] || null;
    return mapasPorModulo[moduloId]?.[estado] || null;
  }

  function resolverUrl(moduloId, estado) {
    const archivo = resolverArchivo(moduloId, estado);
    if (!archivo) return null;
    return cfg.basePath + archivo;
  }

  function cancelarFadeEnCurso() {
    if (fadeTimer !== null) {
      clearInterval(fadeTimer);
      fadeTimer = null;
    }
  }

  // Silencia y pausa TODOS los canales de golpe (fallback / estado "silence").
  function irASilencioInmediato() {
    cancelarFadeEnCurso();
    canales.forEach(c => { c.volume = 0; try { c.pause(); } catch (e) {} });
    activo = -1;
  }

  function iniciarCrossfade(moduloId, estado, url, fadeMs) {
    cancelarFadeEnCurso();
    const destino = activo === 0 ? 1 : 0; // si activo===-1, destino=1 (arbitrario, consistente)
    const origen = activo;
    const canalDestino = canales[destino];
    const canalOrigen = origen >= 0 ? canales[origen] : null;

    if (canalTrackUrl[destino] !== url) {
      canalDestino.src = url;
      canalDestino.currentTime = 0;
      canalTrackUrl[destino] = url;
    } // si ya estaba cargada (misma pista sonó antes en este canal), se reanuda desde donde iba

    canalDestino.volume = 0;
    canalDestino.loop = true;
    const intentoPlay = canalDestino.play?.();
    if (intentoPlay?.catch) intentoPlay.catch(() => log("play() bloqueado/rechazado para", url));

    const vFinal = volumenEfectivo();
    const pasos = Math.max(1, Math.round(fadeMs / 100));
    let paso = 0;
    fadeTimer = setInterval(() => {
      paso++;
      const t = Math.min(1, paso / pasos);
      canalDestino.volume = vFinal * t;
      if (canalOrigen) canalOrigen.volume = vFinal * (1 - t);
      if (t >= 1) {
        cancelarFadeEnCurso();
        if (canalOrigen) { try { canalOrigen.pause(); } catch (e) {} } // se queda cargado, NO se resetea posición (reanudable)
        activo = destino;
      }
    }, 100);

    estadoActual = estado;
    moduloIdActual = moduloId;
  }

  // Salto directo al estado final de un fade en curso — solo para tests
  // deterministas (no se depende de temporizadores reales para verificar
  // el resultado de una transición).
  function _forzarFinDeFade() {
    if (fadeTimer === null) return;
    clearInterval(fadeTimer);
    fadeTimer = null;
    // Mismo cálculo de "canal destino" que iniciarCrossfade() usó para
    // arrancar este fade (activo todavía no se actualiza hasta que el fade
    // termina, así que sigue apuntando al canal que estaba sonando ANTES).
    const destino = activo === 0 ? 1 : 0;
    const vFinal = volumenEfectivo();
    canales.forEach((c, i) => {
      if (i === destino) { c.volume = vFinal; }
      else { c.volume = 0; try { c.pause(); } catch (e) {} }
    });
    activo = destino;
  }

  function reproducirEstado(moduloId, estado, opts = {}) {
    if (!desbloqueado) { pendiente = { moduloId, estado, opts }; return; }
    if (!cfg) return; // inicializar() no ha terminado todavía — se ignora, nunca rompe

    // Punto 10: mismo estado + mismo módulo + ya sonando -> no reiniciar nada.
    if (estado === estadoActual && moduloId === moduloIdActual && activo >= 0) return;

    const url = resolverUrl(moduloId, estado);
    if (!url) { irASilencioInmediato(); estadoActual = estado; moduloIdActual = moduloId; return; }

    const fadeMs = opts.fadeMs ?? resolverFadeMs(cfg, estadoActual, estado);
    iniciarCrossfade(moduloId, estado, url, fadeMs);
  }

  function desbloquear() {
    if (desbloqueado) return;
    desbloqueado = true;
    if (pendiente) {
      const { moduloId, estado, opts } = pendiente;
      pendiente = null;
      reproducirEstado(moduloId, estado, opts);
    }
  }

  function establecerMute(valor) {
    muted = !!valor;
    if (activo >= 0) canales[activo].volume = volumenEfectivo();
    guardarPreferencias(storage, { musicEnabled: !muted, musicVolume: volumen });
  }

  function establecerVolumen(v) {
    volumen = Math.max(0, Math.min(1, v));
    if (activo >= 0) canales[activo].volume = volumenEfectivo();
    guardarPreferencias(storage, { musicEnabled: !muted, musicVolume: volumen });
  }

  function obtenerPreferencias() {
    return { musicEnabled: !muted, musicVolume: volumen };
  }

  // Visibilidad de pestaña (punto 38): pausa sin resetear posición al
  // ocultarse, reanuda al volver — nunca desde el principio.
  function alCambiarVisibilidad(oculto) {
    if (activo < 0) return;
    if (oculto) { try { canales[activo].pause(); } catch (e) {} }
    else { const p = canales[activo].play?.(); if (p?.catch) p.catch(() => {}); }
  }

  function _estado() { // solo para tests/depuración
    return { activo, estadoActual, moduloIdActual, desbloqueado, muted, volumen, canalTrackUrl: [...canalTrackUrl] };
  }

  return {
    inicializar,
    registrarMapaModulo,
    reproducirEstado,
    desbloquear,
    establecerMute,
    establecerVolumen,
    obtenerPreferencias,
    alCambiarVisibilidad,
    irASilencioInmediato,
    _forzarFinDeFade,
    _estado,
    _canales: canales // solo para tests — nunca usar desde código de producción
  };
}

// Instancia única para la app real (browser). Los tests crean sus propias
// instancias aisladas con crearGestorAudio({...dobles...}).
export const audioManager = (typeof window !== "undefined") ? crearGestorAudio() : null;

export { resolverFadeMs }; // exportado aparte para poder testear la resolución de reglas sin montar un gestor completo
