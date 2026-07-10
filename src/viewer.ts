/**
 * Self-contained graph viewer — reference visualization for spec/graph.md.
 *
 * Generates ONE html file with the graph data embedded: no dependencies,
 * no build step, no network. Open it with a double click, share it as a file.
 * Local-first, like everything else in criteria.
 */
import type { CriterionGraph } from './graph.js';

export function renderViewerHtml(graph: CriterionGraph): string {
  const data = JSON.stringify(graph).replace(/</g, '\\u003c');
  const scope = graph.derivedFrom.domain ?? 'all domains';
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>criteria · graph — ${scope}</title>
<style>
:root{
  --bg:#0e1016;--panel:#151823;--panel2:#1b1f2d;--text:#e7e9f0;--muted:#98a0b3;
  --border:#252b3b;--accent:#8b7ff0;--edge:#39415580;--edge-strong:#4a5470;
  --good:#3fb27f;--bad:#e5534b;--mixed:#e0a83a;--pending:#7c828d;--sim:#38a3a5;
}
html[data-theme="light"]{
  --bg:#f6f6f4;--panel:#ffffff;--panel2:#f0f0ee;--text:#20232b;--muted:#66707f;
  --border:#e2e3e8;--accent:#6a5fd6;--edge:#b9bdc966;--edge-strong:#9aa0b0;
}
*{box-sizing:border-box;margin:0}
body{background:var(--bg);color:var(--text);font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;height:100vh;display:flex;flex-direction:column;overflow:hidden}
header{display:flex;align-items:center;gap:14px;padding:10px 16px;border-bottom:1px solid var(--border);flex-wrap:wrap;background:var(--panel)}
.brand{display:flex;align-items:baseline;gap:8px;font-weight:600;font-size:15px}
.brand .dot{width:10px;height:10px;border-radius:50%;background:var(--accent);display:inline-block;align-self:center}
.brand small{color:var(--muted);font-weight:400}
.meta{color:var(--muted);font-size:12.5px}
.spacer{flex:1}
#q{background:var(--panel2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:6px 12px;width:190px;outline:none;font-size:13px}
#q:focus{border-color:var(--accent)}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{border:1px solid var(--border);background:var(--panel2);color:var(--muted);border-radius:999px;padding:4px 11px;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:6px;transition:all .15s}
.chip .sw{width:8px;height:8px;border-radius:50%}
.chip.on{color:var(--text);border-color:var(--edge-strong)}
.chip:not(.on){opacity:.45}
#theme{border:1px solid var(--border);background:var(--panel2);color:var(--text);border-radius:8px;width:32px;height:30px;cursor:pointer;font-size:15px}
main{flex:1;position:relative;overflow:hidden}
canvas{position:absolute;inset:0;width:100%;height:100%;cursor:grab}
#panel{position:absolute;top:14px;right:14px;width:330px;max-height:calc(100% - 28px);overflow:auto;background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:18px;box-shadow:0 8px 32px #0006}
#panel .close{position:absolute;top:10px;right:12px;background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer}
#panel h2{font-size:15.5px;line-height:1.45;margin:4px 0 12px;font-weight:600}
.badges{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px}
.badge{font-size:11px;border-radius:999px;padding:2px 9px;border:1px solid var(--border);color:var(--muted)}
.badge.o-good{color:var(--good);border-color:var(--good)}
.badge.o-bad{color:var(--bad);border-color:var(--bad)}
.badge.o-mixed{color:var(--mixed);border-color:var(--mixed)}
.badge.o-pending{color:var(--pending);border-color:var(--pending)}
.badge.personal{color:var(--accent);border-color:var(--accent);border-style:dashed}
.sec{margin:12px 0}
.sec .k{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:5px}
.lensrow{display:flex;gap:8px;align-items:baseline;padding:6px 0;border-top:1px solid var(--border);font-size:13px}
.lensrow:first-of-type{border-top:none}
.lensrow .w{font-size:10.5px;border-radius:4px;padding:1px 6px;flex-shrink:0}
.w-high{background:var(--accent);color:#fff}
.w-medium{background:color-mix(in srgb,var(--accent) 45%,transparent);color:var(--text)}
.w-low{background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--muted)}
.lensrow em{color:var(--muted);font-style:normal}
.bar{height:6px;border-radius:3px;background:var(--panel2);overflow:hidden;margin-top:4px}
.bar i{display:block;height:100%;background:var(--accent)}
.case-link{display:block;padding:7px 10px;border:1px solid var(--border);border-radius:8px;margin-top:6px;cursor:pointer;font-size:12.5px;color:var(--text)}
.case-link:hover{border-color:var(--accent)}
.case-link .st{float:right;font-size:11px}
.fine{color:var(--muted);font-size:11.5px;margin-top:14px;border-top:1px solid var(--border);padding-top:10px;line-height:1.7}
footer{position:absolute;left:14px;bottom:12px;display:flex;gap:12px;color:var(--muted);font-size:11.5px;background:color-mix(in srgb,var(--panel) 78%,transparent);border:1px solid var(--border);border-radius:10px;padding:6px 12px;backdrop-filter:blur(6px)}
footer span{display:flex;align-items:center;gap:5px}
footer .d{width:8px;height:8px;border-radius:50%}
@media (max-width:720px){#panel{width:calc(100% - 28px)} #q{width:130px}}
</style>
</head>
<body>
<header>
  <div class="brand"><span class="dot"></span>criteria <small>graph</small></div>
  <div class="meta" id="meta"></div>
  <div class="spacer"></div>
  <input id="q" type="search" placeholder="Search cases and lenses…" aria-label="Search">
  <div class="chips" id="chips"></div>
  <button id="theme" title="Toggle theme" aria-label="Toggle theme">◐</button>
</header>
<main>
  <canvas id="c"></canvas>
  <aside id="panel" hidden></aside>
  <footer>
    <span><span class="d" style="background:var(--accent)"></span>lens</span>
    <span><span class="d" style="background:var(--good)"></span>good</span>
    <span><span class="d" style="background:var(--bad)"></span>bad</span>
    <span><span class="d" style="background:var(--mixed)"></span>mixed</span>
    <span><span class="d" style="background:var(--pending)"></span>pending</span>
    <span><span class="d" style="background:none;border:1.5px dashed var(--accent)"></span>personal</span>
    <span style="border-left:1px solid var(--border);padding-left:12px">edge width = declared weight · dashed = similar</span>
  </footer>
</main>
<script>
"use strict";
var GRAPH = ${data};

var nodes = GRAPH.nodes.map(function (n, i) { return Object.assign({ idx: i, x: 0, y: 0, vx: 0, vy: 0 }, n); });
var byId = {}; nodes.forEach(function (n) { byId[n.id] = n; });
var edges = GRAPH.edges.map(function (e) { return { s: byId[e.source], t: byId[e.target], type: e.type, weight: e.weight, score: e.score }; })
  .filter(function (e) { return e.s && e.t; });
var neighbors = {}; nodes.forEach(function (n) { neighbors[n.id] = new Set(); });
edges.forEach(function (e) { neighbors[e.s.id].add(e.t.id); neighbors[e.t.id].add(e.s.id); });

var lenses = nodes.filter(function (n) { return n.type === 'lens'; });
var cases = nodes.filter(function (n) { return n.type === 'case'; });
lenses.forEach(function (n, i) {
  var a = (i / Math.max(lenses.length, 1)) * Math.PI * 2;
  n.x = Math.cos(a) * 150; n.y = Math.sin(a) * 150;
});
cases.forEach(function (n, i) {
  var a = (i / Math.max(cases.length, 1)) * Math.PI * 2 + 0.35;
  n.x = Math.cos(a) * 330; n.y = Math.sin(a) * 330;
});

function radius(n) { return n.type === 'lens' ? 7 + (n.salience || 0) * 16 : 9; }
function restLen(e) {
  if (e.type === 'similar') return 150;
  return e.weight === 'high' ? 85 : e.weight === 'medium' ? 120 : 155;
}

var canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
var panX = 0, panY = 0, scale = 1, alpha = 1;
var hoverN = null, selectedN = null, dragN = null, panning = false;
var lastMx = 0, lastMy = 0, downX = 0, downY = 0;
var activeLayers = new Set(['community', 'personal']);
var activeOutcomes = new Set(['good', 'bad', 'mixed', 'pending']);
var query = '';

function caseVisible(n) {
  if (!activeLayers.has(n.layer) || !activeOutcomes.has(n.outcome)) return false;
  if (!query) return true;
  var hay = (n.label + ' ' + (n.case ? n.case.decision + ' ' + n.case.context.tags.join(' ') : '')).toLowerCase();
  return hay.indexOf(query) !== -1;
}
function visible(n) {
  if (n.type === 'case') return caseVisible(n);
  if (query && n.label.toLowerCase().indexOf(query) !== -1) return true;
  var any = false;
  neighbors[n.id].forEach(function (id) { if (byId[id].type === 'case' && caseVisible(byId[id])) any = true; });
  return any;
}
function edgeVisible(e) { return visible(e.s) && visible(e.t); }

function tick() {
  var i, j, a, b, dx, dy, d, f;
  for (i = 0; i < nodes.length; i++) {
    a = nodes[i];
    for (j = i + 1; j < nodes.length; j++) {
      b = nodes[j];
      dx = b.x - a.x; dy = b.y - a.y;
      d = Math.sqrt(dx * dx + dy * dy) || 1;
      f = (2600 / (d * d)) * alpha;
      var fx = (dx / d) * f, fy = (dy / d) * f;
      a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
    }
    a.vx -= a.x * 0.015 * alpha; a.vy -= a.y * 0.015 * alpha;
  }
  edges.forEach(function (e) {
    dx = e.t.x - e.s.x; dy = e.t.y - e.s.y;
    d = Math.sqrt(dx * dx + dy * dy) || 1;
    f = (d - restLen(e)) * 0.05 * alpha;
    var fx = (dx / d) * f, fy = (dy / d) * f;
    e.s.vx += fx; e.s.vy += fy; e.t.vx -= fx; e.t.vy -= fy;
  });
  nodes.forEach(function (n) {
    if (n === dragN) { n.vx = 0; n.vy = 0; return; }
    n.vx *= 0.85; n.vy *= 0.85;
    n.x += n.vx; n.y += n.vy;
  });
  if (alpha > 0.03) alpha *= 0.995;
}

function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
var C = {};
function refreshColors() {
  C = { bg: cssVar('--bg'), accent: cssVar('--accent'), good: cssVar('--good'), bad: cssVar('--bad'),
    mixed: cssVar('--mixed'), pending: cssVar('--pending'), sim: cssVar('--sim'),
    edge: cssVar('--edge'), text: cssVar('--text'), muted: cssVar('--muted') };
}
refreshColors();

function nodeColor(n) { return n.type === 'lens' ? C.accent : C[n.outcome] || C.pending; }

function draw() {
  var w = canvas.clientWidth, h = canvas.clientHeight, dpr = window.devicePixelRatio || 1;
  if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2 + panX, h / 2 + panY); ctx.scale(scale, scale);

  var focus = hoverN || selectedN;
  var hood = null;
  if (focus) { hood = new Set([focus.id]); neighbors[focus.id].forEach(function (id) { hood.add(id); }); }

  edges.forEach(function (e) {
    if (!edgeVisible(e)) return;
    var dim = hood && !(hood.has(e.s.id) && hood.has(e.t.id));
    ctx.globalAlpha = dim ? 0.06 : 1;
    if (e.type === 'similar') { ctx.strokeStyle = C.sim; ctx.lineWidth = 1.2 / scale; ctx.setLineDash([5 / scale, 4 / scale]); }
    else {
      ctx.strokeStyle = C.edge; ctx.setLineDash([]);
      ctx.lineWidth = (e.weight === 'high' ? 2.4 : e.weight === 'medium' ? 1.3 : 0.6) / Math.sqrt(scale);
    }
    ctx.beginPath(); ctx.moveTo(e.s.x, e.s.y); ctx.lineTo(e.t.x, e.t.y); ctx.stroke();
  });
  ctx.setLineDash([]);

  nodes.forEach(function (n) {
    if (!visible(n)) return;
    var dim = hood && !hood.has(n.id);
    ctx.globalAlpha = dim ? 0.14 : 1;
    var r = radius(n);
    ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = nodeColor(n); ctx.fill();
    if (n.layer === 'personal') {
      ctx.beginPath(); ctx.arc(n.x, n.y, r + 3.5 / scale, 0, Math.PI * 2);
      ctx.strokeStyle = C.accent; ctx.lineWidth = 1.4 / scale;
      ctx.setLineDash([4 / scale, 3 / scale]); ctx.stroke(); ctx.setLineDash([]);
    }
    if (n === selectedN) {
      ctx.beginPath(); ctx.arc(n.x, n.y, r + 6 / scale, 0, Math.PI * 2);
      ctx.strokeStyle = C.text; ctx.lineWidth = 1.2 / scale; ctx.stroke();
    }
    var showLabel = n.type === 'lens' || scale > 0.9 || (hood && hood.has(n.id)) || n === selectedN;
    if (showLabel) {
      ctx.font = (n.type === 'lens' ? 600 : 400) + ' ' + (11 / scale) + 'px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = dim ? C.muted : (n.type === 'lens' ? C.text : C.muted);
      var label = n.type === 'case' && n.label.length > 42 ? n.label.slice(0, 41) + '…' : n.label;
      ctx.fillText(label, n.x, n.y + r + 14 / scale);
    }
  });
  ctx.globalAlpha = 1;
}

function loop() { tick(); draw(); requestAnimationFrame(loop); }

for (var k = 0; k < 240; k++) tick();
(function fit() {
  var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  nodes.forEach(function (n) {
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
  });
  var w = canvas.clientWidth || 900, h = canvas.clientHeight || 600;
  scale = Math.min(1.4, Math.min(w / (maxX - minX + 260), h / (maxY - minY + 260)));
  panX = -((minX + maxX) / 2) * scale; panY = -((minY + maxY) / 2) * scale;
})();
alpha = 0.35;
requestAnimationFrame(loop);

function toWorld(mx, my) {
  var w = canvas.clientWidth, h = canvas.clientHeight;
  return { x: (mx - w / 2 - panX) / scale, y: (my - h / 2 - panY) / scale };
}
function hit(mx, my) {
  var p = toWorld(mx, my), best = null, bestD = 1e9;
  nodes.forEach(function (n) {
    if (!visible(n)) return;
    var dx = n.x - p.x, dy = n.y - p.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < radius(n) + 6 / scale && d < bestD) { best = n; bestD = d; }
  });
  return best;
}

var downOnCanvas = false;
canvas.addEventListener('mousedown', function (e) {
  downOnCanvas = true;
  var r = canvas.getBoundingClientRect();
  lastMx = downX = e.clientX - r.left; lastMy = downY = e.clientY - r.top;
  var n = hit(lastMx, lastMy);
  if (n) { dragN = n; alpha = Math.max(alpha, 0.5); } else { panning = true; }
  canvas.style.cursor = 'grabbing';
});
window.addEventListener('mousemove', function (e) {
  var r = canvas.getBoundingClientRect();
  var mx = e.clientX - r.left, my = e.clientY - r.top;
  if (dragN) {
    var p = toWorld(mx, my); dragN.x = p.x; dragN.y = p.y; alpha = Math.max(alpha, 0.4);
  } else if (panning) {
    panX += mx - lastMx; panY += my - lastMy;
  } else if (e.target === canvas) {
    hoverN = hit(mx, my);
    canvas.style.cursor = hoverN ? 'pointer' : 'grab';
  }
  lastMx = mx; lastMy = my;
});
window.addEventListener('mouseup', function () {
  if (downOnCanvas) {
    var moved = Math.abs(lastMx - downX) + Math.abs(lastMy - downY) > 5;
    if (!moved) {
      var n = hit(lastMx, lastMy);
      if (n) { selectedN = n; openPanel(n); }
      else { selectedN = null; closePanel(); }
    }
  }
  downOnCanvas = false; dragN = null; panning = false; canvas.style.cursor = 'grab';
});
canvas.addEventListener('wheel', function (e) {
  e.preventDefault();
  var r = canvas.getBoundingClientRect();
  var mx = e.clientX - r.left - canvas.clientWidth / 2, my = e.clientY - r.top - canvas.clientHeight / 2;
  var factor = e.deltaY < 0 ? 1.12 : 0.89;
  var next = Math.min(3.5, Math.max(0.2, scale * factor));
  panX = mx - (mx - panX) * (next / scale);
  panY = my - (my - panY) * (next / scale);
  scale = next;
}, { passive: false });

var panel = document.getElementById('panel');
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function closePanel() { panel.hidden = true; }
function openPanel(n) {
  var html = '<button class="close" aria-label="Close">×</button>';
  if (n.type === 'case' && n.case) {
    var c = n.case;
    html += '<div class="badges"><span class="badge o-' + esc(c.outcome.status) + '">' + esc(c.outcome.status) + '</span>' +
      '<span class="badge' + (c.layer === 'personal' ? ' personal' : '') + '">' + esc(c.layer) + '</span>' +
      '<span class="badge">doubt: ' + esc(c.doubt) + '</span></div>' +
      '<h2>' + esc(c.situation) + '</h2>' +
      '<div class="sec"><div class="k">Lenses</div>';
    c.lenses.forEach(function (l) {
      html += '<div class="lensrow"><span class="w w-' + esc(l.weight) + '">' + esc(l.weight) + '</span>' +
        '<span><b>' + esc(l.name) + '</b> — <em>' + esc(l.reading) + '</em></span></div>';
    });
    html += '</div><div class="sec"><div class="k">Decision</div>' + esc(c.decision) + '</div>' +
      '<div class="sec"><div class="k">Reason</div>' + esc(c.reason) + '</div>';
    if (c.expectation) html += '<div class="sec"><div class="k">Expectation</div>' + esc(c.expectation) + '</div>';
    if (c.outcome.note) html += '<div class="sec"><div class="k">Outcome note</div>' + esc(c.outcome.note) + '</div>';
    html += '<div class="fine">by ' + esc(c.author) + ' · ' + esc(c.createdAt.slice(0, 10)) + '<br>' + esc(c.id) + '</div>';
  } else if (n.type === 'case') {
    html += '<h2>' + esc(n.label) + '</h2><div class="fine">Full payload not embedded in this export.</div>';
  } else {
    html += '<div class="badges"><span class="badge">lens</span><span class="badge">' + n.appearances + ' case' + (n.appearances === 1 ? '' : 's') + '</span></div>' +
      '<h2>' + esc(n.label) + '</h2>';
    if (n.description) html += '<div class="sec">' + esc(n.description) + '</div>';
    html += '<div class="sec"><div class="k">Emergent weight</div>' +
      '<div class="bar"><i style="width:' + Math.round((n.salience || 0) * 100) + '%"></i></div>' +
      '<div class="fine" style="border:none;padding:0;margin-top:4px">' + (n.salience || 0) + ' — earned from real cases and their outcomes, never configured</div></div>' +
      '<div class="sec"><div class="k">Seen in</div>';
    neighbors[n.id].forEach(function (id) {
      var m = byId[id];
      if (m.type !== 'case') return;
      html += '<span class="case-link" data-id="' + esc(id) + '"><span class="st" style="color:var(--' + esc(m.outcome) + ')">' + esc(m.outcome) + '</span>' + esc(m.label) + '</span>';
    });
    html += '</div>';
  }
  panel.innerHTML = html;
  panel.hidden = false;
  panel.querySelector('.close').addEventListener('click', function () { selectedN = null; closePanel(); });
  panel.querySelectorAll('.case-link').forEach(function (el) {
    el.addEventListener('click', function () {
      var m = byId[el.getAttribute('data-id')];
      if (m) { selectedN = m; openPanel(m); }
    });
  });
}

var CHIP_DEFS = [
  { key: 'community', set: activeLayers, sw: 'var(--edge-strong)' },
  { key: 'personal', set: activeLayers, sw: 'var(--accent)' },
  { key: 'good', set: activeOutcomes, sw: 'var(--good)' },
  { key: 'bad', set: activeOutcomes, sw: 'var(--bad)' },
  { key: 'mixed', set: activeOutcomes, sw: 'var(--mixed)' },
  { key: 'pending', set: activeOutcomes, sw: 'var(--pending)' }
];
var chipsBox = document.getElementById('chips');
CHIP_DEFS.forEach(function (def) {
  var b = document.createElement('button');
  b.className = 'chip on';
  b.innerHTML = '<span class="sw" style="background:' + def.sw + '"></span>' + def.key;
  b.addEventListener('click', function () {
    if (def.set.has(def.key)) { def.set.delete(def.key); b.classList.remove('on'); }
    else { def.set.add(def.key); b.classList.add('on'); }
    alpha = Math.max(alpha, 0.3);
  });
  chipsBox.appendChild(b);
});

document.getElementById('q').addEventListener('input', function (e) {
  query = e.target.value.trim().toLowerCase();
  alpha = Math.max(alpha, 0.3);
});

var themeBtn = document.getElementById('theme');
var savedTheme = null;
try { savedTheme = localStorage.getItem('criteria-theme'); } catch (err) {}
if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
refreshColors();
themeBtn.addEventListener('click', function () {
  var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('criteria-theme', next); } catch (err) {}
  refreshColors();
});

var lensCount = lenses.length;
document.getElementById('meta').textContent =
  GRAPH.derivedFrom.cases + ' cases · ' + lensCount + ' lenses · ' +
  (GRAPH.derivedFrom.domain || 'all domains') + ' · derived ' + GRAPH.derivedFrom.generatedAt.slice(0, 10);
</script>
</body>
</html>
`;
}
