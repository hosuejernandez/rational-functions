// Engine tests:  node tests/run.mjs
import { analyzeFunction } from '../js/analyze.js';

let pass = 0, fail = 0;
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log(`FAIL ${name}\n   got:  ${g}\n   want: ${w}`);
}

const r3 = x => Math.round(x * 1000) / 1000;
const A = src => analyzeFunction(src).data;
const answer = (src, id) => analyzeFunction(src).features.find(f => f.id === id)?.answer;
const range = d => d.range.map(iv => `${iv.loClosed ? '[' : '('}${r3(iv.lo)},${r3(iv.hi)}${iv.hiClosed ? ']' : ')'}`).join('U');
const zeros = d => d.zeros.map(z => `${r3(z.x)}:${z.mult}:${z.behavior}`);

// holes
let d = A('(x^2-4)/(x-2)');
check('hole', d.holes.map(h => [h.x, h.y]), [[2, 4]]);
check('hole: no VA', d.vas, []);
check('hole: no slant (it is a line)', d.slant, null);
check('hole: range', range(d), '(-Infinity,4)U(4,Infinity)');
d = A('(x^2-x-6)/(x^2-9)');
check('hole + VA', [d.holes.map(h => [h.x, r3(h.y)]), d.vas.map(a => a.x)], [[[3, 0.833]], [-3]]);
check('hole + VA range', range(d), '(-Infinity,0.833)U(0.833,1)U(1,Infinity)');
d = A('(x-1)/(x-1)^2');
check('common factor that leaves a VA', [d.holes, d.vas.map(a => a.x)], [[], [1]]);
d = A('x^2(x-1)/(x-1)');
check('hole y reached elsewhere stays in range', range(d), '[0,Infinity)');
check('hole breaks symmetry', d.parity, 'neither');

// vertical asymptotes and side behavior
d = A('1/(x-3)^2');
check('even VA', d.vas.map(a => [a.x, a.mult, a.left, a.right]), [[3, 2, 1, 1]]);
check('even VA range', range(d), '(0,Infinity)');
d = A('1/x');
check('odd VA', d.vas.map(a => [a.x, a.mult, a.left, a.right]), [[0, 1, -1, 1]]);
check('1/x no y-intercept', d.yint, undefined);
check('1/x range', range(d), '(-Infinity,0)U(0,Infinity)');

// horizontal and slant asymptotes
d = A('(2x^2)/(x^2+1)');
check('HA ratio', d.ha.val, 2);
check('HA range', range(d), '[0,2)');
d = A('(x^2+1)/(x-1)');
check('slant', d.slant.tex, 'x + 1');
check('slant no HA', d.ha, null);
check('slant range exact', analyzeFunction('(x^2+1)/(x-1)').data.rangeTex, '(-\\infty, 2 - 2 \\sqrt{2}] \\cup [2 + 2 \\sqrt{2}, \\infty)');
check('HA crossing function range', range(A('x/(x^2-1)')), '(-Infinity,Infinity)');
check('HA below', range(A('1/(x^2+1)')), '(0,1]');
check('fraction HA', A('(x+1)/(2x-4)').ha.tex, '\\frac{1}{2}');

// zeros and multiplicity
check('cubic zeros', zeros(A('x^3-x')), ['-1:1:crosses', '0:1:crosses', '1:1:crosses']);
check('double zero bounces', zeros(A('(x-1)^2(x+2)')), ['-2:1:crosses', '1:2:bounces']);
check('triple zero flattens', zeros(A('(x-1)^3')), ['1:3:flattens']);
check('numeric zero', zeros(A('-2x^3+x^2+4')), ['1.451:1:crosses']);
check('zero at a hole is not a zero', zeros(A('x(x-1)/(x-1)')), ['0:1:crosses']);
check('no zeros', zeros(A('(x^2+1)/(x-1)')), []);

// symmetry
check('odd poly', A('x^3-x').parity, 'odd');
check('even poly', A('x^4-4x^2').parity, 'even');
check('odd rational', A('3x/(x^2-4)').parity, 'odd');
check('even rational', A('1/(x^2+1)').parity, 'even');
check('neither', A('(x-1)^2(x+2)').parity, 'neither');

// end behavior
check('neg odd poly', A('-2x^3+x^2+4').end, { left: 'up', right: 'down' });
check('pos even poly', A('x^4-4x^2').end, { left: 'up', right: 'up' });
check('rational levels', A('1/x').end, { left: 'level', right: 'level' });
check('slant ends', A('t^2/(t+1)').end, { left: 'down', right: 'up' });

// range of polynomials
check('even poly range', range(A('x^4-4x^2')), '[-4,Infinity)');
check('odd poly range', range(A('x^3-x')), '(-Infinity,Infinity)');
check('downward parabola', range(A('-x^2+4x')), '(-Infinity,4]');
check('constant', range(A('5')), '[5,5]');

// y-intercepts and domain
check('y-int', A('(x+1)/(2x-4)').yint.tex, '-\\frac{1}{4}');
check('domain', answer('x/(x^2-1)', 'domain'), '$(-\\infty, -1) \\cup (-1, 1) \\cup (1, \\infty)$');
check('named variable', A('f(t) = t^2/(t+1)').vas.map(a => a.x), [-1]);
check('y = form', A('y = 3x/(x^2-4)').vas.map(a => a.x), [-2, 2]);

// errors
for (const bad of ['sqrt(x)', 'sin(x)', 'x^2 + y', '0', '(x-1)/(x-x)']) {
  try { analyzeFunction(bad); fail++; console.log(`FAIL should reject ${bad}`); } catch { pass++; }
}

// numeric cross-check: reported zeros, holes and intercepts against the function itself
for (const src of ['(x^2-4)/(x-2)', 'x^3-x', '(x^2-x-6)/(x^2-9)', 'x^5-3x+1', '(x+1)/(2x-4)', '(x^3-8)/(x-2)']) {
  const r = analyzeFunction(src);
  for (const z of r.data.zeros) check(`${src} zero ${z.x}`, Math.abs(r.f(z.x)) < 1e-6, true);
  for (const h of r.data.holes || []) check(`${src} hole ${h.x}`, Math.abs(r.f(h.x + 1e-7) - h.y) < 1e-4, true);
  if (r.data.yint) check(`${src} y-int`, Math.abs(r.f(0) - r.data.yint.y) < 1e-9, true);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
