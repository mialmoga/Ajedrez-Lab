import { VAL, attackersInfo, isHanging, pieces, rank, other, dir } from '../helpers.js';

export const evasion = {
  id: 'evasion', grupo: 'rey',
  detect({ before, move }) {
    if (!before.isCheck()) return null;
    if (move.captured) return { id: 'evasion_captura', prioridad: 72, slots: { pieza: move.piece, capturada: move.captured, casilla: move.to } };
    if (move.piece === 'k') return { id: 'evasion_rey', prioridad: 72, slots: { casilla: move.to } };
    return { id: 'evasion_bloqueo', prioridad: 72, slots: { pieza: move.piece, casilla: move.to } };
  },
};

export const retirada = {
  id: 'retirada', grupo: 'seguridad',
  detect({ before, after, move, color }) {
    if (move.captured || move.piece === 'k' || move.piece === 'p') return null;
    if (!isHanging(before, move.from, color) || isHanging(after, move.to, color)) return null;
    const att = attackersInfo(before, move.from, other(color));
    const atacante = before.get(att.minSq).type;
    const atras = (rank(move.to) - rank(move.from)) * dir(color) < 0;
    return { id: atras ? 'retroceso' : 'retirada', prioridad: 60, slots: { pieza: move.piece, casilla: move.to, desde: move.from, atacante } };
  },
};

export const defensa = {
  id: 'defensa', grupo: 'seguridad',
  detect({ before, after, move, color }) {
    for (const p of pieces(before, color)) {
      if (p.square === move.from || p.type === 'k') continue;
      if (!isHanging(before, p.square, color)) continue;
      const sq = p.square;
      if (isHanging(after, sq, color)) continue;
      if (after.get(sq)?.type !== p.type) continue;
      if (after.attackers(sq, color).includes(move.to) && !before.attackers(sq, color).includes(move.from)) {
        return { id: 'defiende', prioridad: 58, slots: { pieza: move.piece, casilla: move.to, protegida: p.type, c1: sq } };
      }
    }
    return null;
  },
};
