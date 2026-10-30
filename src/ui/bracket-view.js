import { h } from './dom.js';
import { BYE, fmtPoints, roundTitle } from '../tournament/bracket.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const trunc = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const W = 208, H = 60, GX = 46, GY = 14, PADX = 12, TOP = 34;

/**
 * Árbol de eliminatoria (SVG). render(torneo) lo dibuja entero; clic en un cruce → onSelect(matchId).
 * Los estilos están en styles.css (.bk-*), así que los temas lo colorean solos.
 */
export function createBracketView(container, { onSelect } = {}) {
  const root = h('div', { class: 'bracket' });
  container.append(root);
  let selected = null;
  let last = null;

  root.addEventListener('click', (e) => {
    const g = e.target.closest('[data-match]');
    if (!g) return;
    selected = g.dataset.match;
    render(last);
    onSelect?.(selected);
  });

  function render(t) {
    last = t;
    if (!t) { root.innerHTML = '<p class="muted pad">Crea un torneo para ver el cuadro.</p>'; return; }
    const R = t.data.rondas;
    const liveMatches = new Set([...t.live.values()].map((l) => l.matchId));

    const ys = R.map(() => []);
    R[0].forEach((_, i) => { ys[0][i] = TOP + i * (H + GY); });
    for (let r = 1; r < R.length; r++) R[r].forEach((_, i) => { ys[r][i] = (ys[r - 1][2 * i] + ys[r - 1][2 * i + 1]) / 2; });
    const xOf = (r) => PADX + r * (W + GX);
    const width = xOf(R.length - 1) + W + PADX;
    const height = TOP + R[0].length * (H + GY) - GY + PADX;

    let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cuadro del torneo">`;
    R.forEach((_, r) => { svg += `<text class="bk-title" x="${xOf(r)}" y="20">${esc(roundTitle(r, R.length))}</text>`; });

    // conectores
    for (let r = 0; r < R.length - 1; r++) {
      R[r].forEach((m, i) => {
        const x1 = xOf(r) + W, y1 = ys[r][i] + H / 2;
        const nx = xOf(r + 1), ny = ys[r + 1][Math.floor(i / 2)] + H / 2;
        const xm = x1 + GX / 2;
        svg += `<path class="bk-line${m.estado === 'terminado' ? ' done' : ''}" d="M${x1},${y1} H${xm} V${ny} H${nx}"/>`;
      });
    }

    R.forEach((round, r) => round.forEach((m, i) => {
      const x = xOf(r), y = ys[r][i];
      const running = liveMatches.has(m.id);
      const cls = `bk-match st-${m.bye ? 'bye' : m.estado}${running ? ' running' : ''}${m.id === selected ? ' sel' : ''}`;
      svg += `<g class="${cls}" data-match="${m.id}" transform="translate(${x},${y})"><rect class="bk-box" width="${W}" height="${H}" rx="7"/>`;
      svg += `<line class="bk-sep" x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}"/>`;
      for (const [row, side] of [[0, 'a'], [1, 'b']]) {
        const id = m[side];
        const ry = row * (H / 2);
        let name, seed = '', cl = 'bk-name';
        if (id === BYE) { name = 'BYE'; cl += ' muted'; }
        else if (!id) { name = 'por definir'; cl += ' muted'; }
        else {
          const p = t.participant(id);
          name = p.nombre;
          seed = `#${p.semilla}`;
          if (m.ganador === id) cl += ' win';
        }
        const trophy = id && id === t.data.campeon && r === R.length - 1 ? ' 🏆' : '';
        svg += `<text class="bk-seed" x="9" y="${ry + 19}">${seed}</text>`;
        svg += `<text class="${cl}" x="32" y="${ry + 19}">${esc(trunc(name, 19))}${trophy}</text>`;
        const showScore = id && id !== BYE && !m.bye && (m.pares.length > 0);
        if (showScore) svg += `<text class="bk-score${m.ganador === id ? ' win' : ''}" x="${W - 10}" y="${ry + 19}" text-anchor="end">${fmtPoints(m.puntos[side])}</text>`;
      }
      if (running) svg += `<circle class="bk-live" cx="${W - 10}" cy="9" r="4"/>`;
      svg += '</g>';
    }));
    svg += '</svg>';
    root.innerHTML = svg;
  }

  return { render, select(id) { selected = id; if (last) render(last); }, destroy() { root.remove(); } };
}
