# Rational Functions Explorer

A web page for precalculus students. You type a polynomial or a rational function, and the page shows each feature of its graph, with steps:

- **Simplify and factor.** Writes the function as one fraction, factors the top and bottom, and cancels common factors.
- **Domain.** Uses the original denominator, before anything is canceled.
- **Holes.** Factors that cancel completely. The y-value comes from the simplified function.
- **Vertical asymptotes.** Gives the multiplicity of each one, and what the graph does on each side (tested just left and just right).
- **y-intercept, zeros, and multiplicity.** At each zero the graph crosses, bounces, or crosses and flattens.
- **Even, odd, or neither.** Finds f(−x) and compares it with f(x) and −f(x). A domain that isn't symmetric makes the function neither.
- **End behavior, horizontal asymptote, and slant asymptote.** The slant asymptote comes with the long division steps.
- **Range.** Built from each piece of the graph: where the ends go, where the turning points are, and which y-values the holes remove.
- **A graph.** The graph breaks at vertical asymptotes. Asymptotes are dashed, holes are open circles, and zeros, intercepts and turning points are labeled.

**Predict mode** hides the answers. Students type an answer for each part and press **Check**. The page tells them if they're right and gives a hint if they're not. **Show answer** reveals the work. The graph stays covered until they choose to see it. Answers can be typed as fractions or decimals, lists like `-3, 3`, points like `(3, 5/6)`, or intervals like `(-inf, 2) U [3, inf)`.

The page works offline except for KaTeX (math typesetting), which loads from a CDN. It is plain HTML, CSS and JavaScript modules, with no build step.

## Embedding

The site is live on GitHub Pages. Paste this into your class website:

```html
<iframe src="https://hosuejernandez.github.io/rational-functions/" width="100%" height="900" style="border:0"></iframe>
```

To update the live site, commit your changes and push to `main`. GitHub Pages republishes in about a minute.

## Running it locally

Double-click **Start Rational Functions.command**. Your browser opens to the app; close the Terminal window to stop it.

Or run this in the folder, then open http://localhost:8766:

```bash
python3 -m http.server 8766
```

The page won't work if you open `index.html` straight from Finder, because browsers only load JavaScript modules from a server.

## Tests

```bash
node tests/run.mjs
```

The tests check exact answers: holes, asymptotes and their side behavior, zeros with multiplicity, symmetry, end behavior, and range. They also evaluate the function at every reported zero, hole and intercept to confirm each one.

## Files

| File | What it does |
| --- | --- |
| `js/analyze.js` | Finds each feature and writes its steps |
| `js/expr.js` | Parser, LaTeX output, numeric evaluation (from the Derivative Calculator) |
| `js/simplify.js` | Simplification and expansion (from the Derivative Calculator) |
| `js/solve.js` | Exact polynomial arithmetic, factoring, and roots (from the Derivative Calculator, with additions for holes and long division) |
| `js/graph.js` | Canvas graph |
| `js/app.js` | Page wiring and Predict mode checking |
