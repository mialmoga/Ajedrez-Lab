import { EventBus } from './events.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Orquesta quién juega cada lado: humano o motor (cada lado con su propio motor y nivel).
 * Humano vs máquina, máquina vs máquina y humano vs humano son solo combinaciones de `players`.
 *
 * Eventos:
 *   'thinking'    { color }                 un motor empezó a pensar
 *   'info'        { color, info }           información parcial (profundidad, eval, pv)
 *   'engine-move' { color, result, book }   un motor jugó
 *   'state'       { running }               cambió pausa/reanudar
 *   'error'       { message }
 */
export class Match extends EventBus {
  /**
   * @param {import('./game.js').Game} game
   * @param {{ createEngine: Function, getEngineInfo: Function }} engines  API del registro
   */
  constructor(game, engines) {
    super();
    this.game = game;
    this.engines = engines;
    this.players = {
      w: { kind: 'human' },
      b: { kind: 'engine', engineId: 'minimax', levelId: '3', custom: null },
    };
    this.running = true;
    this.moveDelay = 600; // ms mínimos entre jugadas de motor (para ver la animación)
    this.book = null; // (fen) => uci | null  — libro de aperturas opcional
    this.useBook = false;
    this.thinking = null; // color que está pensando o null
    this.lastInfo = { w: null, b: null };
    this._token = 0;
    this._engines = { w: null, b: null }; // { id, engine }
    game.on('change', () => {
      this._cancel();
      this._kick();
    });
  }

  isEngineTurn() {
    return this.players[this.game.turn].kind === 'engine';
  }

  setPlayer(color, cfg) {
    this.players[color] = { ...this.players[color], ...cfg };
    this._cancel();
    this._kick();
  }

  setRunning(running) {
    this.running = running;
    this.emit('state', { running });
    if (!running) this._cancel();
    else this._kick();
  }

  /** Límites de búsqueda efectivos del jugador (nivel preestablecido o personalizado). */
  limitsFor(color) {
    const p = this.players[color];
    const info = this.engines.getEngineInfo(p.engineId);
    const base = p.custom ? { ...p.custom } : { ...(info?.levels.find((l) => l.id === p.levelId)?.limits ?? info?.levels[0]?.limits ?? {}) };
    return p.features ? { ...base, features: { ...p.features } } : base;
  }

  _cancel() {
    this._token++;
    if (this.thinking) {
      this._engines[this.thinking]?.engine.stop();
      this.thinking = null;
      this.emit('thinking', { color: null });
    }
  }

  async _engineFor(color) {
    const id = this.players[color].engineId;
    const cached = this._engines[color];
    if (cached?.id === id) return cached.engine;
    cached?.engine.dispose();
    const engine = await this.engines.createEngine(id);
    this._engines[color] = { id, engine };
    return engine;
  }

  async _kick() {
    const { game } = this;
    if (!this.running || game.status().over) return;
    const color = game.turn;
    if (this.players[color].kind !== 'engine') return;

    const token = ++this._token;
    this.thinking = color;
    this.emit('thinking', { color });
    try {
      const fen = game.fen;
      const t0 = Date.now();
      let result = null;
      let fromBook = false;

      if (this.useBook && this.book) {
        const uci = this.book(fen);
        if (uci) { result = { move: uci }; fromBook = true; }
      }
      if (!result) {
        const engine = await this._engineFor(color);
        if (token !== this._token) return;
        await engine.setPosition(fen, game.fens.slice(0, -1));
        engine.onInfo = (info) => {
          if (token !== this._token) return;
          this.lastInfo[color] = info;
          this.emit('info', { color, info });
        };
        result = await engine.go(this.limitsFor(color));
      }
      const wait = this.moveDelay - (Date.now() - t0);
      if (wait > 0) await sleep(wait);
      if (token !== this._token || !result) return;

      this.thinking = null;
      this.emit('thinking', { color: null });
      const move = game.play(result.move);
      if (!move) {
        this.running = false;
        this.emit('state', { running: false });
        this.emit('error', { message: `El motor devolvió una jugada ilegal: ${result.move}` });
        return;
      }
      this.emit('engine-move', { color, result, book: fromBook });
    } catch (err) {
      if (token !== this._token) return;
      this.thinking = null;
      this.running = false;
      this.emit('thinking', { color: null });
      this.emit('state', { running: false });
      this.emit('error', { message: `Error del motor: ${err.message}` });
    }
  }

  dispose() {
    this._cancel();
    for (const c of ['w', 'b']) this._engines[c]?.engine.dispose();
  }
}
