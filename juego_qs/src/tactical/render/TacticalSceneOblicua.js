// TacticalSceneOblicua -- spike de cámara oblicua (Production
// Integration Phase 6C, docs/TACTICAL_PRODUCTION_PHASE6C_SPIKE.md).
//
// PRINCIPIO DE DISEÑO (obligatorio, ver el audit de 6A §3.6 y el
// encargo 6C): la rejilla lógica y la simulación no cambian ni un bit
// -- solo cambia CÓMO se proyecta esa rejilla sobre la pantalla y cómo
// se invierte el puntero. Por eso esta clase EXTIENDE TacticalScene en
// vez de reimplementar nada: hereda sin tocar el controlador de
// acciones, el motor de turnos, la IA, el HUD/panel, el selector de
// modo y el montaje de la interfaz DOM 6B -- todo eso son los métodos
// "compartidos" del audit §3.6, byte a byte los mismos que usa el
// renderer cenital. Solo se sobreescriben los métodos de PRESENTACIÓN
// PURA (dibujar rejilla/obstáculos/actores, FX, overlay de debug,
// hit-testing del puntero) -- exactamente la lista que el audit marcó
// como "intercambiable sin tocar la simulación".
//
// Verificación de que esto es cierto y no una promesa: ver
// tests/tacticalSceneOblicua.test.mjs, que compara
// `TacticalSceneOblicua.prototype._accionX === TacticalScene.prototype._accionX`
// (misma referencia de función, no una copia) para cada acción
// compartida.
import { TacticalScene } from "./TacticalScene.js";
import { crearEscalaIsometrica } from "./scaleIsometric.js";

const NIVEL_COLOR = { none: 0x5c6b5c, partial: 0xffe27a, solid: 0xff9d4d, total: 0xff4d4d };
const COLOR_POR_TIPO = { partial: 0xb08b3a, solid: 0x8a6d3a, total: 0x555b66 };
const ALPHA_POR_TIPO = { partial: 0.75, solid: 0.85, total: 0.92 };
const ALPHA_OCLUSION = 0.3; // pared "total" que taparía a un actor -- se vuelve casi transparente
const ALPHA_VISTA_CLARA = 0.15;

export class TacticalSceneOblicua extends TacticalScene {
  // CORRECCIÓN (verificación Playwright de 6C, ver
  // docs/TACTICAL_PRODUCTION_PHASE6C_SPIKE.md §5): sin este constructor,
  // TacticalSceneOblicua hereda el de TacticalScene tal cual, que llama
  // a `super("TacticalScene")` -- Phaser.Scene fija su key definitiva EN
  // el constructor, no a partir del parámetro de game.scene.add(). Con
  // las dos escenas reclamando la key interna "TacticalScene", el
  // SceneManager no logra resolver game.scene.getScene("TacticalSceneOblicua")
  // (confirmado empíricamente: el bug pasaba inadvertido en los tests
  // estáticos porque ninguno instancia Phaser de verdad).
  constructor() {
    super();
    this.sys.settings.key = "TacticalSceneOblicua";
  }

  // Suelo decorativo (encargo de sesión, 2026-08-21: "aproxima también
  // su jerarquía... suelo... provisionales procedentes de los recursos
  // CC0 disponibles" -- no se busca ningún recurso nuevo, se REUTILIZA
  // la textura ya integrada y con licencia verificada en la Fase 6D,
  // ver docs/PREDATOR_VISUAL_RESOURCES_MANIFEST_6D.md). `preload()` es
  // un método de ciclo de vida de Phaser.Scene que TacticalScene.js no
  // usaba hasta ahora (nunca cargó ninguna imagen) -- Phaser lo llama
  // automáticamente ANTES de create(), así que la textura ya está
  // disponible cuando `_grid()` la usa más abajo. Puramente decorativo:
  // no toca `_inicializarSistemaCoordenadas()` ni ningún cálculo de
  // proyección/hit-testing.
  preload() {
    this.load.image("tactical_floor_texture", "assets/shared/tactical/textures/concrete_floor_1k.jpg");
  }

  create() {
    super.create();
    this.game.registry.set("sceneName", "TacticalSceneOblicua");
    this._crearControlVistaClara();
  }

  // ===== Punto de extensión único para el sistema de coordenadas
  // (ver TacticalScene.js `_inicializarSistemaCoordenadas`) =====

  _inicializarSistemaCoordenadas(definition, session) {
    this.escalaIso = crearEscalaIsometrica(definition.battlefield.metersToPx, {
      anchoMundoMetros: session.battlefieldMeters.width,
      altoMundoMetros: session.battlefieldMeters.height
    });
    this.mundoPx = this.escalaIso.mundoPx;
  }

  _profundidadEnPantalla(xMetros, yMetros) {
    // Convención isométrica estándar: cuanto mayor x+y (más "al sur" en
    // la rejilla lógica), más cerca de la cámara -- se dibuja encima.
    // Multiplicado por 10 y con margen suficiente para no chocar con
    // las profundidades fijas del HUD/panel/overlay (30+) ni con las de
    // FX (20-21) definidas en TacticalScene.
    return 40 + Math.round(this.escalaIso.proyectar(xMetros, yMetros).y);
  }

  // ===== "Vista táctica clara" (encargo 6C: botón para reducir/hacer
  // transparente el decorado) =====

  _crearControlVistaClara() {
    this._vistaClaraActiva = false;
    // scrollFactor(0) -- coordenadas de viewport, no de mundo (mismo
    // criterio que la corrección en TacticalScene.js _crearHud()/
    // _crearPanelAcciones()/_crearSelectorModo()).
    const boton = this.add.text(this.cameras.main.width - 10, 10, "[ Vista táctica clara ]", {
      fontFamily: "monospace", fontSize: "12px", color: "#9fffb0", backgroundColor: "#111318", padding: { x: 8, y: 4 }
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(32).setInteractive({ useHandCursor: true });
    boton.on("pointerdown", () => {
      this._vistaClaraActiva = !this._vistaClaraActiva;
      boton.setColor(this._vistaClaraActiva ? "#ffe27a" : "#9fffb0");
      this._actualizarOcultamientoParedes();
    });
    this._botonVistaClara = boton;
  }

  // ===== Representación (isométrica) =====

  _grid() {
    const { width: wM, height: hM } = this.session.battlefieldMeters;
    if (this.textures.exists("tactical_floor_texture")) {
      // Sin recorte al rombo exacto del campo de batalla a propósito:
      // `GameObject.setMask()` con una máscara de geometría no está
      // soportado en el renderer WebGL de esta versión de Phaser
      // (aviso de consola confirmado en verificación real: "This method
      // is not supported in WebGL. Create a Mask filter instead." --
      // API distinta, fuera de alcance de un recurso decorativo
      // provisional). La textura se pinta a alpha bajo sobre el
      // rectángulo que contiene el rombo -- la rejilla y los actores se
      // dibujan encima y el ligero sobrante en las esquinas del rombo
      // es imperceptible a esa opacidad.
      this.add.image(this.mundoPx.width / 2, this.mundoPx.height / 2, "tactical_floor_texture")
        .setDisplaySize(this.mundoPx.width, this.mundoPx.height).setAlpha(0.4).setDepth(-1);
    }
    const g = this.add.graphics().setDepth(0);
    g.lineStyle(1, 0x22252b, 1);
    for (let x = 0; x <= wM; x += 1) {
      const p0 = this.escalaIso.proyectar(x, 0), p1 = this.escalaIso.proyectar(x, hM);
      g.lineBetween(p0.x, p0.y, p1.x, p1.y);
    }
    for (let y = 0; y <= hM; y += 1) {
      const p0 = this.escalaIso.proyectar(0, y), p1 = this.escalaIso.proyectar(wM, y);
      g.lineBetween(p0.x, p0.y, p1.x, p1.y);
    }
  }

  // Cada obstáculo es su propio GameObject (no un único Graphics
  // compartido) para poder asignarle una profundidad individual y que
  // Phaser lo entrevere correctamente con los sprites de actor -- es lo
  // que hace posible el ocultamiento de "paredes frontales" (encargo
  // 6C) sin tocar el orden de dibujo del resto de la escena.
  _pintarObstaculos() {
    this.obstacleGraphics = new Map();
    for (const o of this.session.obstacles) {
      const esquinas = [
        this.escalaIso.proyectar(o.x, o.y),
        this.escalaIso.proyectar(o.x + o.width, o.y),
        this.escalaIso.proyectar(o.x + o.width, o.y + o.height),
        this.escalaIso.proyectar(o.x, o.y + o.height)
      ];
      const g = this.add.graphics().setDepth(this._profundidadEnPantalla(o.x + o.width, o.y + o.height) - 1);
      g.fillStyle(COLOR_POR_TIPO[o.type], ALPHA_POR_TIPO[o.type] ?? 0.75);
      g.beginPath();
      g.moveTo(esquinas[0].x, esquinas[0].y);
      for (const p of esquinas.slice(1)) g.lineTo(p.x, p.y);
      g.closePath();
      g.fillPath();
      g.lineStyle(2, 0x000000, 0.6);
      g.strokePath();

      // Extrusión puramente visual (encargo 6C: "una diferencia de
      // elevación puramente visual, sin efecto mecánico" + paredes
      // "total" con altura perceptible): se dibuja una cara frontal
      // levantando en pantalla las dos esquinas más cercanas a cámara.
      // NUNCA lee ni escribe nada de la simulación -- solo decoración.
      const alturaMetros = o.alturaVisualMetros ?? (o.type === "total" ? 1.2 : 0);
      if (alturaMetros > 0) {
        const alturaPx = alturaMetros * this.escalaIso.escalaBase.metersToPx * 0.5;
        const base = [esquinas[2], esquinas[3]]; // las dos esquinas "sur" (más cerca de cámara)
        const techo = base.map(p => ({ x: p.x, y: p.y - alturaPx }));
        g.fillStyle(COLOR_POR_TIPO[o.type], (ALPHA_POR_TIPO[o.type] ?? 0.75) * 0.85);
        g.beginPath();
        g.moveTo(base[0].x, base[0].y);
        g.lineTo(base[1].x, base[1].y);
        g.lineTo(techo[1].x, techo[1].y);
        g.lineTo(techo[0].x, techo[0].y);
        g.closePath();
        g.fillPath();
        g.strokePath();
      }

      const centro = this.escalaIso.proyectar(o.x + o.width / 2, o.y + o.height / 2);
      const etiqueta = this.add.text(centro.x, centro.y, `${o.nombre ?? o.id}\n[${o.type}]`, {
        fontFamily: "monospace", fontSize: "10px", color: "#e8e8e8", align: "center"
      }).setOrigin(0.5).setDepth(g.depth + 1);

      this.obstacleGraphics.set(o.id, { graphics: g, etiqueta, obstaculo: o, alphaBase: ALPHA_POR_TIPO[o.type] ?? 0.75 });
    }
    this._actualizarOcultamientoParedes();
  }

  // Heurístico de ocultamiento (encargo 6C: "paredes frontales
  // ocultables/recortadas/transparentes cuando bloqueen unidades",
  // "unidades ocultas recuperables vía transparencia/vista clara"). No
  // es raycasting 3D real -- es un spike: una pared "total" cuya caja
  // en pantalla se solapa en X con un actor vivo situado lógicamente
  // "detrás" de ella (x+y mayor, más lejos de cámara en la convención
  // isométrica) se vuelve casi transparente. Puramente visual, no
  // afecta a getCover()/canAttack() reales (SpatialCoverAdapter).
  _actualizarOcultamientoParedes() {
    if (!this.obstacleGraphics) return;
    const actoresVivos = [...this.session.party, ...this.session.enemies].filter(a => a.estadoDisponibilidad === "disponible");
    for (const [, entry] of this.obstacleGraphics) {
      const { graphics, obstaculo: o, alphaBase } = entry;
      if (this._vistaClaraActiva) { graphics.setAlpha(ALPHA_VISTA_CLARA); continue; }
      if (o.type !== "total") { graphics.setAlpha(1); continue; }
      const profundidadPared = o.x + o.width + (o.y + o.height);
      const xIzq = this.escalaIso.proyectar(o.x, o.y + o.height).x;
      const xDer = this.escalaIso.proyectar(o.x + o.width, o.y).x;
      const [xMin, xMax] = xIzq <= xDer ? [xIzq, xDer] : [xDer, xIzq];
      const oculta = actoresVivos.some(a => {
        const pos = this.session.positions[a.id];
        const profundidadActor = pos.x + pos.y;
        if (profundidadActor <= profundidadPared) return false; // el actor está delante, no lo tapa
        const p = this.escalaIso.proyectar(pos.x, pos.y);
        return p.x >= xMin - 4 && p.x <= xMax + 4;
      });
      graphics.setAlpha(oculta ? ALPHA_OCLUSION : 1);
    }
  }

  _pintarActores() {
    this.actorSprites = new Map();
    for (const a of [...this.session.party, ...this.session.enemies]) {
      const esEnemigo = !this.session.esParty(a.id);
      const pos = this.session.positions[a.id];
      const p = this.escalaIso.proyectar(pos.x, pos.y);
      const depth = this._profundidadEnPantalla(pos.x, pos.y);
      // Base/sombra (encargo 6C: "bases/sombras/contornos/marcadores
      // suficientes") -- puramente decorativa, ancla visualmente el
      // actor a su casilla en la rejilla isométrica.
      const base = this.add.ellipse(p.x, p.y + 4, 22, 10, 0x000000, 0.35).setDepth(depth - 1);
      const circle = this.add.circle(p.x, p.y, 11, a.color ?? (esEnemigo ? 0xff6b6b : 0x9fffb0)).setDepth(depth).setInteractive({ useHandCursor: true });
      circle.setStrokeStyle(2, esEnemigo ? 0x3a0d0d : 0x0d3a1a);
      const label = this.add.text(p.x, p.y - 22, a.nombre, { fontFamily: "monospace", fontSize: "11px", color: esEnemigo ? "#ff9d9d" : "#dfffe4" }).setOrigin(0.5).setDepth(depth + 1);
      const vida = this.add.text(p.x, p.y + 14, "", { fontFamily: "monospace", fontSize: "9px", color: "#cccccc" }).setOrigin(0.5).setDepth(depth + 1);
      circle.on("pointerdown", () => this._onActorClicked(a.id));
      this.actorSprites.set(a.id, { circle, label, vida, base, esEnemigo });
    }
    this._actualizarSpritesVida();
  }

  _reposicionarSprite(actorId) {
    const pos = this.session.positions[actorId];
    const p = this.escalaIso.proyectar(pos.x, pos.y);
    const depth = this._profundidadEnPantalla(pos.x, pos.y);
    const { circle, label, vida, base } = this.actorSprites.get(actorId);
    circle.setPosition(p.x, p.y).setDepth(depth);
    label.setPosition(p.x, p.y - 22).setDepth(depth + 1);
    vida.setPosition(p.x, p.y + 14).setDepth(depth + 1);
    base.setPosition(p.x, p.y + 4).setDepth(depth - 1);
    this._actualizarOcultamientoParedes();
  }

  // ===== Input (inversión de puntero isométrica) =====

  _crearInput() {
    this.input.on("pointerdown", (pointer) => {
      if (pointer.y < 150) return;
      const objetivo = this.input.hitTestPointer(pointer)[0];
      if (objetivo) return;
      if (this._modoMover) {
        const { x, y } = this.escalaIso.invertir(pointer.worldX, pointer.worldY);
        this._accionMoverA(x, y);
      }
    });
  }

  // ===== FX (posiciones proyectadas) =====

  _fxDisparo(attackerId, targetId, impacto) {
    const a = this.adapter.posicionDe(attackerId), t = this.adapter.posicionDe(targetId);
    const pa = this.escalaIso.proyectar(a.x, a.y), pt = this.escalaIso.proyectar(t.x, t.y);
    const depth = Math.max(this._profundidadEnPantalla(a.x, a.y), this._profundidadEnPantalla(t.x, t.y)) + 5;
    const linea = this.add.line(0, 0, pa.x, pa.y, pt.x, pt.y, 0xffe27a, 0.9).setOrigin(0, 0).setLineWidth(2).setDepth(depth);
    const flash = this.add.circle(pa.x, pa.y, 6, 0xffffff, 0.9).setDepth(depth);
    const marca = this.add.circle(pt.x, pt.y, 8, impacto ? 0xff4d4d : 0x8a8a8a, 0.85).setDepth(depth);
    this.tweens.add({ targets: [linea, flash, marca], alpha: 0, duration: 260, onComplete: () => { linea.destroy(); flash.destroy(); marca.destroy(); } });
  }

  _fxRechazo(targetId) {
    const t = this.adapter.posicionDe(targetId);
    const p = this.escalaIso.proyectar(t.x, t.y);
    const depth = this._profundidadEnPantalla(t.x, t.y) + 5;
    const x = this.add.text(p.x, p.y - 40, "BLOQUEADO", { fontFamily: "monospace", fontSize: "12px", color: "#ff4d4d" }).setOrigin(0.5).setDepth(depth);
    this.tweens.add({ targets: x, y: x.y - 16, alpha: 0, duration: 700, onComplete: () => x.destroy() });
  }

  // ===== Overlay debug espacial (posiciones proyectadas) =====

  _redibujarOverlay() {
    this.debugGraphics.clear();
    this.debugText.setText("");
    const s = this.session;
    if (!this._debugSpatial || !s.currentActorId || !s.targetActorId) return;
    const cover = this.adapter.getCover(s.currentActorId, s.targetActorId);
    const distancia = this.adapter.getDistance(s.currentActorId, s.targetActorId);
    const a = this.adapter.posicionDe(s.currentActorId), t = this.adapter.posicionDe(s.targetActorId);
    const pa = this.escalaIso.proyectar(a.x, a.y), pt = this.escalaIso.proyectar(t.x, t.y);
    const color = NIVEL_COLOR[cover.level];

    this.debugGraphics.lineStyle(cover.level === "total" ? 3 : 2, color, cover.canAttack ? 0.85 : 0.55);
    if (cover.level === "total") {
      const steps = 14;
      for (let i = 0; i < steps; i += 2) {
        const t0 = i / steps, t1 = (i + 1) / steps;
        this.debugGraphics.lineBetween(pa.x + (pt.x - pa.x) * t0, pa.y + (pt.y - pa.y) * t0, pa.x + (pt.x - pa.x) * t1, pa.y + (pt.y - pa.y) * t1);
      }
    } else {
      this.debugGraphics.lineBetween(pa.x, pa.y, pt.x, pt.y);
    }
    // La proyección isométrica es afín (lineal) -- el punto medio
    // proyectado coincide con la proyección del punto medio lógico, no
    // hace falta promediar en pantalla.
    const medio = this.escalaIso.proyectar((a.x + t.x) / 2, (a.y + t.y) / 2);
    this.debugText.setPosition(medio.x + 8, medio.y - 10);
    let texto = `${s.currentActorId} → ${s.targetActorId}\n${cover.level.toUpperCase()} ${cover.canAttack ? "" : "(canAttack=false)"}\n${distancia.toFixed(1)} m${cover.source ? ` · ${cover.source}` : ""}`;
    const u = this._debugUltimoAtaque;
    if (u && u.attacker === s.currentActorId && u.target === s.targetActorId) {
      texto += u.rechazado ? `\nRECHAZADO: ${u.reasons.join(", ")}` : `\ntirada=${u.tirada} ${u.exito ? "éxito" : "fallo"}${u.esCritico ? " CRIT" : ""}${u.esPifia ? " PIFIA" : ""}\n${u.impacto ? `hit ${u.localizacion} dmg=${u.danioFinal}` : "miss/absorbido"}`;
    }
    this.debugText.setText(texto);
  }
}
