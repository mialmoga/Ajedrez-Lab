import { Engine } from '../engine.js';
import { Chess } from '../../core/chess.js';

/**
 * Motor de juguete: jugada legal al azar. Sirve de ejemplo mínimo del contrato
 * (copia este archivo para empezar un motor nuevo) y de rival para probar.
 */
export class RandomEngine extends Engine {
  async go() {
    const chess = new Chess(this.fen);
    const moves = chess.moves({ verbose: true });
    if (!moves.length) return null;
    const m = moves[Math.floor(Math.random() * moves.length)];
    return { move: m.from + m.to + (m.promotion ?? ''), eval: null, depth: 0, nodes: 1, pv: [] };
  }
}
