# Paquete visual — Callejón PREDATOR

Estado: primer paquete aprobado para integración piloto. No sustituye al contrato visual de `JUEGO_QS`; lo materializa.

> **Nota de auditoría del traductor (lote de datos):** `puerta_cerrada.png`,
> `puerta_forzada.png`, `valla_intacta.png` y `valla_saltada.png` (los
> cuatro descritos en este manifiesto) quedaron **superados** por el
> paquete V2 frontal (`*_frontal_v2.png`, ya integrado en
> `callejon_panoramico_piloto.json`) y hoy no los referencia ninguna
> escena. Se conservan sin borrar por si hiciera falta comparar o
> recuperar algo del pase v1 -- candidatos a limpieza en un lote futuro,
> una vez confirmado que nadie los necesita.

## Fondo maestro

- `assets/callejon_master.jpg`
- 2400×900 px, JPG, 332 061 bytes.
- Fondo compuesto opaco. Incluye arquitectura, suelo, skyline e iluminación ambiental pintada.
- No tratar sus edificios como capas de paralaje separadas. El piloto puede funcionar con paneo horizontal del maestro; las capas `far` y `near` se añadirán en un pase posterior si la prueba demuestra que aportan suficiente valor.

## Objetos con estados

| Objeto | Archivo | Medidas | Anclaje de mundo recomendado |
|---|---|---:|---|
| Puerta cerrada | `assets/puerta_cerrada.png` | 180×260 | x=640, y=760, centro inferior |
| Puerta forzada | `assets/puerta_forzada.png` | 180×260 | x=640, y=760, centro inferior |
| Farola apagada | `assets/farola_apagada.png` | 90×420 | x=1550, y=700, centro inferior |
| Farola encendida | `assets/farola_encendida.png` | 90×420 | x=1550, y=700, centro inferior |
| Halo de farola | `assets/halo_farola.png` | 300×300 | centrado en la luminaria |
| Luz sobre el suelo | `assets/luz_suelo_farola.png` | 200×80 | bajo la farola, capa aditiva |
| Valla intacta | `assets/valla_intacta.png` | 220×260 | x=2050, y=760, centro inferior |
| Valla abierta/saltada | `assets/valla_saltada.png` | 300×260 | x=2050, y=760, centro inferior |
| Contenedor-escondite | `assets/contenedor_escondite.png` | 400×340 | x=380, y=770, centro inferior |

Todos los PNG poseen canal alfa real. El contenedor sirve además como fuente de la máscara de oclusión: la zona opaca central debe pintarse delante del personaje cuando este use el escondite.

## Corrección necesaria al contrato

No aplicar literalmente la escala `0,42→1,0` según el eje X. En este fondo el recorrido principal es lateral y mantiene aproximadamente la misma profundidad. El personaje debe conservar una escala estable durante el desplazamiento horizontal. La escala solo cambiará al recorrer una senda que entre hacia el punto de fuga, mediante una futura región o polilínea de profundidad.

## Uso recomendado en el piloto

1. Mostrar el maestro con cámara horizontal y zona muerta central.
2. Superponer los objetos según `gameState.flags`.
3. La farola encendida usa simultáneamente farola, halo y luz de suelo; el halo y la luz son decorativos y pueden desactivarse por accesibilidad/rendimiento.
4. No vincular una pista exclusivamente a lluvia, humo, halo o paralaje.
5. Mantener el `performanceFallback` con el fondo legacy hasta validar esta escena.

## Procedencia y proceso

- Fondo y objetos generados con la herramienta integrada Imagegen de Codex, dirigidos por el contrato visual y la estética PREDATOR aprobada por el autor.
- Los objetos se generaron como piezas aisladas, se eliminaron los dameros de previsualización y se normalizaron a sus tamaños de integración con alfa real.
- La farola encendida, su halo y la luz de suelo se derivaron de la farola apagada para conservar exactamente su silueta y evitar una variante incoherente.
- Sin recursos de terceros ni obligaciones de atribución en este lote.

## Prompts finales, resumidos

- Fondo: callejón urbano panorámico 8:3, nocturno y húmedo, retroindustrial, habitado y funcional; punto de fuga central, banda caminable inferior, grafiti de dos movimientos rivales, sin personajes, interfaz, neón excesivo ni objetos interactivos incrustados.
- Puerta: puerta de servicio industrial de acero negro reparado, cerrada y forzada, misma perspectiva y desgaste, sin entorno.
- Farola: luminaria industrial estrecha, apagada y encendida, misma silueta; brillo y luz de suelo en capas separadas.
- Valla: verja industrial de malla, intacta y abierta tras ser superada, misma construcción y anclaje.
- Contenedor: contenedor industrial grande y reparado, suficiente para ocultar a un personaje, vista 3/4, sin entorno.

## Integridad

| Archivo | SHA-256 |
|---|---|
| `callejon_master.jpg` | `26908f36147c78d918ec68b14323303b6eeca786d89c7df801d2a0bcb80df3dc` |
| `contenedor_escondite.png` | `fa3adba3bc7110249a22ff4fab53706d572a91a470e668551b76394eb902f004` |
| `farola_apagada.png` | `d6d2a188ee802f5ae0609781ccf9c46e96c84e4b41f8a5528ea34166c6e2f4a6` |
| `farola_encendida.png` | `e03b190672974412cb325cd22987257e91eb024e5428ae88ca6d33993ebd5561` |
| `halo_farola.png` | `c0bf412e45f1cbc37552be834af25d9690afeab3751153d18803a4819d29c147` |
| `luz_suelo_farola.png` | `56bd3ea3bcdc7bcf6628a2bddd9ed165d14881c4f20ca06e222b246586dc9894` |
| `puerta_cerrada.png` | `c59d8f84f2a476ceb96760f35500ae321c29d6dea925017ebe26acdb18052ae8` |
| `puerta_forzada.png` | `88bd6c6d1fd935efae49573c03ffbf153f3972c434361ce8f99f00da5458e66d` |
| `valla_intacta.png` | `f41fe93af7720bb9cdc94d2f5c8fdf6ba9ac84bfd9028e28fecf87a173cf9dfc` |
| `valla_saltada.png` | `608b40796f48f552fcd67ddb83ce3307ebd60f5fbe80b1dfc74bdcdba39de1c3` |
