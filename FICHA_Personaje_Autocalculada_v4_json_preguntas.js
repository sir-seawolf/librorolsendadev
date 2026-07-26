const STEP_TITLES = [
  "1) Tipo + Datos base","2) Atributos","3) Profesiones","4) Habilidades",
  "5) Méritos/Defectos","6) Equipo y dinero","7) Resumen","8) Ficha final v3"
];

const PROFESIONES = ["Combatiente","Civil","Científico","Especialista Técnico","Iniciado","Ninguna"];
const TYPE_CFG = {
  "Héroe": {prim:40, sec:35, pg:10, pe:1},
  "Madera de Héroe": {prim:35, sec:30, pg:20, pe:3},
  "Predestinado": {prim:30, sec:25, pg:30, pe:9}
};
const ATTRS = ["Ca","A","P","C","I","F","V","H"];

const RAZAS = {
  "Humano": { mod:{}, voc:null, maxAttr:50, profSlots:3 },
  "Nakel": { mod:{}, voc:"Especialista Técnico", maxAttr:50, profSlots:2 },
  "Inukel": { mod:{Ca:5,I:-5}, voc:"Especialista Técnico", maxAttr:50, profSlots:2 },
  "Kawalapiti": { mod:{C:10,V:5,Ca:-10,A:-5}, voc:null, maxAttr:50, profSlots:2 },
  "Chernos": { mod:{C:10,P:5,Ca:-10,F:-5}, voc:null, maxAttr:50, profSlots:2 },
  "Mujer Gato": { mod:{A:10,Ca:5}, voc:"Civil", maxAttr:50, profSlots:2 },
  "Hombre Gato": { mod:{F:10,C:10,I:-10}, voc:"Combatiente", maxAttr:50, profSlots:2 }
};

const SKILLS = {
  academicas:["Ciencias","Biotecnología","Navegación","Burocracia","Investigación","Diagnóstico"],
  tecnologicas:["Armería","Electrónica","Mecánica","Seguridad","Pilotar","Sigilo"],
  atleticas:["Acrobacias","Resistir","Proezas"],
  sociales:["Empatía","Liderazgo","Persuasión","Interrogatorio","Seducción"],
  combate:["Iniciativa","Alerta","Esquivar","Distancia","Sin Armas","Arma CC"],
  distorsion:["Detección de Distorsión","Manipulación de Distorsión","Camino de los Portales","Tatuador Rúnico","Herrero Rúnico","Proyección de Energía","Protección de Energía","Invocación de Energía"]
};

const SKILL_BASE_FORMULA = {
  academicas: () => round((attr("I")+attr("V"))/2),
  tecnologicas: () => round((attr("H")+attr("P"))/2),
  atleticas: () => round((attr("A")+attr("F"))/2),
  sociales: () => round((attr("Ca")+attr("P"))/2),
  // Combate no tiene base única de rama: cada habilidad su propia fórmula (Anexo Méritos/Habilidades).
  combate: [
    () => round((attr("A")+attr("P"))/2),            // Iniciativa
    () => round((attr("P")+attr("I"))/2),            // Alerta
    () => round((attr("A")+attr("H"))/2),            // Esquivar
    () => round((attr("A")+attr("H"))/2),            // Distancia
    () => round((attr("F")+attr("C")+attr("A"))/3),  // Sin Armas
    () => round((attr("F")+attr("A")+attr("H"))/3)   // Arma CC
  ],
  // Distorsión arranca a 0, sin base calculada (Anexo): no se promedia con atributos.
  distorsion: () => 0
};

const POOL_SOURCE = {
  Combatiente:{combate:15, atleticas:10, tecnologicas:5},
  Civil:{academicas:15, sociales:10, atleticas:5},
  "Científico":{academicas:15, tecnologicas:10, sociales:5},
  "Especialista Técnico":{tecnologicas:15, sociales:10, academicas:5},
  Iniciado:{distorsion:15, academicas:10, tecnologicas:5}
};

const ECON_CFG = {
  Combatiente:{income:4000, kit1:"Casco + chaleco (Bld 1) + arma básica", kit2:"Armadura superior o arma modificada / vehículo ligero"},
  Civil:{income:10000, kit1:"Ropa de calidad + vehículo pequeño", kit2:"Vehículo de gama o propiedad + contactos"},
  "Científico":{income:6000, kit1:"Traje especialista + herramientas + escáner", kit2:"Laboratorio de campo o acceso a datos"},
  "Especialista Técnico":{income:6000, kit1:"Traje + escáner + kit herramientas", kit2:"Dron/droide auxiliar o taller portátil"},
  Iniciado:{income:3000, kit1:"Traje Iniciado + acumulador rúnico", kit2:"Focos extra + perlas + 1 runa básica"}
};

const RUNAS_BASICAS = ["Ímpetu","Filo","Resistencia","Luz","Alerta","Paso Ligero","Ancla","Velo","Pulso"];

const MERITOS = [
  {n:"Característica mejorada", pe:2},
  {n:"Habilidad mejorada", pe:2},
  {n:"Ahorros", pe:1},
  {n:"Contactos", pe:1}
];
const DEFECTOS = [
  {n:"Característica empeorada", pe:2},
  {n:"Deudas", pe:1},
  {n:"Enemigo", pe:1},
  {n:"Analfabetismo", pe:2}
];

let state = {
  step:1,
  dirtyFrom:null,
  pools:{},
  selectedMer:[],
  selectedDef:[],
  runes:[],
  effectiveProfs:[]
};

const qs = s => document.querySelector(s);
const qsa = s => [...document.querySelectorAll(s)];
const round = x => Math.round(x);

function attr(a){ return parseInt(qs(`#at-${a}`)?.value || "0", 10) || 0; }
function cfg(){ return TYPE_CFG[qs('#tipoPersonaje').value] || TYPE_CFG["Predestinado"]; }
function razaCfg(){ return RAZAS[qs('#raza')?.value || "Humano"] || RAZAS["Humano"]; }
function ntOrigen(){ return parseInt(qs('#ntOrigen')?.value || '5',10); }
function ntBonus(){ const n = ntOrigen(); return n <= 5 ? (6 - n) * 5 : 0; }
function ntTechCap(visionario){
  const n = ntOrigen();
  return (visionario ? n + 3 : n + 2);
}

function buildRazaSelect(){
  const r = qs('#raza');
  if(!r) return;
  r.innerHTML = Object.keys(RAZAS).map(x=>`<option>${x}</option>`).join('');
  r.value = "Humano";
  r.addEventListener('change', ()=>{ applyProfSlotUI(); recalcAttr(); rebuildPools(); rebuildEconomy(); markDirty(1); updateStepStatus(); });
}

function buildStepsMenu(){
  const m = qs('#stepsMenu');
  m.innerHTML = STEP_TITLES.map((t,i)=>`<button class="step-btn" data-step="${i+1}" onclick="goStep(${i+1})">${t}</button>`).join('');
  paintStepMenu();
  updateStepStatus();
}
function paintStepMenu(){
  qsa('.step-btn').forEach(btn=>{
    const s = parseInt(btn.dataset.step,10);
    btn.classList.toggle('active', s===state.step);
    btn.classList.toggle('dirty', !!state.dirtyFrom && s>state.dirtyFrom);
  });
}
function setStepBadge(step, type){
  const btn = qs(`.step-btn[data-step="${step}"]`);
  if(!btn) return;
  const label = STEP_TITLES[step-1];
  if(type==="ok"){ btn.style.borderColor="#15803d"; btn.style.background="#dcfce7"; btn.textContent="✅ "+label; }
  else if(type==="err"){ btn.style.borderColor="#b91c1c"; btn.style.background="#fee2e2"; btn.textContent="❌ "+label; }
  else { btn.style.borderColor="#b45309"; btn.style.background="#ffedd5"; btn.textContent="🟧 "+label; }
}
function updateStepStatus(){
  setStepBadge(1, (!!qs('#tipoPersonaje').value && !!qs('#grupoPrimario').value && !!qs('#raza').value) ? "ok":"pend");
  const pgRest = parseInt(qs('#pgRest').textContent || "0",10);
  setStepBadge(2, pgRest < 0 ? "err" : (pgRest===0 ? "ok":"pend"));
  setStepBadge(3, effectiveProfs().length>=2 ? "ok":"pend");
  const usage = poolUsage();
  let overflow = false;
  Object.entries(usage).forEach(([r,u])=>{ if(u > (state.pools[r]||0)) overflow = true; });
  setStepBadge(4, overflow ? "err" : "ok");
  const peTxt = qs('#peSummary').textContent || "";
  const peFinal = parseInt((peTxt.match(/final\s+(-?\d+)/)||[])[1]||"0",10);
  setStepBadge(5, peFinal < 0 ? "err":"ok");
  setStepBadge(6, (qs('#dineroFinal').value || '').trim() ? "ok":"pend");
  setStepBadge(7, "ok");
  setStepBadge(8, qs('#finalV3Frame') ? "ok":"pend");
}
function goStep(s){
  state.step = Math.max(1,Math.min(8,s));
  qsa('.step').forEach(el=>el.classList.toggle('active', parseInt(el.dataset.step,10)===state.step));
  paintStepMenu();
}
function nextStep(){ goStep(state.step+1); }
function prevStep(){ goStep(state.step-1); }
window.goStep=goStep; window.nextStep=nextStep; window.prevStep=prevStep;

function markDirty(from){
  state.dirtyFrom = state.dirtyFrom ? Math.min(state.dirtyFrom, from) : from;
  paintStepMenu();
}

function rebuildAttrTable(){
  const body = qs('#attrsBody');
  body.innerHTML = '';
  ATTRS.forEach(a=>{
    body.innerHTML += `<tr><td>${a}</td><td><input type="number" id="ab-${a}" value="0" readonly></td><td><input type="number" id="af-${a}" value="0" step="5"></td><td><input type="number" id="ap-${a}" value="0" step="5"></td><td><input type="number" id="at-${a}" value="0" readonly></td></tr>`;
  });
  qsa('#attrsBody input[id^="af-"], #attrsBody input[id^="ap-"]').forEach(el=>{
    el.addEventListener('input', ()=>{ normalizeAttrInput(el); enforcePgLimits(); recalcAttr(); recalcSkillBases(); markDirty(2); updateStepStatus(); });
  });
  recalcAttr();
}
function normalize5(v){ const n = parseInt(v || '0', 10) || 0; return Math.round(n / 5) * 5; }
function floor5(v){ const n = parseInt(v || '0', 10) || 0; return Math.floor(n / 5) * 5; }
function normalizeAttrInput(el){ el.value = normalize5(el.value); }
function recalcType(){
  const c = cfg();
  qs('#primarioVal').textContent = c.prim;
  qs('#secundarioVal').textContent = c.sec;
  qs('#pgTotal').textContent = c.pg;
}
function currentPgSpent(){
  let spent=0; ATTRS.forEach(a=>{ const ap = parseInt(qs(`#ap-${a}`).value||'0',10)||0; spent += Math.max(0, ap/5); }); return spent;
}
function enforcePgLimits(){
  const c = cfg();
  let spent = 0;
  ATTRS.forEach(a=>{
    const apEl = qs(`#ap-${a}`);
    let ap = normalize5(apEl.value);
    if(ap < 0) ap = 0;
    const cost = ap/5;
    if(spent + cost > c.pg){ ap = Math.max(0, c.pg - spent) * 5; }
    apEl.value = ap;
    spent += ap/5;
  });
}
function recalcAttr(){
  recalcType();
  const c=cfg();
  const rCfg = razaCfg();
  const prim = qs('#grupoPrimario').value==="Físicos" ? ["A","C","F","H"] : ["Ca","I","P","V"];
  const ntB = ntBonus();
  const ntTarget = qs('#ntTargetAttr')?.value || 'H';
  ATTRS.forEach(a=>qs(`#ab-${a}`).value = prim.includes(a)?c.prim:c.sec);
  ATTRS.forEach(a=>{
    const af = normalize5(qs(`#af-${a}`).value);
    const ap = normalize5(qs(`#ap-${a}`).value);
    const racial = rCfg.mod[a] || 0;
    const ntAdd = (a === ntTarget) ? ntB : 0;
    const raw = (parseInt(qs(`#ab-${a}`).value,10)||0)+af+ap+racial+ntAdd;
    qs(`#af-${a}`).value = af; qs(`#ap-${a}`).value = ap; qs(`#at-${a}`).value = Math.min(rCfg.maxAttr, raw);
  });
  qs('#pgRest').textContent = (c.pg - currentPgSpent());
  const special = qs('#specialMerDef')?.value || '';
  const techCap = ntTechCap(special==="Visionario");
  qs('#resTipo').innerHTML = `<b>Tipo:</b> ${qs('#tipoPersonaje').value} · Prim ${c.prim} / Sec ${c.sec} / PG ${c.pg} / PE ${c.pe}<br><b>Raza:</b> ${qs('#raza').value}<br><b>NT origen:</b> ${ntOrigen()} · <b>Bono NT:</b> +${ntB} a ${ntTarget} · <b>Techo tecnológico personal:</b> NT${techCap}`;
}

function applyProfSlotUI(){
  const slots = razaCfg().profSlots || 3;
  const p3 = qs('#prof3');
  if(!p3) return;
  p3.disabled = slots < 3;
  if(slots < 3) p3.value = "Ninguna";
}
function buildProfSelects(){
  ['#prof1','#prof2','#prof3'].forEach(id=>{
    qs(id).innerHTML = PROFESIONES.map(p=>`<option>${p}</option>`).join('');
    qs(id).addEventListener('change', ()=>{ rebuildPools(); rebuildEconomy(); recalcSkillBases(); renderRunes(); markDirty(3); updateStepStatus(); });
  });
  applyProfSlotUI();
}
function profs(){
  const rc = razaCfg();
  const slots = rc.profSlots || 3;
  const all = [qs('#prof1').value,qs('#prof2').value,qs('#prof3').value];
  return all.map((v,i)=> (i<slots ? v : "Ninguna")).filter(v=>v && v!=="Ninguna");
}
function effectiveProfs(){
  const base = profs();
  const rc = razaCfg();
  const out = [...base];
  if(rc.voc && base.includes(rc.voc)) out.push(rc.voc);
  state.effectiveProfs = out;
  return out;
}
function rebuildPools(){
  const p = {};
  effectiveProfs().forEach(pr=>{
    const src = POOL_SOURCE[pr]||{};
    Object.entries(src).forEach(([k,v])=> p[k]=(p[k]||0)+v);
  });
  state.pools = p;
  paintPoolChipsWithUsage();
  calcSkills();
  const rc = razaCfg();
  qs('#profSummary').innerHTML = `<b>Profesiones:</b> ${profs().join(', ') || '—'}<br><b>Efectivas:</b> ${effectiveProfs().join(', ') || '—'}<br><b>Bolsas:</b> ${Object.entries(p).map(([k,v])=>`${k}:${v}`).join(' · ') || '—'}`;
  qs('#vocSummary').innerHTML = `<b>Vocación racial:</b> ${rc.voc || 'Sin vocación'} ${rc.voc && profs().includes(rc.voc) ? ' (activada +1 toma)' : ''}`;
}

function buildSkills(){
  const wrap = qs('#skillsWrap');
  wrap.innerHTML = '';
  Object.entries(SKILLS).forEach(([rk,list])=>{
    const id = `tb-${rk}`;
    wrap.innerHTML += `<div class="box"><h3>${rk}</h3><table><thead><tr><th>Hab</th><th>Base</th><th>Apr (+5)</th><th>Mod</th><th>Tot</th></tr></thead><tbody id="${id}"></tbody></table></div>`;
    const tb = qs('#'+id);
    list.forEach((h,i)=>{
      tb.innerHTML += `<tr><td>${h}</td><td><input type="number" class="sk-base" data-r="${rk}" data-i="${i}" value="0" readonly></td><td><input type="number" class="sk-apr" data-r="${rk}" data-i="${i}" value="0" step="5"></td><td><input type="number" class="sk-mod" data-r="${rk}" data-i="${i}" value="0"></td><td><input type="number" class="sk-tot" data-r="${rk}" data-i="${i}" value="0" readonly></td></tr>`;
    });
  });
  qsa('.sk-apr,.sk-mod').forEach(el=>el.addEventListener('input', ()=>{ calcSkills(); markDirty(4); updateStepStatus(); }));
  fillTargets();
  recalcSkillBases();
  calcSkills();
}
function recalcSkillBases(){
  Object.keys(SKILLS).forEach(r=>{
    const f = SKILL_BASE_FORMULA[r];
    if(Array.isArray(f)){
      // Combate: una fórmula distinta por habilidad, en el mismo orden que SKILLS[r]
      SKILLS[r].forEach((h,i)=>{
        const base = f[i] ? f[i]() : 0;
        qsa(`.sk-base[data-r="${r}"][data-i="${i}"]`).forEach(el=>{ el.value = base; });
      });
    } else {
      const base = f();
      qsa(`.sk-base[data-r="${r}"]`).forEach(el=>{ el.value = base; });
    }
  });
  calcSkills();
}
function poolUsage(){
  const used = {};
  Object.keys(SKILLS).forEach(r=>{ used[r]=qsa(`.sk-apr[data-r="${r}"]`).reduce((a,el)=>a+(parseInt(el.value||'0',10)||0),0); });
  return used;
}
function paintPoolChipsWithUsage(){
  const used = poolUsage();
  const html = Object.entries(state.pools).map(([k,v])=>`<span class="chip">${k}: ${used[k]||0}/${v} (resto ${v-(used[k]||0)})</span>`).join('');
  qs('#poolChips').innerHTML = html || '<span class="muted">Sin bolsas aún.</span>';
}
function calcSkills(){
  Object.keys(SKILLS).forEach(r=>{
    const lim = state.pools[r]||0;
    let used = 0;
    qsa(`.sk-apr[data-r="${r}"]`).forEach(el=>{
      let v = floor5(el.value);
      if(v < 0) v = 0;
      if(used + v > lim){
        const remain = Math.max(0, lim - used);
        v = floor5(remain);
      }
      el.value = v;
      used += v;
    });
  });
  qsa('.sk-mod').forEach(el=>{ const n = parseInt(el.value || "0", 10) || 0; el.value = Math.max(0, n); });
  const hm = qs('#humanMode')?.value || 'none';
  const hs1 = qs('#humanSkill1')?.value || '';
  const hs2 = qs('#humanSkill2')?.value || '';
  qsa('.sk-tot').forEach(t=>{
    const r=t.dataset.r, i=t.dataset.i;
    const b=parseInt(qs(`.sk-base[data-r="${r}"][data-i="${i}"]`).value||'0',10)||0;
    const a=parseInt(qs(`.sk-apr[data-r="${r}"][data-i="${i}"]`).value||'0',10)||0;
    const m=parseInt(qs(`.sk-mod[data-r="${r}"][data-i="${i}"]`).value||'0',10)||0;
    const skillName = SKILLS[r][parseInt(i,10)];
    const key = `${r}:${skillName}`;
    let humBonus = 0;
    if((qs('#raza')?.value||'Humano') === 'Humano'){
      if(hm === 'single10' && key === hs1) humBonus = 10;
      if(hm === 'double5' && (key === hs1 || key === hs2)) humBonus = 5;
    }
    t.value=Math.max(0,Math.min(90,b+a+m+humBonus));
  });
  paintPoolChipsWithUsage();
}

function initiatedTakes(){ return effectiveProfs().filter(p=>p==="Iniciado").length; }
function maxRuneLevel(){ const n = initiatedTakes(); if(n<=0) return 0; if(n<=2) return 2; return 3; }
function renderRunes(){
  const rw = qs('#runeWrap');
  if(!rw) return;
  const maxSlots = initiatedTakes() * 3;
  if(maxSlots<=0){ rw.innerHTML = '<span class="muted">Sin tomas de Iniciado.</span>'; state.runes = []; return; }
  while(state.runes.length < maxSlots) state.runes.push({name:RUNAS_BASICAS[0], level:1});
  if(state.runes.length > maxSlots) state.runes = state.runes.slice(0,maxSlots);
  const lvlMax = maxRuneLevel();
  rw.innerHTML = state.runes.map((r,i)=>`<div class="box" style="min-width:220px"><label>Runa ${i+1}<select data-rune-name="${i}">${RUNAS_BASICAS.map(n=>`<option ${n===r.name?'selected':''}>${n}</option>`).join('')}</select></label><label>Nivel<select data-rune-level="${i}">${[1,2,3].map(l=>`<option value="${l}" ${l===r.level?'selected':''} ${l>lvlMax?'disabled':''}>${l}</option>`).join('')}</select></label></div>`).join('');
  qsa('[data-rune-name]').forEach(el=>el.addEventListener('change', ()=>{ const i=parseInt(el.getAttribute('data-rune-name'),10); state.runes[i].name=el.value; buildFullSummary(); }));
  qsa('[data-rune-level]').forEach(el=>el.addEventListener('change', ()=>{ const i=parseInt(el.getAttribute('data-rune-level'),10); state.runes[i].level=Math.min(maxRuneLevel(), parseInt(el.value,10)); renderRunes(); buildFullSummary(); }));
}

function buildMerDef(){
  qs('#meritosBox').innerHTML = MERITOS.map(x=>`<label><input type="checkbox" class="mer" value="${x.n}"> ${x.n} (PE ${x.pe})</label><br>`).join('');
  qs('#defectosBox').innerHTML = DEFECTOS.map(x=>`<label><input type="checkbox" class="def" value="${x.n}"> ${x.n} (+PE ${x.pe})</label><br>`).join('');
  qsa('.mer,.def').forEach(el=>el.addEventListener('change', ()=>{ applyMerDefEffects(); markDirty(5); updateStepStatus(); }));
  qs('#targetCar').addEventListener('change', ()=>{ applyMerDefEffects(); updateStepStatus(); });
  qs('#targetHab').addEventListener('change', ()=>{ applyMerDefEffects(); updateStepStatus(); });
  fillTargets(); applyMerDefEffects();
}
function fillTargets(){
  qs('#targetCar').innerHTML = ATTRS.map(a=>`<option>${a}</option>`).join('');
  const allSkills = Object.entries(SKILLS).flatMap(([r,l])=>l.map(h=>`${r}:${h}`));
  const opts = allSkills.map(s=>`<option>${s}</option>`).join('');
  qs('#targetHab').innerHTML = opts;
  if(qs('#humanSkill1')) qs('#humanSkill1').innerHTML = `<option value="">—</option>${opts}`;
  if(qs('#humanSkill2')) qs('#humanSkill2').innerHTML = `<option value="">—</option>${opts}`;
}
function applyMerDefEffects(){
  const selectedMer = qsa('.mer:checked').map(x=>x.value);
  const selectedDef = qsa('.def:checked').map(x=>x.value);
  state.selectedMer = selectedMer; state.selectedDef = selectedDef;
  const peBase = cfg().pe;
  const special = qs('#specialMerDef')?.value || '';
  const peSpecial = special ? 3 : 0;
  const peGast = selectedMer.reduce((a,n)=>a+(MERITOS.find(x=>x.n===n)?.pe||0),0) + peSpecial;
  const peRecRaw = selectedDef.reduce((a,n)=>a+(DEFECTOS.find(x=>x.n===n)?.pe||0),0);
  const capByType = {"Héroe":3,"Madera de Héroe":6,"Predestinado":0};
  const maxRec = capByType[qs('#tipoPersonaje').value] ?? 0;
  const peRec = Math.min(peRecRaw, maxRec);
  qs('#peSummary').textContent = `PE base ${peBase} · gastado ${peGast} · recuperado ${peRec}/${maxRec} · final ${peBase-peGast+peRec}`;
}

function rebuildEconomy(){
  const eff = effectiveProfs();
  const counts = {};
  eff.forEach(x=>counts[x]=(counts[x]||0)+1);
  const unique = Object.keys(counts);
  let money = 0;
  const lines = [];
  unique.forEach(p=>{
    const c = ECON_CFG[p];
    if(!c) return;
    money += c.income;
    lines.push(`${p} ${counts[p]}x: ${c.kit1}${counts[p]>=2 ? ` + SALTO 2x (${c.kit2})` : ''}`);
  });
  const intBonus = attr("I") * 100;
  const savings = qsa('.mer:checked').some(x=>x.value==="Ahorros") ? 10000 : 0;
  const total = money + intBonus + savings;
  qs('#equipoInicial').value = lines.join('\n');
  qs('#dineroFinal').value = `${total} PC`;
  qs('#ecoSummary').innerHTML = `<b>Ingreso por categorías distintas:</b> ${money} PC<br><b>Bono INT:</b> ${intBonus} PC<br><b>Ahorros:</b> ${savings} PC<br><b>Total:</b> ${total} PC`;
  buildFullSummary(); updateStepStatus();
}
window.rebuildEconomy = rebuildEconomy;

function renderFinalSheetV3(){
  const attrs = ATTRS.map(a=>`${a}: ${attr(a)}`).join(' · ');
  const runTxt = state.runes.length ? state.runes.map(r=>`${r.name} N${r.level}`).join(', ') : '—';
  qs('#finalSheetV3').innerHTML = `<h3 style="margin-top:0">Resumen para ficha v3</h3><div class="box"><div><b>Personaje:</b> ${qs('#personaje').value || '—'} · <b>Jugador:</b> ${qs('#jugador').value || '—'}</div><div><b>Tipo:</b> ${qs('#tipoPersonaje').value} · <b>Grupo:</b> ${qs('#grupoPrimario').value} · <b>Raza:</b> ${qs('#raza').value}</div><div><b>Atributos:</b> ${attrs}</div><div><b>Profesiones efectivas:</b> ${effectiveProfs().join(', ') || '—'}</div><div><b>Runas:</b> ${runTxt}</div><div><b>Dinero:</b> ${qs('#dineroFinal').value || '—'}</div></div>`;
  tryFillV3Iframe();
}
function tryFillV3Iframe(){
  const frame = qs('#finalV3Frame');
  if(!frame) return;
  const fill = ()=>{
    try{
      const doc = frame.contentDocument || frame.contentWindow.document;
      if(!doc) return;
      const setVal = (id,v)=>{ const e=doc.getElementById(id); if(e) e.value=v; };
      setVal('jugador', qs('#jugador').value || '');
      setVal('personaje', qs('#personaje').value || '');
      setVal('corporacion', qs('#corporacion').value || '');
      setVal('naturaleza', qs('#naturaleza').value || '');
      setVal('nt', qs('#nt').value || '');
      setVal('Ca_b', attr('Ca')); setVal('A_b', attr('A')); setVal('P_b', attr('P')); setVal('C_b', attr('C'));
      setVal('I_b', attr('I')); setVal('F_b', attr('F')); setVal('V_b', attr('V')); setVal('H_b', attr('H'));
      if(frame.contentWindow && typeof frame.contentWindow.calc === 'function') frame.contentWindow.calc();
    }catch(_e){}
  };
  if(frame.dataset.bound!=="1"){ frame.addEventListener('load', fill); frame.dataset.bound="1"; }
  fill();
}

function buildFullSummary(){
  const runTxt = state.runes.length ? state.runes.map(r=>`${r.name} N${r.level}`).join(', ') : '—';
  qs('#fullSummary').innerHTML = `<div><b>Tipo:</b> ${qs('#tipoPersonaje').value}</div><div><b>Raza:</b> ${qs('#raza').value}</div><div><b>Grupo primario:</b> ${qs('#grupoPrimario').value}</div><div><b>PG restante:</b> ${qs('#pgRest').textContent}</div><div><b>Profesiones efectivas:</b> ${effectiveProfs().join(',')||'—'}</div><div><b>Runas:</b> ${runTxt}</div><div><b>PE:</b> ${qs('#peSummary').textContent}</div><div><b>Dinero:</b> ${qs('#dineroFinal').value||'—'}</div>`;
  renderFinalSheetV3(); updateStepStatus();
}

function collectData(){
  const form={};
  qsa('input,select,textarea').forEach((el,i)=>{ const k=el.id||`${el.tagName}_${i}`; form[k]=(el.type==='checkbox')?el.checked:el.value; });
  return {version:4, state, form, exportedAt:new Date().toISOString()};
}
function applyData(d){
  if(!d||!d.form) return;
  qsa('input,select,textarea').forEach((el,i)=>{ const k=el.id||`${el.tagName}_${i}`; if(!(k in d.form)) return; if(el.type==='checkbox') el.checked=!!d.form[k]; else el.value=d.form[k]; });
  if(d.state) state = d.state;
  enforcePgLimits(); recalcAttr(); rebuildPools(); recalcSkillBases(); calcSkills(); renderRunes(); applyMerDefEffects(); rebuildEconomy(); buildFullSummary(); goStep(state.step||1); updateStepStatus();
}
function guardarJSON(){
  const blob = new Blob([JSON.stringify(collectData(),null,2)],{type:'application/json;charset=utf-8'});
  const a=document.createElement('a');
  const pj=(qs('#personaje').value||'personaje').replace(/[^a-z0-9áéíóúüñ_-]+/gi,'_');
  const url=URL.createObjectURL(blob); a.href=url; a.download=`Ficha_${pj}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function cargarJSON(ev){
  const f=ev.target.files&&ev.target.files[0]; if(!f) return;
  const fr=new FileReader();
  fr.onload=e=>{ try{ applyData(JSON.parse(e.target.result)); alert('JSON cargado.'); } catch{ alert('JSON inválido.'); } };
  fr.readAsText(f,'utf-8'); ev.target.value='';
}

function randomChoice(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function random5(min,max){ const vals=[]; for(let v=min; v<=max; v+=5) vals.push(v); return randomChoice(vals); }
function randomTypeData(){
  qs('#jugador').value = randomChoice(["Alex","Pascu","Nora","Izan","Vera"]);
  qs('#personaje').value = randomChoice(["Kova","Salim","Drago","Bishop","Reyes"]);
  qs('#corporacion').value = randomChoice(["Chafry","Primus","Mort","Workhouse"]);
  qs('#naturaleza').value = randomChoice(["Errante","Mercenario","Iniciado"]);
  qs('#nt').value = randomChoice(["NT1","NT2","NT3","NT4","NT5"]);
  qs('#tipoPersonaje').value = randomChoice(Object.keys(TYPE_CFG));
  qs('#grupoPrimario').value = randomChoice(["Físicos","Mentales"]);
  qs('#raza').value = randomChoice(Object.keys(RAZAS));
  recalcAttr();
}
function randomAttrs(){
  const c = cfg();
  let pg = c.pg;
  ATTRS.forEach(a=>{ qs(`#af-${a}`).value = random5(-5,5); qs(`#ap-${a}`).value = 0; });
  while(pg>0){ const a = randomChoice(ATTRS); qs(`#ap-${a}`).value = (parseInt(qs(`#ap-${a}`).value||"0",10)||0) + 5; pg -= 1; }
  enforcePgLimits(); recalcAttr();
}
function randomProfs(){
  qs('#prof1').value = randomChoice(PROFESIONES.filter(x=>x!=="Ninguna"));
  qs('#prof2').value = randomChoice(PROFESIONES.filter(x=>x!=="Ninguna"));
  qs('#prof3').value = randomChoice(PROFESIONES);
  rebuildPools(); renderRunes();
}
function randomSkills(){
  Object.keys(SKILLS).forEach(r=>{
    let lim = state.pools[r]||0;
    const aprEls = qsa(`.sk-apr[data-r="${r}"]`);
    aprEls.forEach(el=>el.value=0);
    while(lim>0){ const el = randomChoice(aprEls); el.value = (parseInt(el.value||"0",10)||0) + 5; lim -= 5; }
  });
  qsa('.sk-mod').forEach(el=>el.value = random5(0,10));
  calcSkills();
}
function randomMerDef(){
  qsa('.mer,.def').forEach(ch=>ch.checked=false);
  qsa('.mer').forEach(ch=>{ if(Math.random()<0.3) ch.checked=true; });
  qsa('.def').forEach(ch=>{ if(Math.random()<0.25) ch.checked=true; });
  applyMerDefEffects();
}
function randomEconomy(){ rebuildEconomy(); }
function randomFillAll(){
  randomTypeData(); randomAttrs(); randomProfs(); randomSkills(); randomMerDef(); randomEconomy();
  buildFullSummary(); updateStepStatus(); goStep(8);
}

window.guardarJSON=guardarJSON;
window.cargarJSON=cargarJSON;
window.randomFillAll=randomFillAll;
window.randomTypeData=randomTypeData;
window.randomAttrs=randomAttrs;
window.randomProfs=randomProfs;
window.randomSkills=randomSkills;
window.randomMerDef=randomMerDef;
window.randomEconomy=randomEconomy;

function init(){
  buildStepsMenu();
  goStep(1);
  buildRazaSelect();
  buildProfSelects();
  rebuildAttrTable();
  buildSkills();
  buildMerDef();

  enforcePgLimits();
  recalcAttr();
  rebuildPools();
  recalcSkillBases();
  calcSkills();
  renderRunes();
  rebuildEconomy();
  buildFullSummary();

  qs('#tipoPersonaje').addEventListener('change', ()=>{ enforcePgLimits(); recalcAttr(); recalcSkillBases(); applyMerDefEffects(); rebuildEconomy(); buildFullSummary(); markDirty(1); });
  qs('#grupoPrimario').addEventListener('change', ()=>{ recalcAttr(); recalcSkillBases(); rebuildEconomy(); buildFullSummary(); markDirty(2); });
  qs('#ntOrigen')?.addEventListener('change', ()=>{ recalcAttr(); recalcSkillBases(); rebuildEconomy(); buildFullSummary(); markDirty(1); });
  qs('#ntTargetAttr')?.addEventListener('change', ()=>{ recalcAttr(); recalcSkillBases(); rebuildEconomy(); buildFullSummary(); markDirty(1); });
  qs('#humanMode')?.addEventListener('change', ()=>{ calcSkills(); buildFullSummary(); markDirty(1); });
  qs('#humanSkill1')?.addEventListener('change', ()=>{ calcSkills(); buildFullSummary(); markDirty(1); });
  qs('#humanSkill2')?.addEventListener('change', ()=>{ calcSkills(); buildFullSummary(); markDirty(1); });
  qs('#specialMerDef')?.addEventListener('change', ()=>{ recalcAttr(); applyMerDefEffects(); rebuildEconomy(); buildFullSummary(); markDirty(5); });
}
document.addEventListener('DOMContentLoaded', init);
