/** Utilidades compartidas por los detectores. Usan solo la API pública de chess.js. */
export const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
export const FILES = 'abcdefgh';
export const file = (sq) => FILES.indexOf(sq[0]);
export const rank = (sq) => Number(sq[1]) - 1;
export const sqName = (f, r) => (f >= 0 && f < 8 && r >= 0 && r < 8 ? FILES[f] + (r + 1) : null);
export const other = (c) => (c === 'w' ? 'b' : 'w');
/** +1 si el color avanza hacia rangos mayores (blancas), -1 negras. */
export const dir = (c) => (c === 'w' ? 1 : -1);

/** Todas las piezas [{square,type,color}] de un color (o de ambos). */
export function pieces(chess, color) {
  const out = [];
  for (const row of chess.board()) for (const p of row) if (p && (!color || p.color === color)) out.push(p);
  return out;
}

/** Casillas con piezas de `by` que atacan `sq` y su valor mínimo. */
export function attackersInfo(chess, sq, by) {
  const list = chess.attackers(sq, by);
  let min = Infinity;
  let minSq = null;
  for (const s of list) {
    const v = VAL[chess.get(s).type];
    if (v < min) { min = v; minSq = s; }
  }
  return { list, min, minSq };
}

/** ¿La pieza de `color` en `sq` está "colgada"? (atacada y sin defensa suficiente) */
export function isHanging(chess, sq, color) {
  const p = chess.get(sq);
  if (!p || p.type === 'k') return false;
  const att = attackersInfo(chess, sq, other(color));
  if (!att.list.length) return false;
  const def = chess.attackers(sq, color).length;
  return def === 0 || att.min < VAL[p.type];
}

export function countPawns(chess, color, f) {
  let n = 0;
  for (let r = 0; r < 8; r++) { const p = chess.get(sqName(f, r)); if (p && p.type === 'p' && p.color === color) n++; }
  return n;
}

export function kingSquare(chess, color) {
  return pieces(chess, color).find((p) => p.type === 'k')?.square ?? null;
}

const RAYS = { b: [[1, 1], [1, -1], [-1, 1], [-1, -1]], r: [[1, 0], [-1, 0], [0, 1], [0, -1]] };
RAYS.q = [...RAYS.b, ...RAYS.r];

/** Clavadas que hace la pieza deslizante en `sq`: [{square, type, detras}] */
export function pinsFrom(chess, sq, color) {
  const me = chess.get(sq);
  if (!me || !RAYS[me.type]) return [];
  const pins = [];
  for (const [df, dr] of RAYS[me.type]) {
    let f = file(sq) + df, r = rank(sq) + dr, first = null;
    while (sqName(f, r)) {
      const s = sqName(f, r);
      const p = chess.get(s);
      if (p) {
        if (p.color === color) break;
        if (!first) first = { square: s, type: p.type };
        else {
          if (VAL[p.type] > VAL[first.type]) pins.push({ ...first, detras: p.type, detrasSquare: s });
          break;
        }
      }
      f += df; r += dr;
    }
  }
  return pins;
}
