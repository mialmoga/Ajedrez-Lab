import { pieces, other, isHanging, pinsFrom } from './helpers.js';

/**
 * Marcas didácticas de una posición (modo Práctica). Reusa los mismos criterios que el narrador.
 *   riesgo      — piezas de `own` colgadas (atacadas sin defensa suficiente)        → rojo
 *   vulnerables — piezas del rival colgadas                                          → verde
 *   clavadas    — piezas de cualquier color clavadas a otra de más valor            → ámbar
 * Devuelve [{ sq, tipo }] con tipo 'riesgo' | 'vulnerable' | 'clavada'. (Una casilla puede llevar riesgo/vulnerable y clavada.)
 */
export function calcularMarcas(chess, own) {
  const out = [];
  const rival = other(own);
  for (const p of pieces(chess)) {
    if (p.type === 'k') continue;
    if (isHanging(chess, p.square, p.color)) out.push({ sq: p.square, tipo: p.color === own ? 'riesgo' : 'vulnerable' });
  }
  const seen = new Set();
  for (const color of [own, rival]) {
    for (const s of pieces(chess, color)) {
      for (const pin of pinsFrom(chess, s.square, color)) {
        if (pin.type === 'p' && !'kq'.includes(pin.detras)) continue;
        if (!seen.has(pin.square)) { seen.add(pin.square); out.push({ sq: pin.square, tipo: 'clavada' }); }
      }
    }
  }
  return out;
}
