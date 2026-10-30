import { VAL, file, rank, sqName, other, dir, pieces, countPawns } from '../helpers.js';

const BACK = { w: '1', b: '8' };
const CENTRO = new Set(['d4', 'e4', 'd5', 'e5']);

export const desarrollo = {
  id: 'desarrollo', grupo: 'posicional',
  detect({ move, color, ply }) {
    if (move.captured || ply >= 24 || move.from[1] !== BACK[color]) return null;
    if ('nb'.includes(move.piece)) return { id: 'desarrollo', prioridad: 40, slots: { pieza: move.piece, casilla: move.to } };
    if (move.piece === 'q' && ply < 12) return { id: 'dama_temprana', prioridad: 38, slots: { casilla: move.to } };
    return null;
  },
};

export const centro = {
  id: 'centro', grupo: 'posicional',
  detect({ move, ply }) {
    if (move.piece !== 'p' || move.captured || ply >= 24 || !CENTRO.has(move.to)) return null;
    return { id: 'centro', prioridad: 42, slots: { casilla: move.to } };
  },
};

export const columna = {
  id: 'columna', grupo: 'posicional',
  detect({ after, move, color }) {
    if (move.piece !== 'r' || file(move.from) === file(move.to)) return null;
    const f = file(move.to);
    const mine = countPawns(after, color, f), theirs = countPawns(after, other(color), f);
    const letra = move.to[0];
    if (!mine && !theirs) return { id: 'columna_abierta', prioridad: 50, slots: { columna: letra } };
    if (!mine) return { id: 'columna_semiabierta', prioridad: 45, slots: { columna: letra } };
    return null;
  },
};

export const peones = {
  id: 'peones', grupo: 'peones',
  detect({ before, after, move, color }) {
    if (move.piece !== 'p') return null;
    const d = dir(color), opp = other(color), f = file(move.to), r = rank(move.to);
    // peón pasado: sin peones rivales por delante en su columna ni en las contiguas
    let pasado = true;
    for (const ff of [f - 1, f, f + 1]) for (let rr = r + d; rr >= 0 && rr < 8; rr += d) {
      const p = after.get(sqName(ff, rr));
      if (p && p.type === 'p' && p.color === opp) pasado = false;
    }
    if (pasado) {
      const faltan = color === 'w' ? 7 - r : r;
      return faltan <= 2
        ? { id: 'peon_pasado_cerca', prioridad: 64, slots: { casilla: move.to, n: faltan } }
        : { id: 'peon_pasado', prioridad: 52, slots: { casilla: move.to } };
    }
    if (move.captured) {
      if (countPawns(before, color, file(move.from)) >= 2 && countPawns(after, color, f) === 1) return { id: 'repara_peones', prioridad: 44, slots: { casilla: move.to } };
      if (countPawns(after, color, f) >= 2 && countPawns(before, color, f) < 2) return { id: 'dobla_peones', prioridad: 46, slots: { casilla: move.to } };
      return null;
    }
    // palanca: el peón recién llegado ataca un peón rival
    for (const ff of [f - 1, f + 1]) {
      const p = after.get(sqName(ff, r + d));
      if (p && p.type === 'p' && p.color === opp) return { id: 'palanca', prioridad: 48, slots: { casilla: move.to, objetivo: 'p', c1: sqName(ff, r + d) } };
    }
    return null;
  },
};

export const reyActivo = {
  id: 'rey_activo', grupo: 'rey',
  detect({ after, move }) {
    if (move.piece !== 'k' || move.flags.includes('k') || move.flags.includes('q')) return null;
    const material = pieces(after).filter((p) => p.type !== 'p' && p.type !== 'k').reduce((s, p) => s + VAL[p.type], 0);
    if (material > 14) return null;
    const dc = (sq) => Math.hypot(file(sq) - 3.5, rank(sq) - 3.5);
    if (dc(move.to) >= dc(move.from)) return null;
    return { id: 'rey_activo', prioridad: 45, slots: { casilla: move.to } };
  },
};
