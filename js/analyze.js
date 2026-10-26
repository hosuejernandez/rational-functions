// Every feature of a polynomial or rational function f = N/D, with the steps a precalc
// student would write. Step and answer strings use $...$ around math (LaTeX); the page
// renders them with KaTeX.
import { parse, toTex, num, sym, mul, pow, HALF, substitute, freeSyms, rdiv, rmul, isZero, symTex } from './expr.js';
import { simplify, setMainVar } from './simplify.js';
import {
  toRational, toRationalRaw, polyToNode, factorPolynomial, realRoots, numericPolyRoots, recognize, fmt,
  trim, deg, lead, padd, pmul, pscale, pdivmod, pgcd, pderiv, pevalR, gcd,
} from './solve.js';

const R0 = num(0), R1 = num(1);
const rneg = r => num(-r.n, r.d);
const rval = r => r.n / r.d;
const pevalF = (p, x) => p.reduceRight((a, c) => a * x + c.n / c.d, 0);
const near = (a, b) => Math.abs(a - b) < 1e-9 * (1 + Math.abs(a) + Math.abs(b));
const INF = '\\infty';

// ---------- reading the input ----------

// "f(x) = ...", "y = ..." or just the expression.
export function readFunction(src) {
  let name = 'f', body = src, arg = null;
  const named = /^\s*([a-zA-Z])\s*\(\s*([a-zA-Z])\s*\)\s*=(.*)$/.exec(src);
  const yEq = /^\s*y\s*=(.*)$/.exec(src);
  if (named) { name = named[1]; arg = named[2]; body = named[3]; }
  else if (yEq) body = yEq[1];
  const node = parse(body);
  if (node.type === 'eq') throw new Error('Type one function, like (x^2 - 4)/(x - 2), with at most one "=" sign at the front.');
  const letters = [...freeSyms(node)];
  if (letters.length > 1) throw new Error(`This uses more than one letter (${letters.join(', ')}). Use just one variable, like x.`);
  const v = arg || letters[0] || 'x';
  if (letters.length === 1 && letters[0] !== v) throw new Error(`The function is named ${name}(${v}) but uses the letter ${letters[0]}.`);
  return { node, v, name };
}

// ---------- small helpers ----------

// Clear fractions and common factors so N and D have integer coefficients and D leads positive.
function integerize(N, D) {
  let L = 1;
  for (const c of [...N, ...D]) L = L / gcd(L, c.d) * c.d;
  let G = 0;
  for (const c of [...N, ...D]) G = gcd(G, c.n * (L / c.d));
  if (lead(D).n < 0) G = -G;
  const s = num(L, G || 1);
  return { N: pscale(N, s), D: pscale(D, s) };
}

// Factored node: 3(x - 1)(x + 1), 2(x - 2), x^2 + 1.
function factored(p, v) {
  p = trim(p);
  if (deg(p) === 1 && p.every(c => c.d === 1)) {
    const g = gcd(p[0].n, p[1].n);
    if (g > 1) return simplify(mul([num(g), polyToNode(pscale(p, num(1, g)), v)]));
  }
  return factorPolynomial(p, v) || polyToNode(p, v);
}

const isConstOne = p => deg(p) === 0 && rval(p[0]) === 1;
function fracTex(N, D, v) {
  const n = toTex(factored(N, v));
  return isConstOne(D) ? n : `\\frac{${n}}{${toTex(factored(D, v))}}`;
}
function expandedTex(N, D, v) {
  const n = toTex(polyToNode(N, v));
  return isConstOne(D) ? n : `\\frac{${n}}{${toTex(polyToNode(D, v))}}`;
}

// Real roots with multiplicity (Yun's square-free decomposition, then the roots of each part).
export function rootsWithMult(p) {
  p = trim(p);
  const out = [];
  if (deg(p) < 1) return out;
  let a = pgcd(p, pderiv(p));
  let b = pdivmod(p, a)[0];
  let c = pdivmod(pderiv(p), a)[0];
  let d = padd(c, pscale(pderiv(b), num(-1)));
  for (let i = 1; deg(b) > 0 && i <= 60; i++) {
    a = pgcd(b, d);
    for (const r of realRoots(a)) out.push({ ...r, mult: i });
    b = pdivmod(b, a)[0];
    c = pdivmod(d, a)[0];
    d = padd(c, pscale(pderiv(b), num(-1)));
  }
  return out.sort((x, y) => x.x - y.x);
}

// A number for display: exact fraction or root when it is one, otherwise a rounded decimal.
function niceNum(x) {
  const r = recognize(x);
  return r ? { val: r.x, tex: r.tex, exact: true } : { val: x, tex: `${fmt(x)}`, exact: false };
}
const eqs = r => (r.exact ? `= ${r.tex}` : `\\approx ${r.tex}`);
const approxTex = n => (n.exact ? n.tex : `\\approx ${n.tex}`);

// Value of N/D at a root found by realRoots: exact when the root is a fraction.
function valueAt(N, D, root) {
  if (root.node && root.node.type === 'num') {
    const y = rdiv(pevalR(N, root.node), pevalR(D, root.node));
    return { val: rval(y), tex: toTex(y), exact: true, r: y };
  }
  return niceNum(pevalF(N, root.x) / pevalF(D, root.x));
}

const word = k => ['zero', 'one', 'two', 'three', 'four', 'five', 'six'][k] || `${k}`;
const andList = xs => (xs.length <= 1 ? xs.join('') : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(', ')}, and ${xs[xs.length - 1]}`);
const pt = (a, b) => `(${a}, ${b})`;

// Interval notation for the domain with the excluded x-values removed.
function domainTex(xs) {
  if (!xs.length) return `(-${INF}, ${INF})`;
  const pts = [`-${INF}`, ...xs.map(e => e.tex), INF];
  const parts = [];
  for (let i = 0; i + 1 < pts.length; i++) parts.push(`(${pts[i]}, ${pts[i + 1]})`);
  return parts.join(' \\cup ');
}

// ---------- main analysis ----------

export function analyzeFunction(src) {
  const { node, v, name } = readFunction(src);
  setMainVar(v);
  const raw = toRationalRaw(node, v);
  if (!raw) throw new Error('This page handles polynomials and rational functions: sums, products and quotients of powers of x with whole-number exponents. (No square roots, trig, logs, or e.)');
  const red = toRational(node, v);
  if (deg(red.N) === -Infinity) throw new Error(`That simplifies to ${name}(${v}) = 0, which is 0 everywhere. Try a function with ${v} in it.`);

  const V = symTex(v);
  const F = `${name}(${V})`;
  const at = x => `${name}\\left(${x}\\right)`;
  const { N: N0, D: D0 } = integerize(raw.N, raw.D);
  const { N, D } = integerize(red.N, red.D);
  const isPoly = deg(D) === 0 && deg(raw.X) <= 0;
  const fF = x => pevalF(N, x) / pevalF(D, x);

  // excluded x-values: holes where the reduced denominator is not 0, vertical asymptotes where it is
  const excluded = realRoots(raw.X).map(r => {
    const zeroD = r.node && r.node.type === 'num' ? isZero(pevalR(D, r.node)) : Math.abs(pevalF(D, r.x)) < 1e-9;
    return { ...r, kind: zeroD ? 'va' : 'hole' };
  });
  const isExcluded = x => excluded.some(e => near(e.x, x));
  const holes = excluded.filter(e => e.kind === 'hole').map(h => ({ ...h, y: valueAt(N, D, h) }));
  const vaRoots = rootsWithMult(D);
  const zeroRoots = rootsWithMult(N);

  // spacing for "just left / just right" test values
  const specials = [...excluded, ...zeroRoots, ...vaRoots].map(r => r.x).sort((a, b) => a - b);
  const stepNear = x => {
    let gap = Infinity;
    for (const s of specials) if (!near(s, x)) gap = Math.min(gap, Math.abs(s - x));
    return Math.min(0.01, gap / 4);
  };
  const sideSign = (x, side) => Math.sign(fF(x + (side === 'right' ? 1 : -1) * stepNear(x)));

  const n = deg(N), m = deg(D), lc = rdiv(lead(N), lead(D)), k = n - m;
  const lcSign = Math.sign(lc.n);
  const endR = k > 0 ? { inf: lcSign } : { val: k === 0 ? rval(lc) : 0, tex: k === 0 ? toTex(lc) : '0' };
  const endL = k > 0 ? { inf: lcSign * (k % 2 ? -1 : 1) } : endR;

  const features = [];
  const data = { v, name, isPoly, excluded: excluded.map(e => e.x) };

  // 1. simplify and factor
  {
    const steps = [];
    const common = pgcd(N0, D0);
    if (isPoly) {
      steps.push(`Standard form: $${F} = ${toTex(polyToNode(N, v))}$`);
      const fac = toTex(factored(N, v));
      steps.push(fac === toTex(polyToNode(N, v))
        ? 'It does not factor any further using whole numbers or fractions.'
        : `Factored form: $${F} = ${fac}$`);
      steps.push('This is a polynomial: no denominator, so no holes and no asymptotes.');
    } else {
      steps.push(`Write it as one fraction: $${F} = ${expandedTex(N0, D0, v)}$`);
      steps.push(`Factor the top and the bottom: $${F} = ${fracTex(N0, D0, v)}$`);
      if (deg(common) > 0) {
        steps.push(`The top and bottom share the factor $${toTex(factored(common, v))}$. Cancel it:`);
        steps.push(`$${F} = ${fracTex(N, D, v)}$ (for every $${V}$ in the domain)`);
      } else steps.push('The top and bottom share no factors, so nothing cancels.');
    }
    features.push({
      id: 'form', title: isPoly ? 'Standard and factored form' : 'Simplify and factor',
      answer: `$${F} = ${fracTex(N, D, v)}$`, steps, predict: null,
    });
    data.factoredTex = fracTex(N, D, v);
  }

  // 2. domain
  {
    const steps = [];
    let answer;
    if (!excluded.length) {
      steps.push(isPoly
        ? 'A polynomial has no denominator, so every real number is allowed.'
        : `Set the denominator equal to 0: $${toTex(factored(D0, v))} = 0$. It has no real solutions, so the denominator is never 0.`);
      answer = `$(-${INF}, ${INF})$`;
    } else {
      steps.push(`Use the <b>original</b> denominator (before canceling anything). Set it equal to 0: $${toTex(factored(D0, v))} = 0$`);
      steps.push(`Solve: $${excluded.map(e => `${V} = ${e.tex}`).join(',\\ ')}$`);
      steps.push(`These make the function undefined, so leave them out: $\\{${V} \\mid ${V} \\neq ${excluded.map(e => e.tex).join(', ')}\\}$`);
      answer = `$${domainTex(excluded)}$`;
    }
    features.push({
      id: 'domain', title: 'Domain', answer, steps,
      predict: { kind: 'list', prompt: `Which ${v}-values are <b>not</b> in the domain? Separate with commas, or type none.`, values: excluded.map(e => e.x) },
    });
    data.domainTex = answer;
  }

  // 3. holes
  if (!isPoly) {
    const steps = [];
    const common = pgcd(N0, D0);
    if (deg(common) <= 0) steps.push('The numerator and denominator share no factors, so there are no holes.');
    else {
      steps.push(`Common factor of the top and bottom: $${toTex(factored(common, v))}$`);
      for (const e of excluded) {
        if (!(e.node ? isZero(pevalR(common, e.node)) : Math.abs(pevalF(common, e.x)) < 1e-9)) continue;
        if (e.kind === 'hole') {
          const h = holes.find(q => near(q.x, e.x));
          steps.push(`It cancels completely at $${V} = ${e.tex}$. Plug $${V} = ${e.tex}$ into the simplified function: $${at(e.tex)} = ${approxTex(h.y)}$. Hole at $${pt(e.tex, h.y.tex)}$.`);
        } else {
          steps.push(`After canceling, $${V} = ${e.tex}$ still makes the denominator 0, so it is a vertical asymptote, not a hole.`);
        }
      }
    }
    features.push({
      id: 'holes', title: 'Holes',
      answer: holes.length ? holes.map(h => `$${pt(h.tex, h.y.tex)}$`).join(', ') : 'None',
      steps,
      predict: { kind: 'points', prompt: 'Holes as points, like (2, 4). Separate with commas, or type none.', points: holes.map(h => [h.x, h.y.val]) },
    });
    data.holes = holes.map(h => ({ x: h.x, y: h.y.val, tex: pt(h.tex, h.y.tex) }));
  }

  // 4. vertical asymptotes
  const vas = vaRoots.map(r => ({ ...r, left: sideSign(r.x, 'left'), right: sideSign(r.x, 'right') }));
  if (!isPoly) {
    const steps = [];
    if (deg(D) === 0) steps.push('After canceling, no denominator is left, so there are no vertical asymptotes.');
    else if (!vas.length) steps.push(`The simplified denominator $${toTex(factored(D, v))}$ is never 0, so there are no vertical asymptotes.`);
    else {
      steps.push(`Set the <b>simplified</b> denominator equal to 0: $${toTex(factored(D, v))} = 0$`);
      for (const a of vas) {
        const h = stepNear(a.x);
        const L = a.x - h, Rr = a.x + h;
        const odd = a.mult % 2 === 1;
        const lim = s => (s > 0 ? INF : `-${INF}`);
        steps.push(`$${V} ${eqs(a)}$ (multiplicity ${a.mult}, ${odd ? 'odd: the two sides go in <b>opposite</b> directions' : 'even: both sides go the <b>same</b> direction'})`);
        steps.push(`&nbsp;&nbsp;Just left: $${at(fmt(L))} \\approx ${fmt(fF(L))}$, so $${F} \\to ${lim(a.left)}$ as $${V} \\to ${a.tex}^-$`);
        steps.push(`&nbsp;&nbsp;Just right: $${at(fmt(Rr))} \\approx ${fmt(fF(Rr))}$, so $${F} \\to ${lim(a.right)}$ as $${V} \\to ${a.tex}^+$`);
      }
    }
    features.push({
      id: 'va', title: 'Vertical asymptotes',
      answer: vas.length ? vas.map(a => `$${V} ${eqs(a)}$`).join(', ') : 'None',
      steps,
      predict: { kind: 'list', prompt: `Vertical asymptotes: ${v} = ? Separate with commas, or type none.`, values: vas.map(a => a.x) },
    });
  }
  data.vas = vas.map(a => ({ x: a.x, tex: a.tex, mult: a.mult, left: a.left, right: a.right }));

  // 5. y-intercept
  {
    const steps = [];
    const shown = toTex(substitute(node, { [v]: sym('0') }));
    let answer, value = null;
    const ex = excluded.find(e => near(e.x, 0));
    if (ex) {
      steps.push(`Set $${V} = 0$: $${at(0)} = ${shown}$, which divides by 0.`);
      steps.push(ex.kind === 'hole'
        ? `$${V} = 0$ is a hole, so the graph never touches the $y$-axis.`
        : `$${V} = 0$ is a vertical asymptote (the $y$-axis itself), so there is no $y$-intercept.`);
      answer = 'None';
    } else {
      const y = rdiv(pevalR(N0, R0), pevalR(D0, R0));
      value = rval(y);
      steps.push(`Set $${V} = 0$: $${at(0)} = ${shown}$`);
      steps.push(`$${at(0)} = ${toTex(y)}$`);
      answer = `$${pt(0, toTex(y))}$`;
      data.yint = { y: value, tex: toTex(y) };
    }
    features.push({
      id: 'yint', title: 'y-intercept', answer, steps,
      predict: { kind: 'number', prompt: 'y-intercept: y = ? (or type none)', value },
    });
  }

  // 6. zeros with multiplicity
  const zeros = zeroRoots.filter(z => !isExcluded(z.x)).map(z => ({
    ...z, behavior: z.mult % 2 === 0 ? 'bounces' : z.mult === 1 ? 'crosses' : 'flattens',
  }));
  {
    const steps = [];
    const top = isPoly ? 'Set the function' : 'Set the <b>simplified</b> numerator';
    if (deg(N) <= 0) steps.push(`The numerator is the constant $${toTex(N[0])}$, which is never 0, so there are no zeros.`);
    else {
      steps.push(`${top} equal to 0: $${toTex(factored(N, v))} = 0$`);
      if (!zeroRoots.length) steps.push('This has no real solutions, so the graph never touches the $x$-axis.');
      for (const z of zeroRoots) {
        if (isExcluded(z.x)) { steps.push(`$${V} = ${z.tex}$ would be a zero, but it is not in the domain (it is a hole).`); continue; }
        const zz = zeros.find(q => near(q.x, z.x));
        const how = !z.exact ? ' (found numerically)' : '';
        steps.push(`$${V} ${eqs(z)}$${how}: multiplicity ${z.mult} → ${BEHAVIOR_TEXT[zz.behavior]}`);
      }
      if (zeros.length) steps.push('Rule: multiplicity 1 crosses straight through; an even multiplicity touches and turns back (bounces); an odd multiplicity of 3 or more crosses but flattens out like $x^3$.');
    }
    features.push({
      id: 'zeros', title: 'Zeros (x-intercepts) and multiplicity',
      shortAnswer: zeros.length ? zeros.map(z => `$${V} ${eqs(z)}$`).join(', ') : 'None',
      answer: zeros.length ? zeros.map(z => `$${V} ${eqs(z)}$ (mult. ${z.mult}, ${z.behavior})`).join('; ') : 'None',
      steps,
      predict: {
        kind: 'zeros', prompt: `Zeros: ${v} = ? Separate with commas, or type none.`,
        values: zeros.map(z => z.x), zeros: zeros.map(z => ({ x: z.x, tex: z.tex, mult: z.mult, behavior: z.behavior })),
      },
    });
  }
  data.zeros = zeros.map(z => ({ x: z.x, tex: z.tex, mult: z.mult, behavior: z.behavior }));

  // 7. even / odd / neither
  {
    const flip = p => p.map((c, i) => (i % 2 ? rneg(c) : c));
    let Nm = flip(N), Dm = flip(D);
    if (lead(Dm).n < 0) { Nm = pscale(Nm, num(-1)); Dm = pscale(Dm, num(-1)); }
    const same = (a, b) => { const d = padd(a, pscale(b, num(-1))); return deg(d) === -Infinity; };
    const evenAlg = same(pmul(Nm, D), pmul(N, Dm));
    const oddAlg = same(pmul(Nm, D), pscale(pmul(N, Dm), num(-1)));
    const symmetric = excluded.every(e => isExcluded(-e.x));
    const parity = symmetric && evenAlg ? 'even' : symmetric && oddAlg ? 'odd' : 'neither';
    const steps = [];
    const shown = toTex(substitute(node, { [v]: sym(`(-${V})`) }));
    steps.push(`Replace $${V}$ with $-${V}$: $${at(`-${V}`)} = ${shown}$`);
    steps.push(`Simplify: $${at(`-${V}`)} = ${fracTex(Nm, Dm, v)}$`);
    if (evenAlg) steps.push(`This is the same as $${F}$.`);
    else if (oddAlg) steps.push(`This is the opposite of $${F}$: $${at(`-${V}`)} = -${F}$.`);
    else steps.push(`This is neither $${F}$ nor $-${F}$.`);
    if ((evenAlg || oddAlg) && !symmetric) steps.push(`But the domain is not symmetric (it leaves out $${V} = ${excluded.filter(e => !isExcluded(-e.x)).map(e => e.tex).join(', ')}$ without leaving out the opposite value), so the function is neither.`);
    if (isPoly && parity !== 'neither') steps.push(`Shortcut for polynomials: every power of $${V}$ is ${parity === 'even' ? 'even (a constant counts as $x^0$)' : 'odd'}.`);
    steps.push(parity === 'even' ? 'Even: the graph is symmetric about the $y$-axis.'
      : parity === 'odd' ? 'Odd: the graph is symmetric about the origin (turn it 180° and it looks the same).'
        : 'Neither: no $y$-axis or origin symmetry.');
    features.push({
      id: 'parity', title: 'Even, odd, or neither', answer: parity[0].toUpperCase() + parity.slice(1), steps,
      predict: { kind: 'choice', prompt: 'Is the function even, odd, or neither?', options: ['even', 'odd', 'neither'], value: parity },
    });
    data.parity = parity;
  }

  // 8. end behavior
  {
    const steps = [];
    const word2 = e => (e.inf ? (e.inf > 0 ? INF : `-${INF}`) : e.tex);
    const ltN = toTex(simplify(mul([lead(N), pow(sym(v), num(n))])));
    if (m === 0) {
      if (!isPoly) steps.push(`After canceling, $${F} = ${toTex(polyToNode(N, v))}$ is a polynomial (with ${holes.length > 1 ? 'holes' : 'a hole'}), so it has polynomial end behavior.`);
      steps.push(`Leading term: $${ltN}$. Degree ${n} is ${n % 2 ? 'odd' : 'even'}, leading coefficient is ${lcSign > 0 ? 'positive' : 'negative'}.`);
      if (n === 0) steps.push(`A constant function stays at $y = ${toTex(N[0])}$ on both ends.`);
      else steps.push(n % 2
        ? `Odd degree: the ends go opposite ways. ${lcSign > 0 ? 'Positive: falls on the left, rises on the right.' : 'Negative: rises on the left, falls on the right.'}`
        : `Even degree: both ends go the same way. ${lcSign > 0 ? 'Positive: both ends rise.' : 'Negative: both ends fall.'}`);
    } else {
      const ltD = toTex(simplify(mul([lead(D), pow(sym(v), num(m))])));
      const ratio = toTex(simplify(mul([lc, pow(sym(v), num(k))])));
      const fr = `\\dfrac{${ltN}}{${ltD}}`;
      steps.push(`For very large $|${V}|$, only the leading terms matter: $${F} \\approx ${fr}${fr.replace('dfrac', 'frac') === ratio ? '' : ` = ${ratio}`}$`);
      if (k > 0) steps.push(`So the ends act like $y = ${ratio}$.`);
      else if (k === 0) steps.push(`So $${F}$ levels off toward $y = ${toTex(lc)}$ on both ends.`);
      else steps.push(`That goes to 0, so $${F}$ levels off toward $y = 0$ on both ends.`);
    }
    const answer = `As $${V} \\to -${INF}$, $${F} \\to ${word2(endL)}$; as $${V} \\to ${INF}$, $${F} \\to ${word2(endR)}$`;
    const dir = e => (e.inf ? (e.inf > 0 ? 'up' : 'down') : 'level');
    features.push({
      id: 'end', title: 'End behavior', answer, steps,
      predict: { kind: 'end', prompt: 'What does the graph do on each end?', left: dir(endL), right: dir(endR) },
    });
    data.end = { left: dir(endL), right: dir(endR) };
  }

  // 9. horizontal asymptote
  let ha = null;
  if (!isPoly) {
    const steps = [];
    if (m === 0) steps.push(`After canceling, $${F} = ${toTex(polyToNode(N, v))}$ is a polynomial, and polynomials have no horizontal asymptotes.`);
    else steps.push(`Compare degrees: top degree ${n}, bottom degree ${m}.`);
    if (m === 0) { /* nothing more to say */ } else if (k < 0) { ha = { val: 0, tex: '0' }; steps.push('Bottom is bigger: the fraction shrinks toward 0, so $y = 0$.'); }
    else if (k === 0) {
      ha = { val: rval(lc), tex: toTex(lc) };
      steps.push(`Same degree: divide the leading coefficients, $y = \\dfrac{${toTex(lead(N))}}{${toTex(lead(D))}} = ${toTex(lc)}$.`);
    } else steps.push('Top is bigger: the function grows without bound, so there is no horizontal asymptote.');
    features.push({
      id: 'ha', title: 'Horizontal asymptote', answer: ha ? `$y = ${ha.tex}$` : 'None', steps,
      predict: { kind: 'number', prompt: 'Horizontal asymptote: y = ? (or type none)', value: ha ? ha.val : null },
    });
  }
  data.ha = ha;

  // 10. slant asymptote
  data.slant = null;
  if (!isPoly) {
    const steps = [];
    let answer = 'None', coefs = null;
    if (m === 0) {
      steps.push(`After canceling, $${F} = ${toTex(polyToNode(N, v))}$ with ${holes.length > 1 ? 'holes' : 'a hole'}. The graph <b>is</b> that ${n === 1 ? 'line' : 'curve'}; it doesn't approach a line from the side, so there is no slant asymptote.`);
    } else if (k === 1) {
      const { q, r, lines } = longDivision(N, D, v);
      steps.push(`The top's degree is exactly one more than the bottom's, so divide: $(${toTex(polyToNode(N, v))}) \\div (${toTex(polyToNode(D, v))})$`);
      steps.push(...lines);
      const rem = deg(r) === -Infinity ? '' : ` + \\dfrac{${toTex(polyToNode(r, v))}}{${toTex(polyToNode(D, v))}}`;
      steps.push(`So $${F} = ${toTex(polyToNode(q, v))}${rem}$. The leftover fraction shrinks to 0 far out, so the graph approaches the line $y = ${toTex(polyToNode(q, v))}$.`);
      answer = `$y = ${toTex(polyToNode(q, v))}$`;
      coefs = q.map(rval);
      data.slant = { coefs, tex: toTex(polyToNode(q, v)) };
    } else if (k > 1) {
      const { q } = longDivision(N, D, v);
      steps.push(`The top's degree is ${k} more than the bottom's (not exactly 1), so there is no slant line.`);
      steps.push(`Dividing gives $${toTex(polyToNode(q, v))}$ plus a fraction that shrinks to 0, so far out the graph follows the curve $y = ${toTex(polyToNode(q, v))}$.`);
    } else steps.push(`A slant asymptote needs the top's degree to be exactly one more than the bottom's. Here it is ${n} vs. ${m}, so there is none.`);
    features.push({
      id: 'slant', title: 'Slant (oblique) asymptote', answer, steps,
      predict: { kind: 'line', prompt: 'Slant asymptote: y = ? (for example x + 1, or type none)', coefs },
    });
  }

  // 11. range
  {
    const r = rangeOf({ N, D, fF, vas, holes, endL, endR, isExcluded, excluded, v, isPoly, F });
    features.push({
      id: 'range', title: 'Range', answer: `$${r.tex}$`, steps: r.steps,
      predict: { kind: 'range', prompt: 'Range in interval notation, like (-inf, 2) U (2, inf) or [0, inf).', intervals: r.intervals },
    });
    data.range = r.intervals;
    data.rangeTex = r.tex;
    data.turning = r.turning;
  }

  return {
    v, name, F, inputTex: `${F} = ${toTex(node)}`, features, data, isPoly, f: fF,
  };
}

const BEHAVIOR_TEXT = {
  crosses: 'crosses the $x$-axis',
  bounces: 'touches the $x$-axis and bounces back',
  flattens: 'crosses the $x$-axis but flattens out there',
};

// ---------- long division ----------

function longDivision(N, D, v) {
  let r = trim(N);
  const q = Array(Math.max(1, deg(N) - deg(D) + 1)).fill(R0);
  const lines = [];
  const termTex = (c, e) => toTex(simplify(mul([c, pow(sym(v), num(e))])));
  const Dt = toTex(polyToNode(D, v));
  while (deg(r) >= deg(D) && deg(r) > -Infinity) {
    const e = deg(r) - deg(D), c = rdiv(lead(r), lead(D));
    q[e] = c;
    const mono = [...Array(e).fill(R0), c];
    const prod = pmul(D, mono);
    const t = termTex(c, e);
    const before = r;
    r = padd(r, pscale(prod, num(-1)));
    lines.push(`Divide the leading terms: $\\dfrac{${termTex(lead(before), deg(before))}}{${termTex(lead(D), deg(D))}} = ${t}$. Multiply: $${t.startsWith('-') ? `(${t})` : t}(${Dt}) = ${toTex(polyToNode(prod, v))}$. Subtract: remainder $${toTex(polyToNode(r, v))}$`);
  }
  return { q: trim(q), r, lines };
}

// ---------- range ----------

function rangeOf({ N, D, fF, vas, holes, endL, endR, isExcluded, excluded, v, isPoly, F }) {
  const V = symTex(v);
  const steps = [];
  if (deg(N) <= 0 && deg(D) <= 0) {
    const c = rdiv(N[0], D[0]);
    steps.push(`$${F}$ is always $${toTex(c)}$.`);
    return { tex: `\\{${toTex(c)}\\}`, intervals: [{ lo: rval(c), hi: rval(c), loClosed: true, hiClosed: true }], steps, turning: [] };
  }

  // turning points: where the graph switches between rising and falling
  const P = padd(pmul(pderiv(N), D), pscale(pmul(N, pderiv(D)), num(-1)));
  const Pf = x => pevalF(P, x);
  const turning = [];
  const proots = realRoots(P);
  for (const r of proots) {
    const h = 1e-5 * (1 + Math.abs(r.x));
    if (Math.sign(Pf(r.x - h)) === Math.sign(Pf(r.x + h))) continue;
    if (vas.some(a => near(a.x, r.x))) continue;
    const y = surdValue(r, proots, fF) || valueAt(N, D, r);
    turning.push({ x: r.x, xTex: r.tex, xExact: r.exact, y, hole: isExcluded(r.x) });
  }
  const tpTex = t => `(${t.xExact ? t.xTex : `\\approx ${t.xTex}`}, ${approxTex(t.y)})`;

  const bounds = [{ x: -Infinity }, ...vas, { x: Infinity }];
  const lim = s => (s > 0 ? { val: Infinity, tex: '\\infty' } : { val: -Infinity, tex: '-\\infty' });
  const endLim = e => (e.inf ? lim(e.inf) : { val: e.val, tex: e.tex });
  const pieces = [];
  if (isPoly) steps.push("A polynomial's graph is one unbroken curve. Its range runs from its lowest value to its highest.");
  else if (vas.length) steps.push(`The vertical asymptote${vas.length > 1 ? 's split' : ' splits'} the graph into ${word(vas.length + 1)} pieces. Find the $y$-values each piece covers.`);
  else steps.push('The graph is one unbroken curve (apart from any holes). Find its lowest and highest $y$-values.');

  for (let i = 0; i + 1 < bounds.length; i++) {
    const a = bounds[i], b = bounds[i + 1];
    const left = a.x === -Infinity ? endLim(endL) : lim(a.right);
    const right = b.x === Infinity ? endLim(endR) : lim(b.left);
    const cands = [{ ...left, attained: false }, { ...right, attained: false }];
    const tps = turning.filter(t => t.x > a.x && t.x < b.x);
    for (const t of tps) cands.push({ val: t.y.val, tex: t.y.tex, approx: !t.y.exact, attained: !t.hole });
    const lo = cands.reduce((p, c) => (c.val < p.val ? c : p));
    const hi = cands.reduce((p, c) => (c.val > p.val ? c : p));
    const closed = x => isFinite(x.val) && cands.some(c => c.attained && near(c.val, x.val));
    const piece = { lo: lo.val, loTex: lo.tex, loClosed: closed(lo), hi: hi.val, hiTex: hi.tex, hiClosed: closed(hi), approx: lo.approx || hi.approx };
    pieces.push(piece);

    const where = vas.length ? `On $${intervalX(a, b)}$: the` : 'The';
    const endWord = (e, side, bound) => {
      if (!isFinite(e.val)) {
        const dir = e.val > 0 ? 'up to $\\infty$' : 'down to $-\\infty$';
        return bound.x !== undefined && isFinite(bound.x) ? `shoots ${dir} next to $${V} = ${bound.tex}$` : `goes ${dir} on the ${side}`;
      }
      return `levels off toward $y = ${e.tex}$ on the ${side}`;
    };
    let line = `${where} graph ${endWord(left, 'left', a)} and ${endWord(right, 'right', b)}`;
    if (tps.length) line += `, and turns at ${andList(tps.map(t => `$${tpTex(t)}$${t.hole ? ' (a hole, so that value is never reached there)' : ''}`))}`;
    line += `. So it covers $${intervalTex(piece)}$.`;
    steps.push(line);
  }

  let intervals = mergeIntervals(pieces);
  if (pieces.length > 1) steps.push(`Put the pieces together: $${intervals.map(intervalTex).join(' \\cup ')}$`);

  // a hole removes its y-value unless the graph reaches that y somewhere else
  for (const h of holes) {
    const y = h.y.val;
    const inside = intervals.findIndex(iv => (iv.lo < y && y < iv.hi) || (near(iv.lo, y) && iv.loClosed) || (near(iv.hi, y) && iv.hiClosed));
    if (inside < 0) continue;
    let others;
    if (h.y.r) {
      const eq = padd(N, pscale(D, rneg(h.y.r)));
      others = deg(eq) === -Infinity ? [{ x: NaN }] : realRoots(eq).filter(r => !isExcluded(r.x));
    } else {
      const c = padd(N, pscale(D, rneg(num(Math.round(y * 1e6), 1e6)))).map(rval);
      others = numericPolyRoots(c).filter(x => !isExcluded(x)).filter(x => Math.abs(fF(x) - y) < 1e-6).map(x => ({ x }));
    }
    if (others.length) {
      steps.push(`The hole at $(${h.tex}, ${h.y.tex})$ doesn't remove $y = ${h.y.tex}$: the graph reaches that height somewhere else.`);
      continue;
    }
    const iv = intervals[inside];
    const split = [];
    if (iv.lo < y && !near(iv.lo, y)) split.push({ ...iv, hi: y, hiTex: h.y.tex, hiClosed: false });
    if (iv.hi > y && !near(iv.hi, y)) split.push({ ...iv, lo: y, loTex: h.y.tex, loClosed: false });
    intervals = [...intervals.slice(0, inside), ...split, ...intervals.slice(inside + 1)];
    steps.push(`The hole at $(${h.tex}, ${h.y.tex})$ removes $y = ${h.y.tex}$: the graph never reaches that height anywhere else.`);
  }

  const tex = intervals.map(intervalTex).join(' \\cup ');
  if (turning.some(t => !t.y.exact || !t.xExact)) steps.push('Turning points are read from the graph (or a calculator\'s minimum/maximum tool), so some values here are rounded.');
  return { tex, intervals: intervals.map(({ lo, hi, loClosed, hiClosed }) => ({ lo, hi, loClosed, hiClosed })), steps, turning: turning.map(t => ({ x: t.x, y: t.y.val, hole: t.hole })) };
}

// At x = a + b sqrt(m), f(x) = p + q sqrt(m) with rational p, q. The conjugate root
// x' = a - b sqrt(m) gives f(x') = p - q sqrt(m), so p and q come from the two values.
function surdValue(r, roots, fF) {
  const sq = r.exact && !(r.node && r.node.type === 'num') && /\\sqrt\{(\d+)\}/.exec(r.tex);
  if (!sq) return null;
  const m = +sq[1], rm = Math.sqrt(m);
  const frac = x => { const g = recognize(x); return g && g.node.type === 'num' ? g.node : null; };
  for (const r2 of roots) {
    if (r2 === r || !r2.tex.includes(`\\sqrt{${m}}`) || !frac(r.x + r2.x)) continue;
    const y1 = fF(r.x), y2 = fF(r2.x);
    const p = frac((y1 + y2) / 2), q = frac((y1 - y2) / (2 * rm));
    if (!p || !q) continue;
    // written p + q sqrt(m), the way it comes out of the quadratic formula
    const surd = toTex(simplify(mul([num(Math.abs(q.n), q.d), pow(num(m), HALF)])));
    const tex = isZero(p) ? `${q.n < 0 ? '-' : ''}${surd}` : `${toTex(p)} ${q.n < 0 ? '-' : '+'} ${surd}`;
    return { val: y1, tex, exact: true };
  }
  return null;
}

function intervalX(a, b) {
  const l = a.x === -Infinity ? '-\\infty' : a.tex;
  const r = b.x === Infinity ? '\\infty' : b.tex;
  return `(${l}, ${r})`;
}

function intervalTex(iv) {
  if (near(iv.lo, iv.hi) && isFinite(iv.lo)) return `\\{${iv.loTex}\\}`;
  return `${iv.loClosed ? '[' : '('}${iv.loTex}, ${iv.hiTex}${iv.hiClosed ? ']' : ')'}`;
}

function mergeIntervals(list) {
  const s = list.slice().sort((p, q) => p.lo - q.lo || (q.loClosed - p.loClosed));
  const out = [];
  for (const iv of s) {
    const cur = out[out.length - 1];
    const touches = cur && (iv.lo < cur.hi && !near(iv.lo, cur.hi) || (near(iv.lo, cur.hi) && (cur.hiClosed || iv.loClosed)));
    if (!touches) { out.push({ ...iv }); continue; }
    if (near(iv.lo, cur.lo)) cur.loClosed = cur.loClosed || iv.loClosed;
    if (iv.hi > cur.hi && !near(iv.hi, cur.hi)) { cur.hi = iv.hi; cur.hiTex = iv.hiTex; cur.hiClosed = iv.hiClosed; }
    else if (near(iv.hi, cur.hi)) cur.hiClosed = cur.hiClosed || iv.hiClosed;
    cur.approx = cur.approx || iv.approx;
  }
  return out;
}
