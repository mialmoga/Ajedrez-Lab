import { VAL, pieces, other, pinsFrom, isHanging } from '../helpers.js';

/** Enemigos que la pieza movida ataca y que "valen la pena" (valen más o están colgados). */
function targets(after, move, color) {
  return pieces(after, other(color))
    .filter((p) => after.attackers(p.square, color).includes(move.to) && (p.type === 'k' || VAL[p.type] > VAL[move.piece] || isHanging(after, p.square, other(color))))
    .sort((a, b) => VAL[b.type] - VAL[a.type]);
}

export const horquilla = {
  id: 'horquilla', grupo: 'tactica',
  detect({ after, move, color }) {
    const t = targets(after, move, color);
    if (t.length < 2) return null;
    return { id: 'horquilla', prioridad: 75, slots: { pieza: move.piece, casilla: move.to, objetivo: t[0].type, c1: t[0].square, objetivo2: t[1].type, c2: t[1].square } };
  },
};

export const amenaza = {
  id: 'amenaza', grupo: 'tactica',
  detect({ before, after, move, color }) {
    const t = targets(after, move, color).filter((p) => p.type !== 'k' && !before.attackers(p.square, color).includes(move.from));
    if (t.length !== 1 || move.captured === t[0].type && move.to === t[0].square) return null;
    return { id: 'amenaza', prioridad: 55, slots: { pieza: move.piece, casilla: move.to, objetivo: t[0].type, c1: t[0].square } };
  },
};

export const clavada = {
  id: 'clavada', grupo: 'tactica',
  detect({ before, after, move, color }) {
    if (!'bqr'.includes(move.piece)) return null;
    const had = new Set(pinsFrom(before, move.from, color).map((p) => p.square));
    const nuevo = pinsFrom(after, move.to, color).find((p) => !had.has(p.square));
    if (!nuevo || (nuevo.type === 'p' && !'kq'.includes(nuevo.detras))) return null;
    return { id: 'clavada', prioridad: 65, slots: { pieza: move.piece, casilla: move.to, clavada: nuevo.type, c1: nuevo.square, detras: nuevo.detras } };
  },
};
