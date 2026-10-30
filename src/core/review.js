import { EventBus } from './events.js';

/**
 * Modo revisión: mirar una posición anterior de la partida sin tocarla.
 *
 * Mientras está activo el Match queda en pausa (no mueven motores) y el tablero ignora clics.
 * Si la partida cambia por otro lado (una jugada nueva, deshacer), la revisión termina sola.
 *
 * Eventos: 'change' { active, ply, move }   (move = jugada recién mostrada al avanzar de 1 en 1, para animar)
 */
export class Review extends EventBus {
  constructor(game, match) {
    super();
    this.game = game;
    this.match = match;
    this.active = false;
    this.ply = 0;
    this._wasRunning = true;
    game.on('change', (ev) => {
      if (!this.active) return;
      // reset (partida nueva / cargada): se sale devolviendo la pausa; jugada o deshacer: la partida sigue viva
      this.exit({ restore: ev.kind === 'reset' });
    });
  }

  /** Jugada que se está mostrando (en vivo = la última). */
  get viewPly() { return this.active ? this.ply : this.game.ply; }

  /** FEN de la posición mostrada. */
  get fen() { return this.game.fens[this.viewPly]; }

  /** Entra en revisión en la jugada `ply` (0 = posición inicial). */
  enter(ply = this.game.ply) {
    if (!this.active) {
      this._wasRunning = this.match.running;
      this.match.setRunning(false);
      this.active = true;
    }
    this.#set(ply, true);
  }

  goto(ply) {
    if (!this.active) this.enter(ply);
    else this.#set(ply, false);
  }

  step(d) { this.goto(this.viewPly + d); }

  /** Sale de la revisión y vuelve a la posición actual. `restore`: devolver el estado de pausa que había. */
  exit({ restore = true } = {}) {
    if (!this.active) return;
    this.active = false;
    this.ply = this.game.ply;
    if (restore && this._wasRunning) this.match.setRunning(true);
    this.emit('change', { active: false, ply: this.ply, move: null });
  }

  /** Corta la partida en la jugada mostrada y deja seguir desde ahí (en pausa). */
  continueHere() {
    if (!this.active) return;
    const keep = this.ply;
    const ucis = this.game.uciHistory.slice(0, keep);
    const start = this.game.startFen;
    this.exit({ restore: false });
    this.game.loadMoves(ucis, start);
  }

  #set(ply, force) {
    const max = this.game.ply;
    const n = Math.max(0, Math.min(max, Math.trunc(ply) || 0));
    if (!force && n === this.ply) return;
    const prev = this.ply;
    this.ply = n;
    const move = n === prev + 1 && n > 0 ? this.game.moves[n - 1] : null;
    this.emit('change', { active: true, ply: n, move });
  }
}
