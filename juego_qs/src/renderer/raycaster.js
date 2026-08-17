// Raycaster mínimo (marcha por pasos + heurística de cara), estilo
// Wolfenstein/Doom clásico. Sin motor 3D real: solo proyección de columnas
// verticales por distancia. El origen de las texturas de cada módulo se
// documenta en el propio módulo (p.ej. docs/ATLAS_SPEC.md dentro de su
// carpeta docs/), no aquí — este archivo no sabe de qué módulo vienen.
//
// El renderer NO conoce rutas de PNG por nombre ni de qué módulo vienen:
// recibe un mapa `tipoDeCelda -> claveDeTextura` (del propio mapa JSON), la
// URL de un manifiesto de texturas (`rutaManifiestoTexturas`) y una función
// `resolverAsset` para convertir la ruta relativa del manifiesto en una URL
// real — quien lo instancia (src/engine/renderers/raycast.js) es quien sabe
// de qué módulo se trata; este archivo sigue siendo agnóstico. Sin ninguno
// de los dos, cae a la ruta literal del manifiesto (útil en tests, ver
// tests/raycaster.test.mjs) — nunca rompe el render (punto 25 del encargo:
// `asset || fallbackColor`).

import { config } from "../config.js";

const COLOR_FALLBACK = {
  1: "#4a4640", // hormigón
  2: "#5a3a2a", // ladrillo
  5: "#3a4a52"  // metal
};

const cacheManifiestosTexturas = new Map();
async function cargarManifiestoTexturas(rutaManifiesto) {
  if (cacheManifiestosTexturas.has(rutaManifiesto)) return cacheManifiestosTexturas.get(rutaManifiesto);
  let manifiesto;
  try {
    const res = await fetch(rutaManifiesto);
    manifiesto = await res.json();
  } catch (e) {
    manifiesto = { assets: {} };
  }
  cacheManifiestosTexturas.set(rutaManifiesto, manifiesto);
  return manifiesto;
}

const imagenesCache = new Map();
function cargarImagen(ruta) {
  if (imagenesCache.has(ruta)) return imagenesCache.get(ruta);
  const img = new Image();
  const promesa = new Promise(resolve => {
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // fallback silencioso a color plano
  });
  img.src = ruta;
  imagenesCache.set(ruta, promesa);
  return promesa;
}

export class Raycaster {
  constructor(canvas, mapa, {
    anchoInterno = 320, altoInterno = 200, fov = Math.PI / 3, wallTypes = null,
    rutaManifiestoTexturas = "src/data/assets/textures.json",
    resolverAsset = (ruta) => ruta
  } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false; // nearest-neighbour: estética retro, más barato
    this.mapa = mapa;
    this.anchoInterno = anchoInterno;
    this.altoInterno = altoInterno;
    this.fov = fov;
    this.wallTypes = wallTypes || {};
    this.rutaManifiestoTexturas = rutaManifiestoTexturas;
    this.resolverAsset = resolverAsset;
    this.texturasPorTipo = {}; // tipoDeCelda -> HTMLImageElement | null
    canvas.width = anchoInterno;
    canvas.height = altoInterno;
    this._prepararTexturas();
  }

  async _prepararTexturas() {
    const manifiesto = await cargarManifiestoTexturas(this.rutaManifiestoTexturas);
    for (const [tipo, info] of Object.entries(this.wallTypes)) {
      const clave = info.atlasTile;
      const spec = manifiesto.assets?.[clave];
      if (!spec) continue; // sin entrada en el manifiesto -> se queda en color de refuerzo
      const rutaGenerada = this.resolverAsset(`assets/generated/${spec.outFile}`);
      cargarImagen(rutaGenerada).then(img => {
        if (!img) return;
        this.texturasPorTipo[tipo] = img;
        // Si una textura termina de cargar DESPUÉS del primer frame (carrera
        // habitual: el primer render() es síncrono, la carga de imagen no),
        // se repinta con los últimos parámetros conocidos para no depender
        // de que llegue un nuevo frame de movimiento.
        if (this._ultimoRender) this.render(...this._ultimoRender);
      });
    }
  }

  esMuro(x, y) {
    const fila = this.mapa[Math.floor(y)];
    if (!fila) return true;
    const celda = fila[Math.floor(x)];
    return celda === undefined || (celda !== 0 && !this._esCeldaEspecial(celda));
  }

  _esCeldaEspecial(celda) {
    // Celdas de meta (refugio/vehículo) no son muros a efectos de colisión,
    // pero tampoco tienen textura de pared — el llamador ya filtra antes.
    return false;
  }

  render(px, py, angulo) {
    this._ultimoRender = [px, py, angulo];
    const { ctx, anchoInterno, altoInterno, fov } = this;
    ctx.fillStyle = "#1a1a1a"; // techo
    ctx.fillRect(0, 0, anchoInterno, altoInterno / 2);
    ctx.fillStyle = "#26221f"; // suelo
    ctx.fillRect(0, altoInterno / 2, anchoInterno, altoInterno / 2);

    this.zBuffer = this.zBuffer || new Array(anchoInterno);

    for (let col = 0; col < anchoInterno; col++) {
      const rayAngulo = angulo - fov / 2 + (col / anchoInterno) * fov;
      const dx = Math.cos(rayAngulo);
      const dy = Math.sin(rayAngulo);

      let dist = 0;
      let tipoMuro = 1;
      let caraU = 0;
      const paso = 0.02;
      let x = px, y = py;
      let prevX = x, prevY = y;
      while (dist < 20) {
        prevX = x; prevY = y;
        x += dx * paso;
        y += dy * paso;
        dist += paso;
        if (this.esMuro(x, y)) {
          tipoMuro = this.mapa[Math.floor(y)]?.[Math.floor(x)] ?? 1;
          // Heurística de cara: si cruzamos un límite entero de columna (x),
          // es una cara vertical (este/oeste) y la U de textura es la parte
          // fraccional de Y; si cruzamos un límite de fila (y), cara
          // horizontal y la U es la parte fraccional de X.
          const cruzoColumna = Math.floor(x) !== Math.floor(prevX);
          caraU = cruzoColumna ? (y - Math.floor(y)) : (x - Math.floor(x));
          break;
        }
      }

      const distCorregida = dist * Math.cos(rayAngulo - angulo);
      this.zBuffer[col] = distCorregida;
      const alturaLinea = Math.min(altoInterno, altoInterno / (distCorregida + 0.0001));
      // "Fog por distancia": oscurecimiento barato en función de la distancia.
      // Desactivable en config.js sin tocar el motor — con fog apagado, solo
      // queda un sombreado mínimo para que los muros no se vean totalmente planos.
      const sombra = config.visualEffects.fog
        ? Math.max(0.2, 1 - distCorregida / 12)
        : Math.max(0.75, 1 - distCorregida / 40);
      const textura = this.texturasPorTipo[tipoMuro];
      const yTop = (altoInterno - alturaLinea) / 2;

      if (textura) {
        const colX = Math.floor(caraU * textura.width);
        ctx.globalAlpha = 1;
        ctx.drawImage(textura, colX, 0, 1, textura.height, col, yTop, 1, alturaLinea);
        if (sombra < 1) {
          ctx.fillStyle = `rgba(0,0,0,${1 - sombra})`;
          ctx.fillRect(col, yTop, 1, alturaLinea);
        }
      } else {
        const colorBase = COLOR_FALLBACK[tipoMuro] || COLOR_FALLBACK[1];
        ctx.fillStyle = sombrear(colorBase, sombra);
        ctx.fillRect(col, yTop, 1, alturaLinea);
      }
    }
  }

  // Sprites billboard: siempre de cara a la cámara, escalados por distancia,
  // ocultos tras paredes más cercanas (comparando contra el zBuffer que
  // `render()` ya dejó relleno columna a columna). `sprites` es
  // [{ x, y, image, escala }]; se ordenan de más lejos a más cerca (pintor).
  renderSprites(px, py, angulo, sprites) {
    const { ctx, anchoInterno, altoInterno, fov } = this;
    if (!this.zBuffer) return;

    const conDistancia = sprites
      .filter(s => s.image)
      .map(s => {
        const ddx = s.x - px, ddy = s.y - py;
        const dist = Math.hypot(ddx, ddy);
        let anguloRel = Math.atan2(ddy, ddx) - angulo;
        while (anguloRel > Math.PI) anguloRel -= 2 * Math.PI;
        while (anguloRel < -Math.PI) anguloRel += 2 * Math.PI;
        return { ...s, dist, anguloRel };
      })
      .filter(s => s.dist > 0.15 && Math.abs(s.anguloRel) < fov * 0.85)
      .sort((a, b) => b.dist - a.dist);

    for (const s of conDistancia) {
      const escala = s.escala ?? 1;
      const alturaSprite = Math.min(altoInterno * 1.6, (altoInterno / s.dist) * escala);
      const aspecto = s.image.width / s.image.height;
      const anchoSprite = alturaSprite * aspecto;
      const centroX = (anchoInterno / 2) * (1 + s.anguloRel / (fov / 2));
      const yTop = (altoInterno - alturaSprite) / 2;
      const xIzq = centroX - anchoSprite / 2;

      const colIni = Math.max(0, Math.floor(xIzq));
      const colFin = Math.min(anchoInterno, Math.ceil(xIzq + anchoSprite));
      if (colFin <= colIni) continue;

      const sombra = Math.max(0.25, 1 - s.dist / 14);
      ctx.save();
      ctx.filter = sombra < 1 ? `brightness(${sombra})` : "none";
      for (let col = colIni; col < colFin; col++) {
        if (s.dist >= (this.zBuffer[col] ?? Infinity)) continue; // tras una pared: no se dibuja
        const uCol = (col - xIzq) / anchoSprite;
        const srcX = Math.max(0, Math.min(s.image.width - 1, Math.floor(uCol * s.image.width)));
        ctx.drawImage(s.image, srcX, 0, 1, s.image.height, col, yTop, 1, alturaSprite);
      }
      ctx.restore();
    }
  }
}

function sombrear(hex, factor) {
  const r = parseInt(hex.slice(1, 3), 16) * factor;
  const g = parseInt(hex.slice(3, 5), 16) * factor;
  const b = parseInt(hex.slice(5, 7), 16) * factor;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
