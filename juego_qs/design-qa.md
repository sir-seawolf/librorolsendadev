# Design QA — combate táctico Predator N-5.2

## Evidencia

- Fuente visual: `D:\SendaErrantesDev\JUEGO_QS\design-qa-reference.png`
- Implementación: `D:\SendaErrantesDev\JUEGO_QS\design-qa-implementation.png`
- Comparación conjunta: `D:\SendaErrantesDev\JUEGO_QS\design-qa-comparison.png`
- Fuente: 420 × 449 px. La propia maqueta identifica su objetivo como escritorio 1440 × 900; se usa como guía de composición, no como captura 1:1 del viewport.
- Implementación: viewport y captura 964 × 912 CSS px, `deviceScaleFactor: 1`.
- Estado comparado: turno manual de Kova, familia Tácticas desplegada, ficha cerrada.

## Superficies de fidelidad

- Tipografía: Barlow Condensed mantiene la voz estrecha e industrial de la referencia; pesos, mayúsculas y jerarquía son coherentes y legibles.
- Espaciado y composición: escenario protagonista, resumen compacto arriba, bandeja contextual y familias ancladas abajo. No hay desbordamiento ni controles persistentes ocultos.
- Color: base carbón/gunmetal, información cian, hostiles rojos y acentos ámbar. El contraste es suficiente y el color no es el único indicador de estado.
- Imágenes: el tablero, Kova, Bishop y Salim son recursos raster terminados; no quedan retratos comprimidos usados como tokens ni cajas provisionales. Los ejecutores conservan su sprite productivo.
- Copia: nombres, estados, munición, acciones y localización proceden del encuentro y del snapshot real, sin texto demostrativo incrustado en el arte.

## Comparación e iteraciones

### Iteración 1 — bloqueada

- P1: rejilla técnica marrón y coberturas geométricas en lugar de un escenario terminado.
- P1: retratos verticales comprimidos como fichas del tablero.
- P1: gran franja negra separaba el tablero de las acciones.
- P2: nombres largos y valores de vida se solapaban.
- P2: no se veía el alcance de movimiento del actor activo.

Correcciones: escenario isométrico modular, sprites tácticos separados de los retratos, encuadre 16:10, etiquetas abreviadas, vida compacta y cuadrícula de movimiento cian.

### Iteración 2 — sustituida

- El tablero tiene la misma jerarquía visual y dirección industrial que la referencia.
- Los personajes y enemigos se distinguen por silueta, aro, nombre y estado.
- Ficha, selector de control, familias y acciones funcionan sobre la lógica existente.
- Consola del navegador: 0 errores.
- Interacciones verificadas: entrada de desarrollo, selección Kova manual, apertura/cierre de ficha, cambio a Ofensivas y bandeja Tácticas.

Esta iteración se sustituyó tras la revisión del autor: el escenario completo
era útil como referencia visual, pero no permitía construir mapas jugables por
piezas.

### Iteración 3 — arquitectura por capas

- El fondo completo queda únicamente como fallback.
- Suelo, paredes, esquinas, obstáculos y salidas se cargan como recursos
  independientes y se colocan desde la definición del encuentro.
- La salida puede cambiar entre `closed` y `open` sin reconstruir la escena.
- Los enemigos ya declaran `idle`, `hurt` y `down`.
- Los tres estados representan perseguidores humanos anónimos; el arte no los
  convierte en robots ni revela su afiliación antes del flag narrativo.
- P1 pendiente: faltan las variantes `hurt` y `down` propias de Kova, Bishop y
  Salim.
- P2 pendiente: afinar posición, escala, oclusión y tono de las piezas hasta
  recuperar el acabado visual de la referencia sin volver a un fondo plano.

### Iteración 4 — composición gobernada

- Paredes y salidas usan coordenadas métricas del tablero; ya no dependen del
  viewport ni de porcentajes elegidos a mano.
- Cada obstáculo visual se vincula mediante `obstacleId` a su obstáculo
  mecánico. Si la referencia no existe, la pieza se omite en vez de aparecer
  descontrolada en `(0,0)`.
- Una única anchura en metros gobierna cada pieza y el compositor conserva su
  proporción natural. La profundidad deriva de su anclaje isométrico.
- Cajas y barrera emplean recortes tácticos con transparencia real, sin los
  rectángulos de fondo que traían los recursos del raycaster.
- La microcorrección final se hizo exclusivamente en el JSON de Predator; el
  compositor sigue siendo agnóstico del módulo.
- Verificación: 824 tests superados y detector mecánico de layout sin
  incidencias.

## Follow-up polish

- P3: la referencia muestra cinco acciones tácticas concretas; la implementación enseña solo las acciones que el catálogo real considera disponibles. Cuando el motor incorpore Cobertura e Interactuar, el mismo contenedor las añadirá sin rediseño.
- P3: crear variantes dañadas de los tres sprites aliados reforzaría el estado de herida sin cambiar la composición.

final result: blocked — composición resuelta; faltan variantes aliadas `hurt`/`down`
