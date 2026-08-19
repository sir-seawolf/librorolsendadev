// Preferencias de interfaz que no son de audio (Iteración 0.3, punto 8 del
// encargo): por ahora solo si la ficha lateral está plegada o expandida.
// Clave propia, separada de la configuración de audio a propósito — son dos
// sistemas de preferencia con ciclos de vida distintos (audio ya tenía su
// propio módulo, `src/ui/audioSettings.js`; mezclar aquí habría acoplado dos
// cosas sin relación solo por compartir el mismo prefijo de localStorage).
const CLAVE = "la_senda_ui_settings_v1";

function leer() {
  try {
    const raw = localStorage.getItem(CLAVE);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function escribir(datos) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(datos));
  } catch (e) {
    // localStorage puede no estar disponible (file://) — no bloquear el prototipo por esto.
  }
}

export function fichaColapsada() {
  return !!leer().fichaColapsada;
}

export function establecerFichaColapsada(valor) {
  const datos = leer();
  datos.fichaColapsada = !!valor;
  escribir(datos);
}
