import { kingSquare, other } from '../helpers.js';
export const jaque = {
  id: 'jaque', grupo: 'jaque',
  detect({ after, move, color }) {
    if (after.isCheckmate()) return { id: 'jaque_mate', prioridad: 100, slots: { pieza: move.piece, casilla: move.to } };
    if (after.isStalemate()) return { id: 'ahogado', prioridad: 95, slots: {} };
    if (!after.isCheck()) return null;
    const ks = kingSquare(after, other(color));
    const directo = ks && after.attackers(ks, color).includes(move.to);
    return { id: directo ? 'jaque' : 'jaque_descubierto', prioridad: 85, slots: { pieza: move.piece, casilla: move.to } };
  },
};
