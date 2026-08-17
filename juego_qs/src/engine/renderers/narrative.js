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
