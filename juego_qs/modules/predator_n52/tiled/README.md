# Piloto Tiled del callejón

Abre `predator.tiled-project` con Tiled y después `callejon_piloto.tmj` o `callejon_tramo_b_piloto.tmj`. Ambos mapas usan rutas relativas y una cuadrícula técnica de 100 px sobre un mundo de 2400 × 900 px.

## Reparto de responsabilidades

> Tiled describe geometría, identidad y referencias. El contenido define las interacciones. El motor aplica las reglas. El tema decide la presentación.

Por eso el mapa contiene:

- el fondo maestro;
- la región caminable;
- el punto de aparición;
- cajas y clases de puerta, contenedor, farola y verja;
- puntos de aproximación referenciados como objetos.
- salidas rectangulares con escena y punto de llegada.

Las tiradas, dificultades, textos, consecuencias, estados gráficos, sombras y luces permanecen en `scenes/callejon_panoramico_piloto.json`. No deben copiarse al mapa.

Las siete clases reutilizables del piloto están definidas en el propio proyecto: `WalkableRegion`, `Occluder`, `Door`, `Interactable`, `Spawn`, `Exit` y `EncounterTrigger`. Un punto de aproximación es un objeto punto normal referenciado mediante una propiedad Tiled de tipo `object`; no necesita una octava clase.

## Validación y prueba

Guarda el mapa como JSON/TMJ sin comprimir y ejecuta:

```text
node --test tests/tiledPanoramicAdapter.test.mjs tests/panoramicScene.test.mjs
node tools/validate_scenes.mjs
```

Arranca el servidor local indicado en el README raíz. En el menú de PREDATOR, el bloque **Desarrollo** abre **Prueba panorámica del callejón** sin conectarla al recorrido narrativo real.

La cuadrícula, los polígonos, los anclajes y los hotspots solo se muestran mediante las opciones de depuración existentes; nunca se activan en producción.

## Conexión entre tramos

`Exit` declara exclusivamente `targetScene` y `targetSpawnId`, además de su caja física. La escena JSON aporta la etiqueta visible, los textos y cualquier requisito narrativo. Al activarla, el motor conserva el `spawnId` en el guardado y la localización destino selecciona el `Spawn` correspondiente; una transición normal sin destino lo limpia.

El tramo B es una prueba técnica de ida y vuelta y reutiliza el maestro del tramo A. No representa todavía un segundo callejón artístico ni forma parte del grafo narrativo publicado.
