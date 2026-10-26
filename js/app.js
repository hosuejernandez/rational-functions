// Page wiring: read the function, render each feature (or a Predict box for it), draw the graph.
import { parse, toTex, compile, freeSyms } from './expr.js';
import { simplify } from './simplify.js';
import { analyzeFunction, readFunction } from './analyze.js';
import { Graph } from './graph.js';

const $ = id => document.getElementById(id);
const M = (tex, display = false) => katex.renderToString(tex, { throwOnError: false, displayMode: display });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Analyzer strings put math between $...$; everything else is trusted HTML text.
const md = s => s.split('$').map((part, i) => (i % 2 ? M(`\\displaystyle ${part}`) : part)).join('');

const EXAMPLES = [
  ['x^3 - x', 'Cubic: an odd function'],
  ['(x - 1)^2 (x + 2)', 'Double zero: the graph bounces'],
  ['(x - 1)^3', 'Triple zero: the graph flattens'],
  ['x^4 - 4x^2', 'Quartic: an even function'],
  ['-2x^3 + x^2 + 4', 'Negative leading coefficient'],
  ['1/x', 'Reciprocal function'],
  ['(x^2 - 4)/(x - 2)', 'A hole'],
  ['(x^2 - x - 6)/(x^2 - 9)', 'A hole and a vertical asymptote'],
  ['1/(x - 3)^2', 'Even vertical asymptote: both sides go up'],
  ['(2x^2)/(x^2 + 1)', 'Horizontal asymptote y = 2'],
  ['x/(x^2 - 1)', 'Crosses its horizontal asymptote'],
  ['3x/(x^2 - 4)', 'Odd rational function'],
  ['(x^2 + 1)/(x - 1)', 'Slant asymptote'],
  ['(x^3 - 8)/(x - 2)', 'Cancels to a parabola with a hole'],
];

let graph;
const state = { result: null, predict: false, solved: new Set(), graphShown: false };

// ---------- input ----------

function updatePreview() {
  const pv = $('preview');
  const src = $('expr').value;
  try {
    const { node, v, name } = readFunction(src);
    pv.className = 'preview';
    pv.innerHTML = M(`${name}(${v}) = ${toTex(node)}`, true);
  } catch (e) {
    pv.className = src.trim() ? 'preview bad' : 'preview';
    pv.innerHTML = src.trim() ? esc(e.message) : '<span class="hint-text">Your function will appear here as you type.</span>';
  }
}

function insertAtCursor(text, close = '') {
  const el = $('expr');
  const s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? el.value.length;
  const sel = el.value.slice(s, e);
  el.value = el.value.slice(0, s) + text + sel + close + el.value.slice(e);
  const pos = s + text.length + sel.length + (sel ? close.length : 0);
  el.focus();
  el.setSelectionRange(pos, pos);
  updatePreview();
}

// ---------- main ----------

function compute() {
  $('error').hidden = true;
  try {
    const r = analyzeFunction($('expr').value);
    state.result = r;
    state.solved = new Set();
    state.graphShown = false;
    render();
  } catch (e) {
    console.error(e);
    $('error').textContent = e.message || String(e);
    $('error').hidden = false;
    $('results').hidden = true;
  }
}

function render() {
  const r = state.result;
  if (!r) return;
  $('results').hidden = false;
  $('results').classList.toggle('predicting', state.predict);
  renderFeatures(r);
  renderGraph(r);
  updateScore();
}

function renderFeatures(r) {
  $('features').innerHTML = r.features.map((f, i) => {
    const solved = state.solved.has(f.id);
    const hide = state.predict && f.predict && !solved;
    return `<section class="feature${solved ? ' solved' : ''}" data-id="${f.id}">
      <div class="feat-head"><span class="num">${i + 1}</span><h3>${esc(f.title)}</h3></div>
      ${hide ? predictBox(f) : `<div class="feat-answer">${md(multPending(f) ? f.shortAnswer : f.answer)}</div>`}
      ${hide ? '' : zerosTable(f, r)}
      <details class="feat-steps"${hide || multPending(f) ? ' hidden' : ''}><summary>Explanation and steps</summary>
        <p class="intro">${md(f.intro)}</p>
        <ol>${f.steps.map(s => `<li>${md(s)}</li>`).join('')}</ol>
      </details>
    </section>`;
  }).join('');
  syncExpandButton();
}

const multPending = f => f.id === 'zeros' && state.predict && f.predict.zeros.length && !state.solved.has('zeros-mult');

// In Predict mode the zeros card asks for multiplicity and behavior once the zeros are found.
function zerosTable(f, r) {
  if (f.id !== 'zeros' || !state.predict || !f.predict.zeros.length || state.solved.has('zeros-mult')) return '';
  const rows = f.predict.zeros.map((z, i) => `<tr data-i="${i}">
      <td>${M(`${r.v} = ${z.tex}`)}</td>
      <td><input type="text" class="mult" inputmode="numeric" aria-label="multiplicity"></td>
      <td><select class="beh" aria-label="behavior"><option value="">choose…</option><option value="crosses">crosses</option><option value="bounces">bounces (touches)</option><option value="flattens">crosses and flattens</option></select></td>
    </tr>`).join('');
  return `<div class="predict-box mult-box">
    <p>Now the multiplicity of each zero, and what the graph does there:</p>
    <div class="table-wrap"><table class="signs"><tr><th>zero</th><th>multiplicity</th><th>at the x-axis the graph…</th></tr>${rows}</table></div>
    <div class="row-actions"><button class="primary" data-act="check-mult">Check</button><button data-act="reveal-mult">Show answer</button></div>
    <div class="feedback" aria-live="polite"></div>
  </div>`;
}

function predictBox(f) {
  const p = f.predict;
  let field;
  if (p.kind === 'choice') {
    field = `<select class="answer"><option value="">choose…</option>${p.options.map(o => `<option value="${o}">${o}</option>`).join('')}</select>`;
  } else if (p.kind === 'end') {
    const opts = '<option value="">choose…</option><option value="up">rises (→ ∞)</option><option value="down">falls (→ −∞)</option><option value="level">levels off at a number</option>';
    field = `<div class="end-fields"><label>Left end (x → −∞): <select class="answer-left">${opts}</select></label>
      <label>Right end (x → ∞): <select class="answer-right">${opts}</select></label></div>`;
  } else {
    field = `<input type="text" class="answer" autocomplete="off" spellcheck="false" autocapitalize="off">`;
  }
  return `<div class="predict-box">
    <p>${p.prompt}</p>
    ${field}
    <div class="row-actions"><button class="primary" data-act="check">Check</button><button data-act="reveal">Show answer</button></div>
    <div class="feedback" aria-live="polite"></div>
  </div>`;
}

function renderGraph(r) {
  const d = r.data;
  const cover = state.predict && !state.graphShown;
  $('graph-cover').hidden = !cover;
  $('graph-body').hidden = cover;
  graph.set({
    f: r.f, v: r.v, name: r.name,
    vas: d.vas.map(a => a.x),
    holes: d.holes || [],
    zeros: d.zeros.map(z => z.x),
    yint: d.yint ? d.yint.y : null,
    ha: d.ha ? d.ha.val : null,
    slant: d.slant ? d.slant.coefs : null,
    turning: d.turning,
  });
}

function updateScore() {
  const box = $('score');
  const r = state.result;
  if (!state.predict || !r) { box.hidden = true; return; }
  const total = r.features.filter(f => f.predict).length;
  const right = r.features.filter(f => f.predict && state.solved.has(f.id) && !state.revealed?.has(f.id)).length;
  box.hidden = false;
  box.textContent = `${right} of ${total} right`;
}

// ---------- checking predictions ----------

const NONE = /^\s*(none|no|n\/?a|dne|ø|∅|nothing|no\s+\w+)\s*\.?\s*$/i;
const TOL = 0.011;
const close = (a, b) => (a === b) || Math.abs(a - b) <= TOL * Math.max(1, Math.abs(b) / 10);

function readNum(str) {
  const s = str.trim().replace(/^[a-z]\s*=\s*/i, '');
  if (!s) throw new Error('empty');
  const node = simplify(parse(s));
  if (freeSyms(node).size) throw new Error(`"${str.trim()}" should be a number`);
  const v = compile(node)({});
  if (!isFinite(v)) throw new Error(`"${str.trim()}" should be a number`);
  return v;
}

// Split on commas that are not inside parentheses or brackets.
function splitTop(s, seps = ',;') {
  const out = [];
  let depth = 0, cur = '';
  for (const c of s) {
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (depth === 0 && seps.includes(c)) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}

function readList(str) {
  if (NONE.test(str)) return [];
  return splitTop(str.replace(/\band\b/gi, ',')).map(readNum);
}

function sameSet(got, want) {
  if (got.length !== want.length) return false;
  const left = want.slice();
  for (const g of got) {
    const i = left.findIndex(w => close(g, w));
    if (i < 0) return false;
    left.splice(i, 1);
  }
  return true;
}

function readPoints(str) {
  if (NONE.test(str)) return [];
  return splitTop(str).map(p => {
    const m = /^\(\s*(.*)\s*\)$/.exec(p);
    if (!m) throw new Error('Write each hole as a point, like (2, 4).');
    const parts = splitTop(m[1], ',');
    if (parts.length !== 2) throw new Error('Write each hole as a point, like (2, 4).');
    return parts.map(readNum);
  });
}

// "(-inf, 2) U [3, inf)", "all real numbers", "{5}"
function readRange(str) {
  const s = str.replace(/∞|infinity|inf/gi, 'I').replace(/−/g, '-');
  if (/^\s*(all\s+real(\s+numbers)?|r|ℝ|reals)\s*$/i.test(s)) return [{ lo: -Infinity, hi: Infinity, loClosed: false, hiClosed: false }];
  const pieces = s.split(/\s*(?:∪|\bu\b|\bor\b)\s*/i).filter(Boolean);
  return pieces.map(p => {
    p = p.trim();
    const set = /^\{(.*)\}$/.exec(p);
    if (set) { const v = readNum(set[1]); return { lo: v, hi: v, loClosed: true, hiClosed: true }; }
    const m = /^([[(])(.*)([\])])$/.exec(p);
    if (!m) throw new Error('Use interval notation, like (-inf, 2) U [3, inf).');
    const parts = splitTop(m[2], ',');
    if (parts.length !== 2) throw new Error('Each interval needs two endpoints, like [0, inf).');
    const end = t => (/^\+?I$/i.test(t) ? Infinity : /^-I$/i.test(t) ? -Infinity : readNum(t));
    return { lo: end(parts[0]), hi: end(parts[1]), loClosed: m[1] === '[', hiClosed: m[3] === ']' };
  });
}

function sameRange(got, want) {
  if (got.length !== want.length) return 'count';
  const g = got.slice().sort((a, b) => a.lo - b.lo);
  for (let i = 0; i < g.length; i++) {
    const a = g[i], b = want[i];
    if (!close(a.lo, b.lo) || !close(a.hi, b.hi)) return 'ends';
    if ((isFinite(b.lo) && a.loClosed !== b.loClosed) || (isFinite(b.hi) && a.hiClosed !== b.hiClosed)) return 'brackets';
    if ((!isFinite(b.lo) && a.loClosed) || (!isFinite(b.hi) && a.hiClosed)) return 'inf';
  }
  return 'ok';
}

function checkFeature(f, box) {
  const p = f.predict;
  const input = box.querySelector('.answer');
  const val = input ? input.value : '';
  switch (p.kind) {
    case 'list': {
      const got = readList(val);
      if (sameSet(got, p.values)) return { ok: true };
      if (got.length !== p.values.length) return { ok: false, msg: `Not quite. ${p.values.length ? `There ${p.values.length === 1 ? 'is 1 value' : `are ${p.values.length} values`}.` : 'Check again: maybe there are none.'}` };
      return { ok: false, msg: 'Not quite. Check your factoring and try again.' };
    }
    case 'zeros': {
      const got = readList(val);
      if (sameSet(got, p.values)) return { ok: true };
      return { ok: false, msg: got.length !== p.values.length
        ? `Not quite. ${p.values.length ? `There ${p.values.length === 1 ? 'is 1 real zero' : `are ${p.values.length} real zeros`} (don't count repeats).` : 'Check again: maybe there are no real zeros.'}`
        : 'Not quite. Remember: zeros come from the simplified numerator.' };
    }
    case 'points': {
      const got = readPoints(val);
      const want = p.points;
      const ok = got.length === want.length && want.every(w => got.some(g => close(g[0], w[0]) && close(g[1], w[1])));
      if (ok) return { ok: true };
      if (got.length === want.length && want.every(w => got.some(g => close(g[0], w[0]))))
        return { ok: false, msg: 'The x-values are right. Check the y-values: plug x into the simplified function.' };
      return { ok: false, msg: want.length ? 'Not quite. Look for a factor that cancels from the top and bottom.' : 'Not quite. Check again: is there any factor that cancels?' };
    }
    case 'number': {
      if (NONE.test(val)) return p.value === null ? { ok: true } : { ok: false, msg: 'There is one. Try again.' };
      const v = readNum(val);
      if (p.value === null) return { ok: false, msg: 'Not quite. Check again: maybe there is none.' };
      return close(v, p.value) ? { ok: true } : { ok: false, msg: 'Not quite. Try again.' };
    }
    case 'line': {
      if (NONE.test(val)) return p.coefs === null ? { ok: true } : { ok: false, msg: 'There is one. Use long division.' };
      if (p.coefs === null) return { ok: false, msg: 'Not quite. Compare the degrees of the top and bottom.' };
      const node = simplify(parse(val.replace(/^\s*y\s*=/i, '')));
      const fn = compile(node), v = state.result.v;
      const ok = [0, 1, 2].every(x => close(fn({ [v]: x }), p.coefs[0] + (p.coefs[1] || 0) * x));
      return ok ? { ok: true } : { ok: false, msg: 'Not quite. Divide the top by the bottom; the quotient (without the remainder) is the line.' };
    }
    case 'choice': {
      if (!input.value) return { ok: false, msg: 'Choose an answer first.' };
      return input.value === p.value ? { ok: true } : { ok: false, msg: 'Not quite. Find f(−x) and compare it with f(x) and −f(x).' };
    }
    case 'end': {
      const L = box.querySelector('.answer-left').value, R = box.querySelector('.answer-right').value;
      if (!L || !R) return { ok: false, msg: 'Choose both ends first.' };
      const okL = L === p.left, okR = R === p.right;
      if (okL && okR) return { ok: true };
      return { ok: false, msg: `${okL ? 'The left end is right' : 'The left end is not right'}; ${okR ? 'the right end is right' : 'the right end is not right'}.` };
    }
    case 'range': {
      const res = sameRange(readRange(val), p.intervals);
      if (res === 'ok') return { ok: true };
      return { ok: false, msg: {
        count: 'Not quite. Check how many separate pieces the range has.',
        ends: 'Not quite. Check the endpoints.',
        brackets: 'Close! Check your brackets: use [ ] when the value is reached and ( ) when it isn\'t.',
        inf: 'Close! ∞ always gets a parenthesis, never a bracket.',
      }[res] };
    }
  }
  return { ok: false, msg: '' };
}

function onCheck(sec, reveal) {
  const r = state.result;
  const f = r.features.find(x => x.id === sec.dataset.id);
  const box = sec.querySelector('.predict-box');
  const fb = box.querySelector('.feedback');
  if (reveal) {
    state.revealed = state.revealed || new Set();
    state.revealed.add(f.id);
    state.solved.add(f.id);
    renderFeatures(r); updateScore();
    return;
  }
  let res;
  try { res = checkFeature(f, box); } catch (e) {
    res = { ok: false, msg: e.message === 'empty' ? 'Type an answer first (or "none").' : `I couldn't read that: ${e.message}` };
  }
  if (res.ok) {
    state.solved.add(f.id);
    renderFeatures(r); updateScore();
    const again = $('features').querySelector(`[data-id="${f.id}"]`);
    again.classList.add('just-right');
    again.querySelector('.feat-answer').insertAdjacentHTML('afterbegin', '<span class="tag ok">Correct!</span> ');
    return;
  }
  fb.className = 'feedback bad';
  fb.textContent = res.msg;
}

function onCheckMult(sec, reveal) {
  const r = state.result;
  const f = r.features.find(x => x.id === 'zeros');
  const box = sec.querySelector('.mult-box');
  if (reveal) { state.solved.add('zeros-mult'); renderFeatures(r); return; }
  let allOk = true;
  box.querySelectorAll('tr[data-i]').forEach(tr => {
    const z = f.predict.zeros[+tr.dataset.i];
    const m = tr.querySelector('.mult'), b = tr.querySelector('.beh');
    const okM = +m.value.trim() === z.mult, okB = b.value === z.behavior;
    m.classList.toggle('right', okM); m.classList.toggle('wrong', !okM);
    b.classList.toggle('right', okB); b.classList.toggle('wrong', !okB);
    allOk = allOk && okM && okB;
  });
  const fb = box.querySelector('.feedback');
  if (allOk) { state.solved.add('zeros-mult'); renderFeatures(r); return; }
  fb.className = 'feedback bad';
  fb.textContent = 'Some are not right yet (marked in red). Count how many times each factor appears.';
}

function syncExpandButton() {
  const all = [...$('features').querySelectorAll('details.feat-steps:not([hidden])')];
  $('expand-all').textContent = all.length && all.every(d => d.open) ? 'Hide all steps' : 'Show all steps';
}

// ---------- events ----------

function init() {
  graph = new Graph($('graph'), $('readout'));

  $('examples').innerHTML = '<option value="">Choose an example…</option>' +
    EXAMPLES.map(([e, d], i) => `<option value="${i}">${esc(d)}:  ${esc(e)}</option>`).join('');
  $('examples').addEventListener('change', ev => {
    const ex = EXAMPLES[ev.target.value];
    if (!ex) return;
    $('expr').value = ex[0];
    updatePreview();
    compute();
  });

  $('expr').addEventListener('input', updatePreview);
  $('expr').addEventListener('keydown', e => { if (e.key === 'Enter') compute(); });
  $('go').addEventListener('click', compute);
  $('keypad').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) insertAtCursor(b.dataset.insert, b.dataset.close || '');
  });

  $('predict').addEventListener('change', e => {
    state.predict = e.target.checked;
    state.solved = new Set();
    state.revealed = new Set();
    state.graphShown = false;
    $('predict-hint').hidden = !state.predict;
    render();
  });

  $('features').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const sec = b.closest('.feature');
    if (b.dataset.act === 'check') onCheck(sec, false);
    if (b.dataset.act === 'reveal') onCheck(sec, true);
    if (b.dataset.act === 'check-mult') onCheckMult(sec, false);
    if (b.dataset.act === 'reveal-mult') onCheckMult(sec, true);
  });
  $('features').addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.matches('input')) return;
    const sec = e.target.closest('.feature');
    if (e.target.matches('.answer')) onCheck(sec, false);
    else onCheckMult(sec, false);
  });
  $('features').addEventListener('toggle', e => { if (e.target.matches('details.feat-steps')) syncExpandButton(); }, true);
  $('expand-all').addEventListener('click', () => {
    const all = [...$('features').querySelectorAll('details.feat-steps:not([hidden])')];
    const open = !all.every(d => d.open);
    all.forEach(d => { d.open = open; });
    syncExpandButton();
  });

  $('show-graph').addEventListener('click', () => {
    state.graphShown = true;
    $('graph-cover').hidden = true;
    $('graph-body').hidden = false;
    graph.draw();
  });
  $('zoom-in').addEventListener('click', () => graph.zoom(1 / 1.4));
  $('zoom-out').addEventListener('click', () => graph.zoom(1.4));
  $('zoom-reset').addEventListener('click', () => graph.reset());
  $('show-asym').addEventListener('change', e => { graph.showAsymptotes = e.target.checked; graph.draw(); });
  $('show-labels').addEventListener('change', e => { graph.showLabels = e.target.checked; graph.draw(); });

  $('expr').value = '(x^2 - x - 6)/(x^2 - 9)';
  updatePreview();
  compute();
}

init();
