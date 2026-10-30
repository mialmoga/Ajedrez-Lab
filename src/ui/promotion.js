import { h } from './dom.js';

const GLYPH = { q: '♛', r: '♜', b: '♝', n: '♞' };
const NAME = { q: 'Dama', r: 'Torre', b: 'Alfil', n: 'Caballo' };

/** Diálogo de promoción. Devuelve 'q' | 'r' | 'b' | 'n' o null si se cancela. */
export function askPromotion(color) {
  return new Promise((resolve) => {
    const close = (v) => { overlay.remove(); resolve(v); };
    const overlay = h('div', { class: 'modal', onClick: (e) => { if (e.target === overlay) close(null); } },
      h('div', { class: 'modal-box' },
        h('p', {}, 'Promoción: elige pieza'),
        h('div', { class: 'promo-row' },
          ['q', 'r', 'b', 'n'].map((p) =>
            h('button', { class: `promo ${color === 'w' ? 'pw' : 'pb'}`, title: NAME[p], onClick: () => close(p) }, GLYPH[p] + '︎')))));
    document.body.append(overlay);
  });
}
