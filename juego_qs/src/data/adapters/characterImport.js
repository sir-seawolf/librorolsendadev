// Adaptador de importación de personajes — NO acoplado al formato interno del
// motor ni al formato exacto de ninguna ficha externa concreta.
//
// Contexto (ver docs/CHARACTER_IMPORT_SPEC.md para el detalle completo):
// la ficha autocalculada del proyecto
// (SENDA_ERRANTES/06_MODULOS/KIT_DE_INICIO/FICHAS/FICHA_Personaje_Autocalculada_v4_json_preguntas.js)
// ya puede exportar JSON (función `guardarJSON`/`collectData`), pero ese export
// tiene forma de FORMULARIO — `{ version, state, form, exportedAt }`, donde
// `form` son pares `idDeCampoDelDOM -> valor` (p.ej. inputs de Méritos/Defectos,
// checkboxes de runas...), no una ficha semántica de atributos/habilidades.
// Traducir ese formulario 1:1 exige conocer cada id de campo del HTML — trabajo
// deliberadamente fuera de esta iteración (ver instrucción 8 del encargo).
//
// Por eso `normalizeCharacter` aquí NO parsea `form` directamente. Asume una
// forma "semántica" intermedia (`ExternalCharacterJSON`, documentada abajo y en
// el spec) que sí es razonable pedirle a un exportador futuro, y siempre
// devuelve el mismo formato interno que ya usa src/data/characters.json — así
// characters.json y cualquier personaje importado son intercambiables para el
// resto del motor sin que este tenga que saber de dónde vino cada uno.

/**
 * Forma esperada de entrada (ExternalCharacterJSON) — ver CHARACTER_IMPORT_SPEC.md:
 * {
 *   id, nombre, rol, retrato, cita,
 *   atributos: { AGI, CON, FUE, HAB, CAR, INT, PER, VOL },
 *   pvBase, niveles: { sano, herido, tullido },
 *   humanidad, saludMental, alma: { actual, maxima }, deriva,
 *   cargaLibre, creditos, puntosEpicos,
 *   habilidades: { [nombreHabilidad]: valorTotal, ... },
 *   arma, armaCC, armadura, equipo: [...]
 * }
 */
export function normalizeCharacter(externalJson) {
  const errores = validarCampos(externalJson);
  if (errores.length) {
    throw new CharacterImportError("El JSON externo no tiene la forma esperada por el motor.", errores);
  }

  return {
    id: externalJson.id,
    nombre: externalJson.nombre,
    rol: externalJson.rol ?? "",
    retrato: externalJson.retrato ?? "assets/characters/placeholder.png",
    cita: externalJson.cita ?? "",
    atributos: { ...externalJson.atributos },
    pvBase: externalJson.pvBase,
    niveles: { ...externalJson.niveles },
    humanidad: externalJson.humanidad ?? 100,
    saludMental: externalJson.saludMental ?? 100,
    alma: { actual: 8, maxima: 10, ...(externalJson.alma ?? {}) },
    deriva: externalJson.deriva ?? 0,
    cargaLibre: externalJson.cargaLibre ?? 0,
    creditos: externalJson.creditos ?? 0,
    puntosEpicos: externalJson.puntosEpicos ?? 1,
    habilidades: { ...externalJson.habilidades },
    arma: externalJson.arma ?? null,
    armaCC: externalJson.armaCC ?? null,
    armadura: externalJson.armadura ?? null,
    equipo: [...(externalJson.equipo ?? [])],
    rasgoOpcional: externalJson.rasgoOpcional ?? null,
    fortaleza: externalJson.fortaleza ?? "",
    origen: "importado"
  };
}

function validarCampos(externalJson) {
  const errores = [];
  if (!externalJson || typeof externalJson !== "object") return ["El JSON está vacío o no es un objeto."];

  const requeridos = ["id", "nombre", "atributos", "pvBase", "niveles", "habilidades"];
  requeridos.forEach(campo => {
    if (externalJson[campo] === undefined) errores.push(`Falta el campo obligatorio "${campo}".`);
  });

  const atributosEsperados = ["AGI", "CON", "FUE", "HAB", "CAR", "INT", "PER", "VOL"];
  if (externalJson.atributos) {
    atributosEsperados.forEach(a => {
      if (typeof externalJson.atributos[a] !== "number") errores.push(`Atributo "${a}" ausente o no numérico.`);
    });
  }

  if (externalJson.niveles) {
    ["sano", "herido", "tullido"].forEach(n => {
      if (typeof externalJson.niveles[n] !== "number") errores.push(`Nivel de vida "${n}" ausente o no numérico.`);
    });
  }

  if (externalJson.habilidades && typeof externalJson.habilidades !== "object") {
    errores.push('"habilidades" debe ser un objeto { nombre: valor }.');
  }

  return errores;
}

export class CharacterImportError extends Error {
  constructor(message, detalles = []) {
    super(message);
    this.name = "CharacterImportError";
    this.detalles = detalles;
  }
}

// Punto de enganche futuro: dado un export CRUDO de la ficha autocalculada
// (`{version, state, form, exportedAt}`), traducirlo a ExternalCharacterJSON.
// Deliberadamente no implementado — requiere el mapa completo de ids de campo
// del formulario HTML. Lanza siempre para no fingir un resultado inventado.
export function desdeExportFichaAutocalculada(_exportCrudo) {
  throw new CharacterImportError(
    "Traducción directa desde el export de la ficha autocalculada (formato {version, state, form}) " +
    "todavía no está implementada — ver docs/CHARACTER_IMPORT_SPEC.md, sección 'Trabajo futuro'."
  );
}
