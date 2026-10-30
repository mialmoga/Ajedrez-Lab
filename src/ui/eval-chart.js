import { h } from './dom.js';

/**
 * Gráfica de evaluación jugada a jugada (centipeones, blancas arriba). Clic para saltar a una jugada.
 * chart.set(evals, cursorPly): evals[i] = evaluación tras la jugada i+1 (null = sin dato).
 */
export function createEvalChart({ onSeek } = {}) {
  const el = h('div', { class: 'eval-chart' });
  let evals = [];
  let cursor = 0;
  const W = 400, H = 84;
  const yOf = (e) => H / 2 - (H / 2 - 4) * Math.tanh(e / 400);

  function render() {
    const n = evals.length;
    if (!n) { el.innerHTML = ''; return; }
    let last = 0;
    const pts = evals.map((e, i) => {
      if (e != null) last = e;
      return [((i + 1) / n) * W, yOf(last)];
    });
    const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L');
    const area = `M0,${H / 2} L${line} L${W},${H / 2} Z`;
    const cx = n ? (cursor / n) * W : 0;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Evaluación por jugada">
      <rect width="${W}" height="${H / 2}" class="ec-white"/><rect y="${H / 2}" width="${W}" height="${H / 2}" class="ec-black"/>
      <path d="${area}" class="ec-area"/><path d="M${line}" class="ec-line"/>
      <line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" class="ec-mid"/>
      <line x1="${cx}" x2="${cx}" y1="0" y2="${H}" class="ec-cursor"/></svg>`;
  }

  el.addEventListener('click', (e) => {
    const n = evals.length;
    if (!n) return;
    const r = el.getBoundingClientRect();
    onSeek?.(Math.max(0, Math.min(n, Math.round(((e.clientX - r.left) / r.width) * n))));
  });

  return {
    el,
    set(newEvals, newCursor) { evals = newEvals ?? []; cursor = newCursor ?? 0; render(); },
  };
}
