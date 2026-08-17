// Motor de tiradas d100 — reglas generales de La Senda de los Errantes,
// comunes a cualquier módulo (verificadas por primera vez contra la PARTE 1
// de un Quick Starter concreto). Referencia y trazabilidad: docs/QS_RULE_MAP.md

export function rollD100() {
  return Math.floor(Math.random() * 100); // 0-99 (00 se representa como 0)
}

// habilidadBase: categoria + habilidad concreta ya sumadas (tal como vienen en characters.json)
// dificultad: uno de +20,+10,0,-10,-20
// puntoEpicoGastado: boolean, aplica +50 tras conocer la dificultad
export function resolverTirada({ habilidadBase, dificultad = 0, puntoEpicoGastado = false }) {
  const habilidadEfectiva = habilidadBase + dificultad + (puntoEpicoGastado ? 50 : 0);
  const tirada = rollD100();

  const esPifia = tirada === 97 || tirada === 98 || tirada === 99;
  const esCriticoPorNumero = tirada === 0 || tirada === 1 || tirada === 2;

  let exito = false;
  let exitos = 0;
  let esCritico = false;

  if (esPifia) {
    exito = false;
    if (tirada > habilidadEfectiva) {
      const diferencia = tirada - habilidadEfectiva;
      exitos = -Math.ceil(diferencia / 10);
    } else {
      exitos = tirada === 99 ? -3 : tirada === 98 ? -2 : -1;
    }
  } else if (tirada <= habilidadEfectiva) {
    exito = true;
    const diferencia = habilidadEfectiva - tirada;
    exitos = Math.floor(diferencia / 10) + 1;
    if (esCriticoPorNumero) {
      esCritico = true;
      exitos += tirada === 0 ? 3 : tirada === 1 ? 2 : 1;
    }
  } else {
    exito = false;
    const diferencia = tirada - habilidadEfectiva;
    exitos = -Math.ceil(diferencia / 10);
  }

  return {
    habilidadBase,
    dificultad,
    puntoEpicoGastado,
    habilidadEfectiva,
    tirada,
    tiradaTexto: String(tirada).padStart(2, "0"),
    exito,
    exitos,
    esCritico,
    esPifia,
    esCabezaAutomatica: tirada === 0 && esCritico
  };
}

export function localizacionPorUnidad(tirada) {
  const unidad = tirada % 10;
  const tabla = {
    0: "Cabeza", 9: "Ojos", 8: "Pecho", 7: "Oídos", 6: "Lengua/mandíbula",
    5: "Espalda", 4: "Brazo derecho", 3: "Brazo izquierdo", 2: "Pierna derecha", 1: "Pierna izquierda"
  };
  return tabla[unidad];
}

export function esZonaVital(localizacion) {
  return localizacion === "Cabeza" || localizacion === "Pecho" || localizacion === "Espalda" || localizacion === "Ojos" || localizacion === "Oídos" || localizacion === "Lengua/mandíbula";
}
