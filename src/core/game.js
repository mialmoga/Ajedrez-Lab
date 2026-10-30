import { Chess, DEFAULT_POSITION } from './chess.js';
import { EventBus } from './events.js';

const UCI_RE = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/;

/**
 * Estado de una partida. Envuelve chess.js y emite eventos:
 *   'change'   { kind: 'move'|'undo'|'reset', move? }   (cualquier cambio de posición)
 *   'gameover' { reason, winner }                        (winner: 'w' | 'b' | null)
 */
export class Game extends EventBus {
  constructor(fen = DEFAULT_POSITION) {
    super();
    this.reset(fen, { silent: true });
  }

  /** Reinicia la partida desde un FEN (por defecto la posición inicial). */
  reset(fen = DEFAULT_POSITION, { silent = false } = {}) {
    this.chess = new Chess(fen); // lanza error si el FEN es inválido
    this.startFen = fen;
    this.fens = [this.chess.fen()]; // fens[i] = posición tras i jugadas
    this.moves = []; // jugadas verbose (con san, from, to, ...)
    if (!silent) this.emit('change', { kind: 'reset' });
  }

  get fen() { return this.chess.fen(); }
  get turn() { return this.chess.turn(); }
  get ply() { return this.moves.length; }
  get lastMove() { return this.moves[this.moves.length - 1] ?? null; }
  get inCheck() { return this.chess.isCheck(); }

  /** Jugadas en UCI ("e2e4", "e7e8q"). */
  get uciHistory() {
    return this.moves.map(uci);
  }

  /** Jugadas legales (verbose). Si se da `from`, solo las de esa casilla. */
  legalMoves(from) {
    return this.chess.moves({ verbose: true, ...(from ? { square: from } : {}) });
  }

  /**
   * Juega una jugada. Acepta SAN ("Nf3"), UCI ("g1f3") u objeto {from,to,promotion}.
   * Devuelve la jugada verbose o null si es ilegal.
   */
  play(input) {
    if (this.status().over) return null;
    let move;
    try {
      if (typeof input === 'string') {
        const m = UCI_RE.exec(input.trim());
        move = m
          ? this.chess.move({ from: m[1], to: m[2], promotion: m[3] })
          : this.chess.move(input.trim());
      } else {
        move = this.chess.move(input);
      }
    } catch {
      return null;
    }
    this.moves.push(move);
    this.fens.push(this.chess.fen());
    this.emit('change', { kind: 'move', move });
    const st = this.status();
    if (st.over) this.emit('gameover', st);
    return move;
  }

  undo() {
    const m = this.chess.undo();
    if (!m) return null;
    this.moves.pop();
    this.fens.pop();
    this.emit('change', { kind: 'undo', move: m });
    return m;
  }

  /** Rehace la partida desde `startFen` con una lista de jugadas (SAN o UCI). */
  loadMoves(list, fen = DEFAULT_POSITION) {
    this.reset(fen, { silent: true });
    let ok = 0;
    for (const m of list) {
      const mv = this.#silentPlay(m);
      if (!mv) break;
      ok++;
    }
    this.emit('change', { kind: 'reset' });
    return ok;
  }

  #silentPlay(input) {
    try {
      const m = typeof input === 'string' && UCI_RE.test(input)
        ? this.chess.move({ from: input.slice(0, 2), to: input.slice(2, 4), promotion: input[4] })
        : this.chess.move(input);
      this.moves.push(m);
      this.fens.push(this.chess.fen());
      return m;
    } catch {
      return null;
    }
  }

  /** { over, reason, winner } */
  status() {
    return chessStatus(this.chess);
  }

  /** Tablero 8x8 para renderizar: array[fila 0 = rango 8][col 0 = columna a] */
  board() {
    return this.chess.board();
  }

  /** PGN-ish legible: "1. e4 e5 2. Nf3" */
  moveText(maxPlies = Infinity) {
    const start = Math.max(0, this.moves.length - maxPlies);
    const parts = [];
    for (let i = start; i < this.moves.length; i++) {
      const whiteMove = this.startFen === DEFAULT_POSITION ? i % 2 === 0 : this.moves[i].color === 'w';
      const num = Math.floor(i / 2) + 1;
      if (whiteMove) parts.push(`${num}. ${this.moves[i].san}`);
      else parts.push(i === start ? `${num}... ${this.moves[i].san}` : this.moves[i].san);
    }
    return parts.join(' ');
  }
}

export function uci(move) {
  return move.from + move.to + (move.promotion ?? '');
}

export { DEFAULT_POSITION };

/** Estado de fin de partida de una instancia de chess.js: { over, reason, winner }. */
export function chessStatus(c) {
  if (c.isCheckmate()) return { over: true, reason: 'jaque mate', winner: c.turn() === 'w' ? 'b' : 'w' };
  if (c.isStalemate()) return { over: true, reason: 'ahogado', winner: null };
  if (c.isInsufficientMaterial()) return { over: true, reason: 'material insuficiente', winner: null };
  if (c.isThreefoldRepetition()) return { over: true, reason: 'triple repetición', winner: null };
  if (c.isDrawByFiftyMoves()) return { over: true, reason: 'regla de 50 jugadas', winner: null };
  return { over: false, reason: null, winner: null };
}
