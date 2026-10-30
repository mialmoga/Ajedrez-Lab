/**
 * Tablero 2D (SVG). Implementa el contrato de vista (ver docs/ARQUITECTURA.md):
 *   view.setState({ board, lastMove, checkSquare, selected, targets, orientation, move })
 *   view.setTheme(theme)
 *   view.onSquareClick = (sq) => {}
 *   view.destroy()
 */
import { FONT_SANS } from './fonts.js';
const FILES = 'abcdefgh';
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const S = 100; // lado de casilla en unidades del viewBox
const M = 26; // margen para coordenadas
const MARCA = { riesgo: '#e03a3a', vulnerable: '#2fb36a', clavada: '#f0a400' }; // ayudas del modo Práctica

export function createBoard2D(container, { theme }) {
  const root = document.createElement('div');
  root.className = 'board2d';
  container.append(root);

  let state = null;
  let th = theme;

  const view = {
    onSquareClick: null,
    setState(s) { state = s; render(); },
    setTheme(t) { th = t; if (state) render(); },
    destroy() { root.remove(); },
  };

  root.addEventListener('click', (e) => {
    const sq = e.target.closest?.('[data-sq]')?.dataset.sq;
    if (sq) view.onSquareClick?.(sq);
  });

  function render() {
    const { board, lastMove, checkSquare, selected, targets, orientation } = state;
    const tmap = new Map(targets.map((t) => [t.sq, t]));
    const marks = new Map();
    for (const m of state.marks ?? []) marks.set(m.sq, [...(marks.get(m.sq) ?? []), m.tipo]);
    const size = S * 8 + M * 2;
    let svg = `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Tablero de ajedrez">`;
    svg += `<defs><radialGradient id="chk"><stop offset="0" stop-color="#ff2d2d" stop-opacity=".95"/><stop offset="1" stop-color="#ff2d2d" stop-opacity="0"/></radialGradient></defs>`;
    svg += `<rect width="${size}" height="${size}" rx="10" fill="${th.frame2d}"/>`;

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const file = orientation === 'w' ? f : 7 - f;
        const row = orientation === 'w' ? r : 7 - r; // row 0 = rango 8
        const name = FILES[file] + (8 - row);
        const x = M + f * S, y = M + r * S;
        const light = (file + row) % 2 === 0;
        svg += `<rect data-sq="${name}" x="${x}" y="${y}" width="${S}" height="${S}" fill="${light ? th.light : th.dark}"/>`;
        if (lastMove && (name === lastMove.from || name === lastMove.to)) svg += `<rect class="ov" x="${x}" y="${y}" width="${S}" height="${S}" fill="${th.lastMove}"/>`;
        if (name === selected) svg += `<rect class="ov" x="${x}" y="${y}" width="${S}" height="${S}" fill="${th.selected}"/>`;
        if (name === checkSquare) svg += `<circle class="ov" cx="${x + S / 2}" cy="${y + S / 2}" r="${S * 0.52}" fill="url(#chk)"/>`;
        const p = board[row][file];
        if (p) {
          const white = p.color === 'w';
          svg += `<text class="ov" x="${x + S / 2}" y="${y + S / 2 + 4}" text-anchor="middle" dominant-baseline="central" font-size="82" font-family="${FONT_SANS}, 'DejaVu Sans', serif" fill="${white ? '#ffffff' : '#141414'}" stroke="${white ? '#141414' : '#f2f2f2'}" stroke-width="2.4" paint-order="stroke">${GLYPH[p.type]}︎</text>`;
        }
        const mk = marks.get(name);
        if (mk) mk.forEach((tipo, i) => { const k = 5 + i * 9; svg += `<rect class="ov" x="${x + k}" y="${y + k}" width="${S - 2 * k}" height="${S - 2 * k}" rx="6" fill="${MARCA[tipo]}" fill-opacity=".16" stroke="${MARCA[tipo]}" stroke-width="6"${tipo === 'clavada' ? ' stroke-dasharray="14 8"' : ''}/>`; });
        const t = tmap.get(name);
        if (t) {
          svg += t.capture
            ? `<circle class="ov" cx="${x + S / 2}" cy="${y + S / 2}" r="${S * 0.44}" fill="none" stroke="rgba(220,50,50,.85)" stroke-width="7"/>`
            : `<circle class="ov" cx="${x + S / 2}" cy="${y + S / 2}" r="${S * 0.17}" fill="rgba(40,160,90,.7)"/>`;
        }
      }
    }
    // flechas de 💡 (mejor jugada fuerte, respuesta tenue)
    const centro = (sq) => {
      const file = FILES.indexOf(sq[0]), row = 8 - Number(sq[1]);
      const f = orientation === 'w' ? file : 7 - file, r = orientation === 'w' ? row : 7 - row;
      return [M + f * S + S / 2, M + r * S + S / 2];
    };
    for (const a of state.arrows ?? []) {
      const [x1, y1] = centro(a.from), [x2, y2] = centro(a.to);
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
      const col = a.tipo === 'mejor' ? '#1f9d55' : '#3b82c4', op = a.tipo === 'mejor' ? 0.9 : 0.55, w = a.tipo === 'mejor' ? 13 : 9, head = a.tipo === 'mejor' ? 34 : 28;
      const bx = x2 - ux * head, by = y2 - uy * head; // base de la punta
      svg += `<g class="ov" opacity="${op}"><line x1="${x1 + ux * 18}" y1="${y1 + uy * 18}" x2="${bx}" y2="${by}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`
        + `<polygon points="${x2},${y2} ${bx - uy * head * 0.55},${by + ux * head * 0.55} ${bx + uy * head * 0.55},${by - ux * head * 0.55}" fill="${col}"/></g>`;
    }
    // coordenadas
    for (let i = 0; i < 8; i++) {
      const file = orientation === 'w' ? i : 7 - i;
      const rank = orientation === 'w' ? 8 - i : i + 1;
      svg += `<text class="ov" x="${M + i * S + S / 2}" y="${size - M / 2 + 1}" text-anchor="middle" dominant-baseline="central" font-size="17" font-family="${FONT_SANS}, sans-serif" fill="${th.coords}">${FILES[file]}</text>`;
      svg += `<text class="ov" x="${M / 2}" y="${M + i * S + S / 2}" text-anchor="middle" dominant-baseline="central" font-size="17" font-family="${FONT_SANS}, sans-serif" fill="${th.coords}">${rank}</text>`;
    }
    svg += '</svg>';
    root.innerHTML = svg;
  }

  return view;
}
