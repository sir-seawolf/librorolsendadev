# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vanilla HTML/CSS/JavaScript (ES modules nativos), sin framework, sin build
step. Canvas 2D para el raycaster en primera persona. Servido como sitio
estático (GitHub Pages). Decisión previa al proyecto, no delegada — así
consta en `docs/DESIGN.md` desde la iteración 1.

## Users

Jugadores de rol de mesa (y su Narrador) que ya conocen o están conociendo
*La Senda de los Errantes*, jugando en solitario o como grupo remoto, en
navegador de escritorio o móvil. Perfil real: aficionados al rol de mesa
cyberpunk/narrativo, no jugadores de videojuegos AAA — vienen con tolerancia
alta al texto y a las tiradas de dados visibles, y expectativa baja de
pulido gráfico tipo estudio, pero SÍ esperan que la interfaz no estorbe ni
parezca un prototipo abandonado.

## Product Purpose

Vertical slice jugable en navegador de un motor de aventuras data-driven
para *La Senda de los Errantes*: aventura gráfica point-and-click +
exploración en primera persona 2.5D + combate táctico por turnos con las
reglas reales d100 del sistema. No es un juego comercial independiente —
es una demostración jugable del manual de rol, pensada para que alguien
que nunca ha jugado a mesa pueda vivir una escena real del sistema sin
necesitar un Narrador humano. Éxito = quien lo prueba entiende las reglas
del sistema (munición, cobertura, tiradas, Puntos Épicos) jugando, y quiere
seguir leyendo el manual.

## Positioning

Ningún otro producto de rol de mesa cyberpunk tiene un prototipo jugador
en navegador que resuelva CADA tirada con el motor de reglas real (d100
visible, sin simplificar a "puntería" de videojuego) y que cargue el
contenido narrativo como datos JSON en vez de tenerlo cableado — permite
añadir módulos nuevos (ya hay dos: Predator N-5.2 y La Jaula Llegó Vacía)
sin tocar el motor.

## Operating Context

Se juega en una sesión corta (10-30 min), normalmente de una sentada,
navegando escenas secuenciales sin posibilidad de "explorar libremente"
fuera de lo que cada escena declara. El jugador interactúa con: point &
click sobre imágenes de fondo, un raycaster en primera persona con
controles de teclado o joystick táctil, overlays de tirada de dados, y un
panel de combate por turnos. Existe menú de Configuración (audio) y saves
independientes por módulo en localStorage. Sirve sobre GitHub Pages, con
un `.bat` de publicación local que regenera y copia estáticos.

## Capabilities and Constraints

- Motor: escenas en JSON interpretadas por tipo
  (`point_click`/`decision`/`single_roll`/`raycast`/`combat`/`ending`),
  nunca por nombre — ver `docs/SCENE_SCHEMA.md`.
- Combate (recién ampliado en Combat UX 0.2): munición real
  (cargador/reserva, Disparo=1/Ráfaga=3/Recargar), cobertura persistente
  por combatiente, tres modos de control (manual / PJ manual+compañeros
  auto / automático) con velocidad 1×/2×/4×, mismo resolvedor real en
  todos los modos.
- Audio: `AudioManager` propio con crossfade A/B entre pistas por estado
  narrativo (`musicState` declarado por escena), mute/volumen persistentes.
- Dos módulos jugables completos: Predator N-5.2 (point-click + raycaster +
  combate) y La Jaula Llegó Vacía (point-click + combate híbrido melé/
  distancia).
- Saves independientes por módulo en localStorage, con migración segura
  para saves anteriores a un cambio de esquema (nunca revienta un save
  viejo).
- Restricción dura: NO tocar reglas ni balance de combate en esta
  iteración (Blindaje 3 de Predator es un problema de balance conocido,
  pendiente de revisión contra canon, fuera de alcance aquí).
- Restricción dura: `JUEGO_QS/experiments/tactical_combat/` es un
  prototipo aislado — nunca se integra ni se publica.
- Sin build step: cualquier cambio de UI debe seguir funcionando servido
  como archivos estáticos sueltos.

## Brand Commitments

Nombre del producto: *La Senda de los Errantes*. Identidad ya establecida
en el manual publicado (cyberpunk multiversal, tono serio/adulto, sin
humor paródico). El prototipo debe seguir pareciendo "La Senda", nunca un
producto genérico de ciencia ficción sin marca ni un dashboard SaaS.

## Evidence on Hand

- Manual completo publicado: https://sir-seawolf.github.io/librorolsendadev/
- `docs/DESIGN.md` (este mismo proyecto): arquitectura técnica incumbente,
  desactualizado en cuanto a UI (no documenta Combat UX 0.2 ni el sistema
  de audio) pero correcto en arquitectura de motor.
- `docs/COMBAT_UX.md`: sistema de munición/cobertura/modos automáticos
  recién implementado.
- Sin testimonios, casos de estudio ni métricas de uso reales — no
  fabricar ninguno.

## Product Principles

1. FUNCIONALIDAD > LEGIBILIDAD > ATMÓSFERA > DECORACIÓN — nunca sacrificar
   una tirada, un botón de acción o información de combate por estética.
2. El escenario es el protagonista — cualquier panel de UI (ficha,
   configuración, HUD de combate) es secundario al fondo/escena y debe
   poder minimizarse u ocupar el mínimo espacio necesario.
3. Nada de vocabulario ni componentes de aplicación empresarial (dashboard,
   card grid, glassmorphism gratuito) — la referencia visual es ciencia
   ficción industrial oscura y táctica, no un panel de administración.
4. El motor es data-driven — un cambio de UI nunca debe cablear nombres de
   escena/módulo/enemigo concretos en el código genérico.
5. Nunca romper un save existente ni cambiar reglas/balance para resolver
   un problema de interfaz.

## Accessibility & Inclusion

Sin estándar formal exigido. Constraints conocidas de la propia sesión de
trabajo: reducir movimiento (`config.js` ya tiene un flag), contraste
razonable sobre fondos oscuros, objetivos táctiles suficientes en móvil
(el proyecto ya se juega en 375×812 y 812×375 reales).
