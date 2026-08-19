// Renderer genérico para escenas narrativas: point_click, decision, single_roll.
// Las tres comparten el mismo motor de interacciones (sceneEngine.js); solo
// cambia qué controles se dibujan. Ninguna escena concreta se nombra aquí.
import { cargarEscena, buscarInteraccion, ejecutarInteraccion } from "../sceneEngine.js";
import { rutaAsset } from "../moduleLoader.js";

export async function montarNarrativa(container, escenaId) {
  const escena = await cargarEscena(escenaId);
  const wrap = document.createElement("div");
  wrap.className = "narrativa";

  const fondoStyle = escena.background ? `background-image:url('${rutaAsset(escena.background)}')` : "";
  wrap.innerHTML = `
    <div class="narrativa-fondo" id="fondo" style="${fondoStyle}">
      <div class="hotspots" id="hotspots"></div>
    </div>
    <div class="narrativa-texto" id="texto"><em>${escena.introText || ""}</em></div>
    <div id="controles"></div>
  `;
  container.appendChild(wrap);

  const texto = wrap.querySelector("#texto");
  const hotspotsEl = wrap.querySelector("#hotspots");
  const controlesEl = wrap.querySelector("#controles");

  function onTexto(t) { texto.innerHTML = `<em>${t}</em>`; }

  const local = { verbo: escena.verbs?.[0] || null };

  function disparar(trigger) {
    const interaccion = buscarInteraccion(escena, trigger);
    if (!interaccion) {
      onTexto(escena.defaultText || "No parece que puedas hacer eso ahí.");
      return;
    }
    ejecutarInteraccion({ escenaId, escena, interaccion, onTexto });
  }

  // Tap directo (móvil): capacidad táctil real, nunca solo user-agent —
  // mismo criterio que src/engine/renderers/raycast.js. En escritorio el
  // flujo de verbos (botón -> zona) sigue intacto y sin cambios.
  const esTactil = (navigator.maxTouchPoints || 0) > 0 || "ontouchstart" in window;

  // De todos los verbos declarados por la escena, ¿cuáles tienen de verdad
  // una interacción válida (respetando flags) para esta zona ahora mismo?
  // Así un tap puede resolver la acción sin obligar a elegir MIRAR primero.
  function verbosDisponiblesPara(zoneId) {
    return (escena.verbs || []).filter(v => buscarInteraccion(escena, { verb: v, zone: zoneId }));
  }

  function menuContextual(hs, zoneId, verbos) {
    const previo = wrap.querySelector(".hotspot-menu");
    if (previo) previo.remove();
    const menu = document.createElement("div");
    menu.className = "hotspot-menu";
    menu.style.cssText = `left:${hs.style.left};top:calc(${hs.style.top} + ${hs.style.height});`;
    verbos.forEach(v => {
      const btn = document.createElement("button");
      btn.className = "hotspot-menu-opcion";
      btn.textContent = v;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        menu.remove();
        disparar({ verb: v, zone: zoneId });
      });
      menu.appendChild(btn);
    });
    hotspotsEl.appendChild(menu);
    const cerrar = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener("click", cerrar); } };
    setTimeout(() => document.addEventListener("click", cerrar), 0);
  }

  if (escena.type === "point_click") {
    controlesEl.className = "acciones-bar";
    (escena.verbs || []).forEach(v => {
      const btn = document.createElement("button");
      btn.className = "btn-accion" + (v === local.verbo ? " destacado" : "");
      btn.textContent = v;
      btn.addEventListener("click", () => {
        local.verbo = v;
        controlesEl.querySelectorAll(".btn-accion").forEach(b => b.classList.remove("destacado"));
        btn.classList.add("destacado");
      });
      controlesEl.appendChild(btn);
    });

    (escena.zones || []).forEach(z => {
      const [x, y, w, h] = z.rect;
      const hs = document.createElement("div");
      hs.className = "hotspot";
      hs.style.cssText = `left:${x}%;top:${y}%;width:${w}%;height:${h}%`;
      hs.textContent = z.label;
      hs.addEventListener("click", () => {
        if (esTactil) {
          const verbos = verbosDisponiblesPara(z.id);
          if (verbos.length === 0) return disparar({ verb: local.verbo || escena.verbs?.[0], zone: z.id });
          if (verbos.length === 1) return disparar({ verb: verbos[0], zone: z.id });
          return menuContextual(hs, z.id, verbos);
        }
        if (!local.verbo) return;
        disparar({ verb: local.verbo, zone: z.id });
      });
      hotspotsEl.appendChild(hs);
    });
  } else if (escena.type === "decision") {
    controlesEl.className = "decision-bar";
    (escena.choices || []).forEach(c => {
      const btn = document.createElement("button");
      btn.className = "btn-decision";
      btn.textContent = c.label;
      btn.addEventListener("click", () => disparar({ choice: c.id }));
      controlesEl.appendChild(btn);
    });
  } else if (escena.type === "single_roll") {
    controlesEl.className = "acciones-bar";
    (escena.actions || []).forEach(a => {
      const btn = document.createElement("button");
      btn.className = "btn-accion destacado";
      btn.textContent = a.label;
      btn.addEventListener("click", () => {
        btn.disabled = true;
        disparar({ action: a.id });
      });
      controlesEl.appendChild(btn);
    });
  }
}
