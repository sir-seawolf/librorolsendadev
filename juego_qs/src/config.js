// Configuración global del prototipo: flags de efectos visuales baratos y
// accesibilidad. Todo desactivable; nada aquí depende de librerías externas.
export const config = {
  visualEffects: {
    fog: true,          // oscurecimiento adicional por distancia en el raycaster
    vignette: true,      // viñeta CSS en los bordes de la vista 2.5D
    headBob: true,       // leve balanceo de cámara al moverse
    screenShake: true,   // sacudida breve al recibir daño / ser alcanzado
    rain: false,          // overlay de lluvia (coste de dibujo por frame, apagado por defecto)
    muzzleFlash: true,    // destello breve al disparar
    impactFlash: true,    // destello breve al impactar/recibir un impacto
    sceneFade: true        // fundido breve al cambiar de escena
  },
  accessibility: {
    reduceMotion: false,  // desactiva headBob y suaviza el screenShake
    largeUI: false         // aumenta el tamaño de fuente base de la interfaz
  }
};

export function aplicarAccesibilidad() {
  document.documentElement.classList.toggle("reduce-motion", config.accessibility.reduceMotion);
  document.documentElement.classList.toggle("large-ui", config.accessibility.largeUI);
  if (config.accessibility.reduceMotion) {
    config.visualEffects.headBob = false;
  }
}
