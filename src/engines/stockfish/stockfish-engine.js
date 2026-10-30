import { Engine } from '../engine.js';
import { Chess } from '../../core/chess.js';

const head3 = (fen) => fen.split(' ').slice(0, 3).join(' '); // tablero + turno + enroques

/**
 * Comando UCI `position` con las jugadas desde la última captura o movimiento de peón, para que Stockfish
 * vea las repeticiones de la partida (con solo el FEN actual está ciego a ellas).
 * `historial` = FEN de las posiciones previas. Si no se puede reconstruir, cae al `position fen` simple.
 */
export function positionCommand(fen, historial) {
  const plain = `position fen ${fen}`;
  const n = historial?.length ?? 0;
  const hm = Number(fen.split(' ')[4]);
  if (!n || !(hm > 0)) return plain;
  const s = Math.max(0, n - hm);
  try {
    const c = new Chess(historial[s]);
    const ucis = [];
    for (let i = s; i < n; i++) {
      const target = head3(i + 1 < n ? historial[i + 1] : fen);
      let found = null;
      for (const m of c.moves({ verbose: true })) {
        c.move(m);
        const ok = head3(c.fen()) === target;
        c.undo();
        if (ok) { found = m; break; }
      }
      if (!found) return plain;
      c.move(found);
      ucis.push(found.from + found.to + (found.promotion ?? ''));
    }
    return ucis.length ? `position fen ${historial[s]} moves ${ucis.join(' ')}` : plain;
  } catch { return plain; }
}


/** Archivo del motor (junto a su .wasm). Ver vendor/stockfish/README.txt para actualizarlo. */
export const STOCKFISH_FILE = '../../../vendor/stockfish/stockfish-19-lite-single.js';

/**
 * Stockfish WASM (versión lite, un hilo) en un Web Worker, hablando UCI.
 * - Los niveles usan UCI_LimitStrength + UCI_Elo (Elo aproximado de Stockfish).
 * - stop() termina el worker y se recrea en el siguiente go() (misma estrategia que el minimax).
 * @param {{workerFactory?: () => Worker}} [opts] workerFactory permite inyectar un Worker falso en pruebas.
 */
export class StockfishEngine extends Engine {
  #worker = null;
  #ready = null; // Promise que se cumple al terminar el saludo UCI
  #listeners = new Set();
  #pending = null;
  #factory;

  constructor({ workerFactory } = {}) {
    super();
    this.#factory = workerFactory ?? (() => new Worker(new URL(STOCKFISH_FILE, import.meta.url)));
  }

  async init() {
    await this.#start();
  }

  #send(cmd) { this.#worker.postMessage(cmd); }

  #waitFor(test, ms = 15000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.#listeners.delete(fn); reject(new Error('Stockfish no respondió a tiempo')); }, ms);
      const fn = (line) => { if (test(line)) { clearTimeout(t); this.#listeners.delete(fn); resolve(line); } };
      this.#listeners.add(fn);
    });
  }

  #start() {
    if (this.#ready) return this.#ready;
    const w = this.#factory();
    this.#worker = w;
    w.onmessage = (e) => {
      const line = typeof e.data === 'string' ? e.data : String(e.data?.data ?? e.data);
      for (const fn of [...this.#listeners]) fn(line);
    };
    w.onerror = (ev) => {
      const p = this.#pending;
      this.#pending = null;
      p?.reject(new Error(`Stockfish falló: ${ev.message ?? 'error desconocido'}`));
    };
    this.#ready = (async () => {
      const uciok = this.#waitFor((l) => l === 'uciok');
      this.#send('uci');
      await uciok;
      this.#send('setoption name Threads value 1');
      this.#send('setoption name Hash value 16');
      const ready = this.#waitFor((l) => l === 'readyok');
      this.#send('isready');
      await ready;
    })();
    this.#ready.catch(() => { this.#ready = null; });
    return this.#ready;
  }

  async go(limits = {}) {
    if (this.#pending) this.stop();
    await this.#start();
    const w = this.#worker;
    const fen = this.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const blackToMove = fen.split(' ')[1] === 'b';
    const sign = blackToMove ? -1 : 1; // Stockfish informa desde el lado que mueve; el contrato usa las blancas

    // Fuerza: Elo limitado (si el nivel lo pide) o fuerza máxima.
    if (limits.elo) {
      this.#send('setoption name UCI_LimitStrength value true');
      this.#send(`setoption name UCI_Elo value ${Math.round(limits.elo)}`);
    } else {
      this.#send('setoption name UCI_LimitStrength value false');
    }
    this.#send('ucinewgame');
    const ready = this.#waitFor((l) => l === 'readyok');
    this.#send('isready');
    await ready;
    if (this.#worker !== w) return null; // se canceló mientras se preparaba

    return new Promise((resolve, reject) => {
      this.#pending = { resolve, reject };
      let best = { eval: null, mate: null, depth: 0, nodes: 0, pv: [] };
      const fn = (line) => {
        if (line.startsWith('info ') && /\bscore\b/.test(line) && !/\b(lowerbound|upperbound)\b/.test(line)) {
          const info = parseInfo(line, sign);
          if (info) { best = { ...best, ...info }; this.onInfo?.({ depth: best.depth, eval: best.eval, mate: best.mate, nodes: best.nodes, pv: best.pv }); }
        } else if (line.startsWith('bestmove')) {
          this.#listeners.delete(fn);
          this.#pending = null;
          const move = line.split(/\s+/)[1];
          if (!move || move === '(none)') return resolve(null);
          resolve({ move, eval: best.eval, mate: best.mate, depth: best.depth, nodes: best.nodes, pv: best.pv.length ? best.pv : [move] });
        }
      };
      this.#listeners.add(fn);
      this.#send(positionCommand(fen, this.historial));
      const parts = ['go'];
      if (limits.depth) parts.push('depth', Math.max(1, Math.round(limits.depth)));
      if (limits.time) parts.push('movetime', Math.max(10, Math.round(limits.time)));
      if (parts.length === 1) parts.push('depth', 12);
      this.#send(parts.join(' '));
    });
  }

  stop() {
    const p = this.#pending;
    this.#pending = null;
    this.#listeners.clear();
    this.#worker?.terminate?.();
    this.#worker = null;
    this.#ready = null;
    p?.resolve(null);
  }

  dispose() { this.stop(); }
}

/** Interpreta una línea `info ... score cp|mate ... pv ...`. Devuelve null si no trae profundidad/puntuación. */
export function parseInfo(line, sign = 1) {
  const t = line.trim().split(/\s+/);
  const out = {};
  for (let i = 1; i < t.length; i++) {
    if (t[i] === 'depth') out.depth = +t[++i];
    else if (t[i] === 'nodes') out.nodes = +t[++i];
    else if (t[i] === 'multipv' && +t[i + 1] > 1) return null; // solo la mejor línea
    else if (t[i] === 'score') {
      if (t[i + 1] === 'cp') { out.eval = sign * +t[i + 2]; out.mate = null; }
      else if (t[i + 1] === 'mate') { out.mate = sign * +t[i + 2]; out.eval = out.mate > 0 ? 100000 : -100000; }
      i += 2;
    } else if (t[i] === 'pv') { out.pv = t.slice(i + 1); break; }
  }
  return out.eval == null ? null : out;
}

/** Niveles por Elo aproximado de Stockfish (UCI_Elo admite 1320–3190). */
const ELO = 'Elo limitado (errores arbitrarios)';
const PROF = 'Profundidad limitada (poca visión)';
/**
 * Dos tipos de dificultad, elegibles en el mismo desplegable (por grupos):
 *  - Elo limitado: UCI_LimitStrength + UCI_Elo. Juega con "errores" al azar; sirve de ancla del Elo estimado en las ligas.
 *  - Profundidad limitada: fuerza completa pero con pocas jugadas de visión; se parece más a un jugador corto de vista.
 * `weak` = juez poco fiable. `max` = nivel por defecto del juez.
 */
export const STOCKFISH_LEVELS = [
  { id: '1', group: ELO, name: '1 · ~1350 Elo', weak: true, limits: { elo: 1350, depth: 8, time: 400 } },
  { id: '2', group: ELO, name: '2 · ~1700 Elo', weak: true, limits: { elo: 1700, depth: 10, time: 600 } },
  { id: '3', group: ELO, name: '3 · ~2000 Elo', limits: { elo: 2000, depth: 12, time: 800 } },
  { id: '4', group: ELO, name: '4 · ~2400 Elo', limits: { elo: 2400, depth: 14, time: 1200 } },
  { id: '5', group: ELO, name: '5 · ~2800 Elo', limits: { elo: 2800, depth: 16, time: 2000 } },
  { id: 'p1', group: PROF, name: 'Prof. 1', weak: true, limits: { depth: 1, time: 100 } },
  { id: 'p2', group: PROF, name: 'Prof. 2', weak: true, limits: { depth: 2, time: 150 } },
  { id: 'p3', group: PROF, name: 'Prof. 4', weak: true, limits: { depth: 4, time: 250 } },
  { id: 'p4', group: PROF, name: 'Prof. 6', weak: true, limits: { depth: 6, time: 400 } },
  { id: 'p5', group: PROF, name: 'Prof. 8', limits: { depth: 8, time: 600 } },
  { id: 'p6', group: PROF, name: 'Prof. 12', limits: { depth: 12, time: 1500 } },
  { id: 'p7', group: PROF, name: 'Prof. 16', limits: { depth: 16, time: 3000 } },
  { id: '6', name: '6 · Máximo', max: true, limits: { depth: 22, time: 5000 } },
];
