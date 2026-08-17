# JUEGO_QS — Motor de aventuras de La Senda de los Errantes

Motor de aventuras web data-driven de *La Senda de los Errantes*,
independiente del manual/módulos/fichas originales. Desde la iteración 5 el
motor (`src/`) no conoce ningún contenido concreto — carga **módulos** desde
`modules/<id>/` (ver `docs/MODULE_ARCHITECTURE.md`). El primer módulo, y el
único jugable hoy, es **Predator N-5.2 — Las guerras secretas**
(`modules/predator_n52/`), el Quick Starter de *La Senda de los Errantes*.

Documentación:
- `docs/MODULE_ARCHITECTURE.md` — qué es motor y qué es módulo, estructura, `module.json`, ciclo de vida.
- `docs/CREATING_MODULES.md` — cómo crear un módulo nuevo, paso a paso.
- `docs/CREATING_SCENES.md` — cómo añadir una escena nueva dentro de un módulo, paso a paso.
- `docs/SCENE_SCHEMA.md` — formato de las escenas JSON.
- `docs/SCENE_SCHEMA_VALIDATION.md` — `tools/validate_scenes.mjs`, el validador cruzado de escenas/mapas por módulo.
- `docs/SAVE_MIGRATION.md` — guardado por módulo y migración desde la iteración 4.
- `docs/DESIGN.md` — diseño y arquitectura completos (histórico por iteración).
- `docs/QS_RULE_MAP.md` — trazabilidad de cada regla frente al QS/manual.
- `docs/ASSET_MAP.md` — arte reutilizado.
- `docs/PARTY_SYSTEM.md` — grupo, delegación, Ayudar y disponibilidad.
- `docs/CHARACTER_IMPORT_SPEC.md` — formato para importar personajes externos.
- `docs/GENERATED_ASSETS.md` — trazabilidad de cada asset recortado de las láminas fuente.
- `docs/VISUAL_TESTING.md` — invariantes del raycaster (`tests/raycaster.test.mjs`).
- `docs/PUBLISHING.md` — cómo `JUEGO_QS` llega al sitio publicado (GitHub Pages).
- `modules/predator_n52/docs/` — documentación propia de ese módulo (`ATLAS_SPEC.md`, `ASSET_NEEDS.md`).

## Cómo arrancar

Es una app estática (HTML + JS por módulos ES + Canvas). El navegador
bloquea `fetch()` sobre `file://`, así que hace falta un servidor local
mínimo — cualquiera de estos sirve:

```bash
# Opción 1: Python (ya viene instalado en la mayoría de sistemas)
python -m http.server 8731 --directory JUEGO_QS
```

```bash
# Opción 2: Node (si tienes npx disponible)
npx http-server JUEGO_QS -p 8731
```

Después abre `http://localhost:8731` en el navegador.

> **Nota para depuración con un navegador embebido/proxy de previsualización:**
> si editas un archivo `.js`/`.json` y el navegador sigue ejecutando la
> versión anterior aunque `curl`/`fetch({cache:'no-store'})` ya muestren el
> contenido nuevo, es un proxy de caché delante del servidor, no un bug del
> juego — cambia el puerto del servidor local y vuelve a abrir la página.

## Controles

- **Callejón:** clic en los verbos (MIRAR/COGER/USAR/HABLAR/MOVERSE) y luego clic en el punto de la escena.
- **Persecución 2.5D:** WASD o flechas de teclado para moverte y girar; **E** para interactuar con un punto marcado cerca.
- **Combate:** clic en la acción del turno.

Cuando una acción admite varios ejecutores, aparece un selector para delegarla
en un compañero presente — se muestra su habilidad efectiva real antes de
elegir.

## Tests

Sin dependencias — usa el test runner nativo de Node.js (18+):

```bash
node --test tests/
```

Cubren: reglas de tirada (éxito/fallo/crítico/pifia), progresión de
habilidades, party/delegación/disponibilidad, y validez estructural de las
escenas JSON.

## Estado del prototipo

Arranque en dos niveles: **selector de módulos** → **menú del módulo**
elegido → selección de personaje → callejón → perseguidores →
HUIR/LUCHAR/ESCONDERSE → (si te escondes) rastrear la tarjeta-llave → la
casa de Arthur Dicking (Escena 2 del QS, investigación + diálogo con
Cinthia Mollis) → resolución, con varios finales distintos alcanzables. Ver
`docs/DESIGN.md` → "Qué queda deliberadamente sin hacer en esta iteración"
para el alcance exacto, y `docs/MODULE_ARCHITECTURE.md` para cómo está
organizado por dentro.

No se ha modificado ningún archivo fuente del manual, el Quick Starter, los
módulos o las fichas originales.
