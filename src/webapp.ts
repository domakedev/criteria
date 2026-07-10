/**
 * criteria — the app for a real person.
 *
 * Two things, in plain language:
 *   - Anotar: write down a decision you lived; it gets processed and saved.
 *   - Consultar: describe something you must decide; it answers from YOUR own
 *     past experiences (never invented).
 *
 * Served by src/server.ts. The embedded client script uses string
 * concatenation only — no backticks, no ${} — so it lives safely inside this
 * TS template literal.
 */
export function renderAppHtml(): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>criteria — tus decisiones</title>
<style>
:root{
  --bg:#faf9f7;--panel:#ffffff;--soft:#f3f2ef;--text:#23262e;--muted:#71767f;
  --border:#eae8e3;--accent:#6a5fd6;--accent-weak:#efedfb;
  --good:#2f9e6f;--bad:#d9534f;--mixed:#d19a2e;--pending:#a7abb3;
  --bad-weak:#fbecea;
  --shadow:0 1px 2px #0000000a,0 8px 24px #0000000a;
}
[data-theme="dark"]{
  --bg:#0f1116;--panel:#171a22;--soft:#1d212b;--text:#e8e9ee;--muted:#969ba8;
  --border:#262a33;--accent:#8b7ff0;--accent-weak:#211f3a;
  --good:#43b98a;--bad:#e5655f;--mixed:#dcae52;--pending:#6b7079;
  --bad-weak:#2a1a1c;
  --shadow:0 1px 2px #00000030,0 10px 30px #00000040;
}
*{box-sizing:border-box}
html,body{margin:0}
body{background:var(--bg);color:var(--text);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:620px;margin:0 auto;padding:26px 20px 90px}
header{display:flex;align-items:center;gap:10px;margin-bottom:6px}
header .dot{width:11px;height:11px;border-radius:50%;background:var(--accent)}
header h1{font-size:19px;font-weight:600;margin:0;letter-spacing:-.01em}
header .sp{flex:1}
#theme{border:1px solid var(--border);background:var(--panel);color:var(--text);width:34px;height:34px;border-radius:10px;cursor:pointer;font-size:15px}
.tagline{color:var(--muted);font-size:14.5px;margin:0 0 18px 21px}
.tabs{display:flex;gap:6px;background:var(--soft);border:1px solid var(--border);border-radius:12px;padding:4px;margin-bottom:22px}
.tab{flex:1;border:none;background:none;color:var(--muted);border-radius:9px;padding:9px;font:inherit;font-size:14.5px;font-weight:500;cursor:pointer}
.tab.on{background:var(--panel);color:var(--text);box-shadow:var(--shadow)}
#insights{color:var(--muted);font-size:13.5px;margin:0 0 16px 3px;line-height:1.5}
#insights b{color:var(--text);font-weight:600}
.card{background:var(--panel);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow)}
.compose,.askbox{padding:18px 18px 16px;margin-bottom:22px}
label{display:block;font-size:13px;color:var(--muted);margin:0 0 6px;font-weight:500}
textarea,input[type=text]{width:100%;border:1px solid var(--border);background:var(--soft);color:var(--text);border-radius:11px;padding:11px 13px;font:inherit;outline:none;resize:none}
textarea:focus,input[type=text]:focus{border-color:var(--accent);background:var(--panel)}
textarea{min-height:56px}
.field{margin-bottom:14px}
.factor{display:flex;gap:8px;align-items:center;margin-bottom:8px}
.factor input{flex:1}
.imps{display:flex;gap:4px;flex-shrink:0}
.imp,.pick{border:1px solid var(--border);background:var(--soft);color:var(--muted);border-radius:999px;padding:5px 11px;font-size:12.5px;cursor:pointer;white-space:nowrap}
.imp.on{background:var(--accent-weak);border-color:var(--accent);color:var(--accent);font-weight:500}
.factor .rm{border:none;background:none;color:var(--muted);cursor:pointer;font-size:18px;line-height:1;padding:0 4px;flex-shrink:0}
.addf{border:1px dashed var(--border);background:none;color:var(--muted);border-radius:10px;padding:8px;width:100%;cursor:pointer;font:inherit;font-size:13.5px;margin-top:2px}
.addf:hover{border-color:var(--accent);color:var(--accent)}
.moreToggle{background:none;border:none;color:var(--accent);cursor:pointer;font:inherit;font-size:13.5px;padding:4px 0;margin-top:4px}
#more{display:none;margin-top:12px;padding-top:14px;border-top:1px solid var(--border)}
#more.show{display:block}
.picks{display:flex;gap:6px;flex-wrap:wrap}
.pick.on{background:var(--accent-weak);border-color:var(--accent);color:var(--accent);font-weight:500}
.row{display:flex;gap:14px;flex-wrap:wrap}
.row>div{flex:1;min-width:150px}
.actions{display:flex;align-items:center;gap:12px;margin-top:16px}
.primary{background:var(--accent);color:#fff;border:none;border-radius:11px;padding:11px 20px;font:inherit;font-weight:600;cursor:pointer}
.primary:disabled{opacity:.45;cursor:not-allowed}
.hint{color:var(--bad);font-size:13px}
.filters{display:flex;gap:8px;margin:0 0 14px 2px}
.filters .pick.on{background:var(--accent);border-color:var(--accent);color:#fff}
.exp{padding:16px 17px;margin-bottom:12px}
.exp .top{display:flex;align-items:baseline;gap:9px}
.exp .res{width:9px;height:9px;border-radius:50%;flex-shrink:0;margin-top:7px}
.r-good{background:var(--good)}.r-bad{background:var(--bad)}.r-mixed{background:var(--mixed)}.r-pending{background:var(--pending)}
.exp h3{font-size:16px;font-weight:600;margin:0;line-height:1.4;flex:1}
.exp .date{color:var(--muted);font-size:12px;flex-shrink:0}
.exp .dec{margin:7px 0 0 18px;color:var(--text)}
.exp .dec .k,.why .k{color:var(--muted);font-size:12.5px}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin:11px 0 0 18px;align-items:center}
.tag{background:var(--soft);border:1px solid var(--border);border-radius:999px;padding:3px 10px;font-size:12px;color:var(--muted)}
.tag b{color:var(--text);font-weight:500}
.tag .s{color:var(--accent);font-weight:600;margin-left:3px}
.chips-lbl{color:var(--muted);font-size:12px}
.meta{margin:11px 0 0 18px;color:var(--muted);font-size:12.5px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.meta .cat{background:var(--accent-weak);color:var(--accent);border-radius:999px;padding:2px 9px;font-size:11.5px}
.resolveBtn{border:1px solid var(--border);background:var(--panel);color:var(--text);border-radius:9px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer}
.resolveBtn:hover{border-color:var(--accent);color:var(--accent)}
.resolve{margin:12px 0 0 18px;padding:12px;background:var(--soft);border-radius:11px;display:none}
.resolve.show{display:block}
.resolve .picks{margin-bottom:10px}
.resolve input{margin-bottom:10px}
.go{background:var(--accent);color:#fff;border:none;border-radius:9px;padding:8px 15px;font:inherit;font-size:13px;cursor:pointer}
.outcome-note{margin:9px 0 0 18px;color:var(--muted);font-size:13.5px;font-style:italic}
.empty{text-align:center;color:var(--muted);padding:36px 20px;line-height:1.6}
/* ask */
.conf{display:inline-block;font-size:11.5px;color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:2px 10px;margin-bottom:10px}
.ah{font-size:14px;color:var(--muted);font-weight:500;margin:0 0 8px}
.ans{font-size:17px;font-weight:600;line-height:1.4}
.why{margin-top:8px;color:var(--text)}
.warn{margin-top:14px;background:var(--bad-weak);border:1px solid var(--bad);border-radius:12px;padding:12px 14px}
.warn-h{color:var(--bad);font-weight:600;font-size:13.5px;margin-bottom:6px}
.warn-i{font-size:13.5px;color:var(--text);margin-top:4px}
.prov{margin-top:16px;padding-top:14px;border-top:1px solid var(--border)}
.prov-h{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px}
.prov-i{display:flex;gap:8px;align-items:baseline;font-size:13.5px;margin-top:7px}
.prov-i .res{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:6px}
.prov-i .pd{color:var(--muted)}
.ask-empty{padding:22px;text-align:center;color:var(--muted);line-height:1.6}
.ask-empty .go{margin-top:14px}
.askhint{color:var(--muted);font-size:12.5px;margin:12px 0 0;line-height:1.5}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <span class="dot"></span>
    <h1>criteria</h1>
    <span class="sp"></span>
    <button id="theme" title="Cambiar tema" aria-label="Cambiar tema">◐</button>
  </header>
  <p class="tagline">Guarda tus decisiones y aprende de ellas.</p>

  <div class="tabs">
    <button class="tab on" data-t="note">Anotar una decisión</button>
    <button class="tab" data-t="ask">Pedir criterio</button>
  </div>

  <div id="view-note">
    <p id="insights"></p>
    <div class="card compose">
      <div class="field">
        <label for="situation">¿Qué situación viviste o tienes que decidir?</label>
        <textarea id="situation" placeholder="Ej: Me ofrecieron cambiar de proyecto, pagan más pero mi equipo actual me necesita."></textarea>
      </div>
      <div class="field">
        <label for="decision">¿Qué decidiste (o vas a decidir)?</label>
        <input id="decision" type="text" placeholder="Ej: Quedarme en mi equipo por ahora.">
      </div>
      <div class="field">
        <label>¿Qué cosas tomaste en cuenta? &nbsp;<span style="color:var(--muted);font-weight:400">(y cuánto pesaron)</span></label>
        <div id="factors"></div>
        <button type="button" class="addf" id="addFactor">+ agregar algo que tomaste en cuenta</button>
      </div>
      <button type="button" class="moreToggle" id="moreToggle">Más detalles (opcional)</button>
      <div id="more">
        <div class="field">
          <label for="reason">¿Por qué? (tu razón principal)</label>
          <input id="reason" type="text" placeholder="Ej: La confianza del equipo vale más que el dinero ahora.">
        </div>
        <div class="field">
          <label for="expectation">¿Qué esperas que pase?</label>
          <input id="expectation" type="text" placeholder="Ej: Crecer con ellos y que llegue una mejor oferta después.">
        </div>
        <div class="row">
          <div class="field">
            <label>¿Te quedó alguna duda?</label>
            <div class="picks" id="doubtPicks"></div>
          </div>
          <div class="field">
            <label>¿De qué área es?</label>
            <div class="picks" id="catPicks"></div>
          </div>
        </div>
      </div>
      <div class="actions">
        <button id="save" class="primary" disabled>Guardar experiencia</button>
        <span class="hint" id="hint"></span>
      </div>
    </div>
    <div class="filters" id="filters"></div>
    <div id="list"></div>
  </div>

  <div id="view-ask" style="display:none">
    <div class="card askbox">
      <div class="field">
        <label for="askInput">¿Qué tienes que decidir?</label>
        <textarea id="askInput" placeholder="Ej: Me ofrecen otro trabajo con más sueldo pero lejos de casa. ¿Lo tomo?"></textarea>
      </div>
      <button id="askBtn" class="primary">Pedir criterio</button>
      <p class="askhint">Busca en tus experiencias entendiendo el significado (IA local: la primera vez descarga un modelo y luego funciona sin internet). Nada de lo que escribes sale de tu equipo.</p>
    </div>
    <div id="askResult"></div>
  </div>
</div>

<script>
"use strict";
var API='/api';
function $(s){return document.querySelector(s)}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

var CATS=[{k:'general',l:'General'},{k:'trabajo',l:'Trabajo'},{k:'personal',l:'Personal'},{k:'dinero',l:'Dinero'},{k:'salud',l:'Salud'},{k:'familia',l:'Familia'}];
var DOUBTS=[{k:'no',l:'No'},{k:'un-poco',l:'Un poco'},{k:'si',l:'Sí'}];
var IMP_L={mucho:'Mucho',algo:'Algo',poco:'Poco'};
var RES_L={good:'Salió bien',bad:'Salió mal',mixed:'Más o menos',pending:'Pendiente'};
var CONF_L={none:'',low:'con poca certeza',medium:'con certeza media',high:'con bastante certeza'};

var factors=[{label:'',importance:'algo'}];
var doubt='un-poco';
var category='general';
var filter='todas';
var items=[];

/* ---------- tabs ---------- */
function setTab(t){
  document.querySelectorAll('.tab').forEach(function(b){b.classList.toggle('on',b.dataset.t===t)});
  $('#view-note').style.display=t==='note'?'block':'none';
  $('#view-ask').style.display=t==='ask'?'block':'none';
}
document.querySelectorAll('.tab').forEach(function(b){b.addEventListener('click',function(){setTab(b.dataset.t)})});

/* ---------- anotar ---------- */
function renderFactors(){
  var box=$('#factors');box.innerHTML='';
  factors.forEach(function(f,i){
    var row=document.createElement('div');row.className='factor';
    var imps=['mucho','algo','poco'].map(function(w){
      return '<span class="imp'+(f.importance===w?' on':'')+'" data-i="'+i+'" data-w="'+w+'">'+IMP_L[w]+'</span>';
    }).join('');
    row.innerHTML='<input type="text" data-i="'+i+'" placeholder="Ej: el tiempo que tenía" value="'+esc(f.label)+'">'+
      '<div class="imps">'+imps+'</div>'+
      (factors.length>1?'<button class="rm" data-i="'+i+'" title="quitar">×</button>':'');
    box.appendChild(row);
  });
  box.querySelectorAll('input').forEach(function(inp){
    inp.addEventListener('input',function(){factors[+inp.dataset.i].label=inp.value;validate()});
  });
  box.querySelectorAll('.imp').forEach(function(el){
    el.addEventListener('click',function(){factors[+el.dataset.i].importance=el.dataset.w;renderFactors()});
  });
  box.querySelectorAll('.rm').forEach(function(el){
    el.addEventListener('click',function(){factors.splice(+el.dataset.i,1);renderFactors();validate()});
  });
}
function renderPicks(id,arr,current,cb){
  var box=$(id);box.innerHTML='';
  arr.forEach(function(o){
    var b=document.createElement('span');b.className='pick'+(current===o.k?' on':'');
    b.textContent=o.l;b.addEventListener('click',function(){cb(o.k)});box.appendChild(b);
  });
}
function validate(){
  var ok=$('#situation').value.trim() && $('#decision').value.trim() && factors.some(function(f){return f.label.trim()});
  $('#save').disabled=!ok;
  if(ok)$('#hint').textContent='';
  return ok;
}
function resetForm(){
  $('#situation').value='';$('#decision').value='';$('#reason').value='';$('#expectation').value='';
  factors=[{label:'',importance:'algo'}];doubt='un-poco';category='general';
  renderFactors();renderPicks('#doubtPicks',DOUBTS,doubt,setDoubt);renderPicks('#catPicks',CATS,category,setCat);
  $('#more').classList.remove('show');validate();
}
function setDoubt(k){doubt=k;renderPicks('#doubtPicks',DOUBTS,doubt,setDoubt)}
function setCat(k){category=k;renderPicks('#catPicks',CATS,category,setCat)}
function save(){
  if(!validate()){$('#hint').textContent='Escribe la situación, la decisión y al menos una cosa que tomaste en cuenta.';return}
  var body={
    situation:$('#situation').value.trim(),decision:$('#decision').value.trim(),
    reason:$('#reason').value.trim(),expectation:$('#expectation').value.trim(),
    factors:factors.filter(function(f){return f.label.trim()}).map(function(f){return{label:f.label.trim(),importance:f.importance}}),
    doubt:doubt,category:category
  };
  $('#save').disabled=true;$('#save').textContent='Guardando...';
  fetch(API+'/experiences',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    .then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d}})})
    .then(function(res){
      $('#save').textContent='Guardar experiencia';
      if(!res.ok){$('#hint').textContent=res.d.error||'No se pudo guardar.';validate();return}
      resetForm();load();
    })
    .catch(function(){$('#save').textContent='Guardar experiencia';$('#hint').textContent='No se pudo conectar.';validate()});
}
function catLabel(k){for(var i=0;i<CATS.length;i++)if(CATS[i].k===k)return CATS[i].l;return k}
function card(x){
  var el=document.createElement('div');el.className='card exp';
  var chips=x.factors.map(function(f){return '<span class="tag"><b>'+esc(f.label)+'</b><span class="s">'+IMP_L[f.importance]+'</span></span>'}).join('');
  var html='<div class="top"><span class="res r-'+x.result+'"></span>'+
    '<h3>'+esc(x.situation)+'</h3><span class="date">'+esc(x.date)+'</span></div>'+
    '<div class="dec"><span class="k">Decidiste:</span> '+esc(x.decision)+'</div>'+
    (chips?'<div class="chips">'+chips+'</div>':'')+
    '<div class="meta"><span class="cat">'+esc(catLabel(x.category))+'</span><span>'+RES_L[x.result]+'</span>';
  if(x.result==='pending')html+='<button class="resolveBtn" data-id="'+x.id+'">¿Cómo resultó?</button>';
  html+='</div>';
  if(x.result==='pending')html+='<div class="resolve" id="rv-'+x.id+'"><div class="picks" id="rvp-'+x.id+'"></div>'+
    '<input type="text" id="rvn-'+x.id+'" placeholder="¿Qué pasó? (opcional)">'+
    '<button class="go" data-id="'+x.id+'">Guardar resultado</button></div>';
  else if(x.note)html+='<div class="outcome-note">“'+esc(x.note)+'”</div>';
  el.innerHTML=html;return el;
}
var resolveChoice={};
function wireResolvePicks(id){
  renderPicks('#rvp-'+id,[{k:'good',l:'Salió bien'},{k:'mixed',l:'Más o menos'},{k:'bad',l:'Salió mal'}],resolveChoice[id]||'good',function(k){resolveChoice[id]=k;wireResolvePicks(id)});
}
function wireCards(){
  $('#list').querySelectorAll('.resolveBtn').forEach(function(b){
    b.addEventListener('click',function(){
      var id=b.dataset.id;$('#rv-'+id).classList.toggle('show');
      if(!resolveChoice[id])resolveChoice[id]='good';wireResolvePicks(id);
    });
  });
  $('#list').querySelectorAll('.go').forEach(function(g){
    g.addEventListener('click',function(){
      var id=g.dataset.id;
      fetch(API+'/experiences/'+encodeURIComponent(id)+'/outcome',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({result:resolveChoice[id]||'good',note:($('#rvn-'+id).value||'').trim()})}).then(function(){load()});
    });
  });
}
function renderList(){
  var box=$('#list');box.innerHTML='';
  if(items.length===0){box.innerHTML='<div class="card empty">Aún no has guardado ninguna experiencia.<br>Escribe la primera arriba — toma un minuto.</div>';return}
  var shown=items.filter(function(x){return filter==='todas'||x.result==='pending'});
  if(shown.length===0){box.innerHTML='<div class="card empty">No tienes experiencias pendientes. ¡Bien!</div>';return}
  shown.forEach(function(x){box.appendChild(card(x))});
  wireCards();
}
function renderInsights(ins){
  if(!ins||ins.total===0){$('#insights').textContent='';return}
  var s='Has guardado <b>'+ins.total+'</b> '+(ins.total===1?'experiencia':'experiencias')+'.';
  if(ins.resolved>0)s+=' De las que ya sabes cómo salieron, <b>'+ins.reliabilityPct+'%</b> salieron bien.';
  if(ins.topFactors&&ins.topFactors.length)s+='<br>Lo que más te pesa: '+ins.topFactors.map(function(f){return '<b>'+esc(f.label)+'</b>'}).join(', ')+'.';
  if(ins.pending>0)s+='<br>Tienes <b>'+ins.pending+'</b> sin cerrar — cuéntale cómo salieron cuando sepas.';
  $('#insights').innerHTML=s;
}
function renderFilters(){
  var box=$('#filters');box.innerHTML='';
  [{k:'todas',l:'Todas'},{k:'pendientes',l:'Pendientes'}].forEach(function(o){
    var b=document.createElement('span');b.className='pick'+(filter===o.k?' on':'');b.textContent=o.l;
    b.addEventListener('click',function(){filter=o.k;renderFilters();renderList()});box.appendChild(b);
  });
}
function load(){
  Promise.all([
    fetch(API+'/experiences').then(function(r){return r.json()}),
    fetch(API+'/insights').then(function(r){return r.json()})
  ]).then(function(res){items=res[0];renderInsights(res[1]);renderFilters();renderList()});
}

/* ---------- consultar ---------- */
function renderAsk(a){
  var box=$('#askResult');
  if(!a){box.innerHTML='';return}
  if(!a.hasAnswer){
    box.innerHTML='<div class="card ask-empty">Todavía no tengo experiencias tuyas parecidas a esto.<br>'+
      '¿Y si la anotas? Así, la próxima vez, sí podré ayudarte con tu propio criterio.'+
      '<div><button class="go" id="toNote">Anotar esta decisión</button></div></div>';
    $('#toNote').addEventListener('click',function(){
      setTab('note');$('#situation').value=a.situation;$('#situation').dispatchEvent(new Event('input',{bubbles:true}));
      window.scrollTo({top:0,behavior:'smooth'});
    });
    return;
  }
  var html='<div class="card askbox">';
  if(a.confidence&&CONF_L[a.confidence])html+='<span class="conf">'+CONF_L[a.confidence]+'</span> ';
  if(a.mode==='semantic')html+='<span class="conf">entendido con IA local</span>';
  if(a.suggestion){
    html+='<div class="ah">En situaciones parecidas, esto te funcionó:</div>'+
      '<div class="ans">'+esc(a.suggestion.decision)+'</div>';
    if(a.suggestion.reason)html+='<div class="why"><span class="k">Por qué:</span> '+esc(a.suggestion.reason)+'</div>';
  }else{
    html+='<div class="ah">Tienes experiencias parecidas, pero ninguna te salió del todo bien. Mira abajo antes de decidir.</div>';
  }
  if(a.factors.length)html+='<div class="chips">'+a.factors.map(function(f){return '<span class="tag"><b>'+esc(f.label)+'</b></span>'}).join('')+'<span class="chips-lbl">es lo que más pesa en casos así</span></div>';
  if(a.warnings.length){
    html+='<div class="warn"><div class="warn-h">Cuidado</div>';
    a.warnings.forEach(function(w){html+='<div class="warn-i">Cuando decidiste “'+esc(w.decision)+'” — '+esc(w.note||'salió mal')+'</div>'});
    html+='</div>';
  }
  html+='<div class="prov"><div class="prov-h">Basado en tus experiencias</div>';
  a.similar.forEach(function(s){html+='<div class="prov-i"><span class="res r-'+s.result+'"></span><span>'+esc(s.situation)+' <span class="pd">→ '+esc(s.decision)+'</span></span></div>'});
  html+='</div></div>';
  box.innerHTML=html;
}
function doAsk(){
  var s=$('#askInput').value.trim();
  if(!s)return;
  $('#askBtn').disabled=true;$('#askBtn').textContent='Consultando...';
  fetch(API+'/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({situation:s})})
    .then(function(r){return r.json()})
    .then(function(a){$('#askBtn').disabled=false;$('#askBtn').textContent='Pedir criterio';renderAsk(a)})
    .catch(function(){$('#askBtn').disabled=false;$('#askBtn').textContent='Pedir criterio'});
}

/* ---------- theme + wiring ---------- */
var themeBtn=$('#theme');
function applyTheme(t){document.documentElement.setAttribute('data-theme',t);try{localStorage.setItem('criteria-theme',t)}catch(e){}}
var saved=null;try{saved=localStorage.getItem('criteria-theme')}catch(e){}
applyTheme(saved||(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));
themeBtn.addEventListener('click',function(){applyTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark')});

$('#addFactor').addEventListener('click',function(){factors.push({label:'',importance:'algo'});renderFactors()});
$('#moreToggle').addEventListener('click',function(){$('#more').classList.toggle('show')});
$('#save').addEventListener('click',save);
$('#situation').addEventListener('input',validate);
$('#decision').addEventListener('input',validate);
$('#askBtn').addEventListener('click',doAsk);

renderFactors();
renderPicks('#doubtPicks',DOUBTS,doubt,setDoubt);
renderPicks('#catPicks',CATS,category,setCat);
load();
</script>
</body>
</html>
`;
}
