import { VAL, attackersInfo, other } from '../helpers.js';
export const sacrificio = {
  id: 'sacrificio', grupo: 'material',
  detect({ after, move, color }) {
    if (move.captured || VAL[move.piece] < 3 || move.piece === 'k') return null;
    const att = attackersInfo(after, move.to, other(color));
    if (!att.list.length) return null;
    const def = after.attackers(move.to, color).length;
    if (def > 0 && att.min >= VAL[move.piece]) return null;
    return { id: 'ofrece_pieza', prioridad: 56, slots: { pieza: move.piece, casilla: move.to } };
  },
};
