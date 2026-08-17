import { resolverTirada, localizacionPorUnidad } from "../rules/dice.js";
import { rutaDeManifiesto } from "../engine/moduleLoader.js";

// Cadencia de fuego (QS PARTE 1, líneas 162-170): dato puro en el archivo de
// armas del módulo activo (paths.weapons), no en código. Se cachea por
// módulo tras la primera carga.
const cadenciaCachePorModulo = new Map();
export async function cargarCadencia() {
  const ruta = rutaDeManifiesto("weapons");
  if (cadenciaCachePorModulo.has(ruta)) return cadenciaCachePorModulo.get(ruta);
  const res = await fetch(ruta);
  const data = await res.json();
  cadenciaCachePorModulo.set(ruta, data.cadencia);
  return data.cadencia;
}

// Orden de resolución de un ataque, fiel a QS PARTE 1 "Penetración y cobertura":
// 1) tirada de ataque 2) éxitos normales 3) (defensa activa: fuera de alcance de este helper)
// 4) penetración total 5) blindaje total/efectivo 6) resta blindaje 7) suma cadencia/crítico 8) daño final.
export function resolverAtaque({ habilidadBase, dificultad = 0, puntoEpicoGastado = false, penetracion = 0, blindajeObjetivo = 0, coberturaObjetivo = 0, cadenciaBonus = 0, danioBase = 1 }) {
  const tirada = resolverTirada({ habilidadBase, dificultad, puntoEpicoGastado });
  if (!tirada.exito) {
    return { ...tirada, impacto: false, danioFinal: 0, localizacion: null };
  }

  const blindajeTotal = blindajeObjetivo + coberturaObjetivo;
  const blindajeEfectivo = Math.max(0, blindajeTotal - penetracion);
  let exitosNetos = tirada.exitos - blindajeEfectivo;
  exitosNetos += cadenciaBonus; // se suma después del blindaje (regla de cadencia)

  const localizacion = localizacionPorUnidad(tirada.tirada);
  const impacto = exitosNetos > 0;
  const danioFinal = impacto ? danioBase * exitosNetos : 0;

  return { ...tirada, impacto, blindajeTotal, blindajeEfectivo, exitosNetos, localizacion, danioFinal };
}

// Iniciativa: d100 + valor de Iniciativa, luego posiciones restando 100 mientras sea positivo.
export function tirarIniciativa(valorIniciativa) {
  const d100 = Math.floor(Math.random() * 100) + 1; // 1-100 para evitar posiciones vacías por un 0 puro
  const total = d100 + valorIniciativa;
  const posiciones = [];
  let resto = total;
  while (resto > 0) {
    posiciones.push(resto);
    resto -= 100;
  }
  return { d100, valorIniciativa, total, posiciones };
}

// Construye el orden de actuación de todos los combatientes a partir de sus posiciones de iniciativa.
export function ordenDeActuacion(combatientes) {
  const eventos = [];
  combatientes.forEach(c => {
    const { posiciones } = tirarIniciativa(c.iniciativa);
    posiciones.forEach(pos => eventos.push({ id: c.id, posicion: pos }));
  });
  eventos.sort((a, b) => b.posicion - a.posicion);
  return eventos;
}

// `modo` es una clave de weapons.json (paths.weapons del módulo) → cadencia (tiroATiro/rafaga/fuegoSostenido).
export function modificadorCadencia(modo, cadenciaData) {
  const m = cadenciaData?.[modo];
  return m ? m.bonusExitos : 0;
}

export function modificadorMovimientoEvasivo(exitos) {
  if (exitos <= 0) return 0;
  if (exitos === 1) return -10;
  return -20;
}
