---
name: Consola de Mando Táctico
version: 1.0.0
updated: 2026-08-29
north_star: Una consola militar de campo, sobria y legible, donde la ficción ocupa el centro y la interfaz se comporta como instrumentación.
tokens:
  color_shell: "#080d10"
  color_metal: "#11191e"
  color_metal_high: "#18242b"
  color_line: "#30404a"
  color_info: "#6f93a8"
  color_selection: "#c9a227"
  color_danger: "#b3323c"
  color_text: "#e6e6e6"
  radius: 5px
  shadow: "0 12px 32px rgba(0, 0, 0, .42)"
---

# Overview

La interfaz de *La Senda de los Errantes* es una consola narrativa y táctica de carbón, metal envejecido y luz instrumental. La escena —ilustración, conversación o tablero— domina siempre. La cabecera identifica módulo y situación; la ficha y los controles aportan contexto sin competir con la ficción.

La referencia es una terminal militar nocturna, no una aplicación SaaS ni un panel de neón. El cian comunica información operativa, el amarillo marca decisiones y el rojo queda reservado para peligro o daño.

# Colors

La base compartida usa `#080d10` para el fondo, `#11191e` y `#18242b` para superficies, `#30404a` para divisores, `#e6e6e6` para texto y `#8b93a1` para texto secundario. Los acentos son `#6f93a8` informativo, `#c9a227` selección y `#b3323c` peligro; sobre fondos oscuros el texto de peligro usa `#e16f77` para conservar contraste.

El módulo Predator desplaza los acentos a cian frío `#65b7c7`, ámbar `#d79a35`, rojo `#b84b47` y hueso `#e3ded2`. Estos valores son una variante temática, no una paleta independiente.

# Typography

La familia de interfaz es **Barlow Condensed**, servida localmente en pesos 500 y 600. Los títulos, etiquetas y controles usan mayúsculas, peso 600 y espaciado de letras moderado; el texto narrativo conserva caja natural y más aire. Ninguna pantalla depende de una fuente remota.

# Layout

El armazón ocupa `100dvh`: cabecera global de 54 px y área de juego flexible con 12 px de margen. En móvil la cabecera baja a 48 px y el margen a 6 px. Con ficha visible, escritorio reparte aproximadamente 76/24 entre escena y ficha; sin contenido, la escena recupera todo el ancho. En móvil la ficha se apila debajo de la escena con una relación aproximada 65/35.

La primera vista debe enseñar identidad, contexto y una porción útil de la escena. Evitar introducciones vacías o grandes bloques administrativos antes del juego.

# Elevation & Depth

La profundidad procede de bordes finos, cambios discretos de metal y una única sombra exterior `0 12px 32px rgba(0, 0, 0, .42)`. No usar cristal esmerilado ni sombras luminosas. La transición de escena dura 220 ms con salida rápida y conserva la imagen parcialmente visible mientras carga.

# Shapes

El radio estándar es 5 px. Las esquinas pequeñas y los cortes diagonales sugieren equipo industrial; los círculos se reservan para marcadores, estados y puntos épicos. Espaciado base: 6, 12, 18 y 24 px. Todo control interactivo táctil debe alcanzar al menos 44×44 px.

# Components

- **Cabecera global:** marca a la izquierda; módulo y escena a la derecha. Es compacta, persistente y nunca tapa la acción.
- **Botón de menú:** superficie metálica alta, borde de línea, texto hueso y realce informativo al pasar o enfocar.
- **Ficha compacta:** muestra retrato/identidad, salud y puntos épicos; se expande bajo demanda mediante un botón cuadrado con chevrón SVG.
- **Dotación de grupo:** se abre desde la ficha compacta o completa como una estación logística protegida. El retrato estable ocupa el centro; protección, arma principal, cuerpo a cuerpo y equipo en uso aparecen en ranuras alrededor, mientras la mochila queda separada. Seleccionar una instancia revela Equipar, Guardar, Usar y transferencia directa a compañeros. Las ranuras reflejan el equipamiento real declarado por el módulo y nunca deducen reglas desde el texto visible.
- **HUD narrativo:** fondo inmóvil a viewport completo; texto y acciones comparten una capa inferior superpuesta con degradado oscuro. Cambiar una frase o una opción nunca redimensiona ni sustituye visualmente la escena.
- **Consola táctica:** retrato y recursos del actor activo arriba a la izquierda; tres familias persistentes (Ofensivas, Tácticas, Defensivas) en un muelle inferior centrado; las órdenes aparecen en una bandeja inmediata sobre el muelle. El selector de control es una consola previa y no un rótulo dibujado dentro del tablero.
- **Recursos por módulo:** retratos, sprites de actores y variantes del avatar panorámico se declaran en el JSON del módulo/encuentro. El motor aporta estructura y fallback, pero nunca nombres ni rutas específicas de un módulo.
- **Marcadores épicos:** puntos dibujados con CSS, llenos o vacíos; no dependen de caracteres Unicode.
- **Acciones tácticas:** jerarquía por estado y significado, no por una colección de tarjetas idénticas. El foco de teclado siempre es visible.

# Do’s and Don’ts

Sí: dejar respirar la escena; usar cian como lectura instrumental; reservar ámbar para selección; emplear SVG o geometría CSS para iconos; mantener estados de foco, contraste y objetivos táctiles; hacer que módulo y escena actualicen la cabecera.

No: convertir cada dato en una tarjeta; inundar la pantalla de cian brillante; mezclar radios blandos con el lenguaje industrial; usar emoji o glifos de fuente como iconos; cargar tipografías externas; animar propiedades de layout como `width`; ocultar el fondo narrativo mientras cambia la escena.
