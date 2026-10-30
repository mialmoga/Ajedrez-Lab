import { EventBus } from '../core/events.js';
import { pickOpening } from '../tournament/openings.js';
import { playGame } from '../tournament/game-runner.js';
import { roundRobin } from './schedule.js';
import { finishedGames, estimateElo } from './standings.js';

export const FORMAT = 'ajedrez-lab/liga@1';
export const DEFAULT_CONFIG = { maxJugadas: 250, concurrencia: 3, usarLibreria: true, adjudicar: true };

class Semaphore {
  constructor(n) { this.free = Math.max(1, n); this.queue = []; }
  async acquire() { if (this.free > 0) { this.free--; return; } await new Promise((r) => this.queue.push(r)); }
  release() { const next = this.queue.shift(); if (next) next(); else this.free++; }
}
const uid = () => `l-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Liga todos contra todos. Cada cruce = una pareja de partidas (colores cambiados, misma apertura).
 * Estado en `this.data` (JSON puro, formato liga@1). Mismos eventos que Tournament:
 * 'update', 'game-start' {key}, 'progress' {key}, 'game-done', 'finished', 'error'.
 */
export class League extends EventBus {
  constructor(deps, data) {
    super();
    this.engines = deps.engines;
    this.library = deps.library ?? null;
    this.data = data;
    this.running = false;
    this.live = new Map();
    this._ctrl = null;
  }

  static create(deps, { nombre = 'Liga', participantes, config = {} }) {
    const parts = participantes.map((p, i) => ({
      id: `p${i + 1}`, nombre: p.nombre || `Participante ${i + 1}`, motor: p.motor, nivel: p.nivel ?? null, limites: p.limites ?? null, opciones: p.opciones ?? null, semilla: i + 1,
    }));
    const now = new Date().toISOString();
    return new League(deps, {
      formato: FORMAT, id: uid(), nombre, creado: now, actualizado: now, config: { ...DEFAULT_CONFIG, ...config },
      participantes: parts,
      cruces: roundRobin(parts.map((p) => p.id)).map((c) => ({ ...c, estado: 'pendiente', pares: [] })),
      estado: 'pendiente',
    });
  }

  static fromJSON(deps, obj) {
    if (obj?.formato !== FORMAT) throw new Error(`Formato no reconocido (se esperaba ${FORMAT})`);
    if (!Array.isArray(obj.participantes) || !Array.isArray(obj.cruces)) throw new Error('Liga incompleta');
    const data = JSON.parse(JSON.stringify(obj));
    data.config = { ...DEFAULT_CONFIG, ...data.config };
    if (data.estado === 'en curso') data.estado = 'pausado';
    for (const c of data.cruces) if (c.estado === 'en curso') c.estado = 'pendiente';
    return new League(deps, data);
  }

  toJSON() { return this.data; }
  participant(id) { return this.data.participantes.find((p) => p.id === id) ?? null; }
  get matches() { return this.data.cruces; }

  /** Elo conocido (id → Elo) de participantes cuyo nivel declara `elo` (p. ej. Stockfish limitado). */
  anchors() {
    const m = new Map();
    for (const p of this.data.participantes) {
      const elo = this.#limitsOf(p).elo;
      if (elo) m.set(p.id, elo);
    }
    return m;
  }

  eloEstimates() {
    return estimateElo(this.data.participantes.map((p) => p.id), finishedGames(this.data.cruces), this.anchors());
  }

  #limitsOf(p) {
    const base = p.limites ?? this.engines.getEngineInfo(p.motor)?.levels.find((l) => l.id === p.nivel)?.limits ?? {};
    return p.opciones ? { ...base, features: { ...p.opciones } } : base;
  }

  #touch() { this.data.actualizado = new Date().toISOString(); this.emit('update'); }

  async run() {
    if (this.running || this.data.estado === 'terminado') return;
    this.running = true;
    this._ctrl = new AbortController();
    this.data.estado = 'en curso';
    this.#touch();
    const sem = new Semaphore(this.data.config.concurrencia);
    await Promise.all(this.data.cruces.map((c) => this.#runMatch(c, sem).catch((err) => { this.emit('error', { message: err.message }); this._ctrl.abort(); })));
    const aborted = this._ctrl.signal.aborted;
    this.running = false;
    if (!aborted && this.data.cruces.every((c) => c.estado === 'terminado')) {
      this.data.estado = 'terminado';
      this.#touch();
      this.emit('finished', {});
    } else {
      this.data.estado = 'pausado';
      this.#touch();
    }
  }

  stop() { this._ctrl?.abort(); }

  async #runMatch(c, sem) {
    if (c.estado === 'terminado' || this._ctrl.signal.aborted) return;
    c.estado = 'en curso';
    let pair = c.pares[0];
    if (!pair) { pair = { apertura: pickOpening(this.data.config.usarLibreria ? this.library : null), partidas: [null, null] }; c.pares.push(pair); }
    this.#touch();
    await Promise.all([0, 1].filter((i) => !pair.partidas[i]).map((i) => this.#playSlot(c, pair, i, sem)));
    if (pair.partidas.every(Boolean)) { c.estado = 'terminado'; this.#touch(); }
    else if (c.estado === 'en curso') { c.estado = 'pendiente'; this.#touch(); }
  }

  async #playSlot(c, pair, slot, sem) {
    const signal = this._ctrl.signal;
    const [wId, bId] = slot === 0 ? [c.a, c.b] : [c.b, c.a];
    const w = this.participant(wId), b = this.participant(bId);
    await sem.acquire();
    const key = `${c.id}:0:${slot}`;
    try {
      if (signal.aborted) return;
      const live = { matchId: c.id, blancas: wId, negras: bId, jugadas: [...pair.apertura.jugadas], evals: pair.apertura.jugadas.map(() => null), apertura: pair.apertura };
      this.live.set(key, live);
      this.emit('game-start', { key, matchId: c.id, blancas: wId, negras: bId });
      this.#touch();
      const res = await playGame({
        white: { engineId: w.motor, limits: this.#limitsOf(w) },
        black: { engineId: b.motor, limits: this.#limitsOf(b) },
        opening: pair.apertura.jugadas,
        maxPlies: this.data.config.maxJugadas,
        adjudicate: this.data.config.adjudicar,
        createEngine: this.engines.createEngine,
        signal,
        onMove: ({ move, eval: ev }) => { live.jugadas.push(move); live.evals.push(ev); this.emit('progress', { key }); },
      });
      this.live.delete(key);
      if (res.aborted) {
        if (!signal.aborted) throw new Error('Una partida se interrumpió inesperadamente (el motor no devolvió jugada)');
        this.#touch();
        return;
      }
      pair.partidas[slot] = { blancas: wId, negras: bId, resultado: res.resultado, razon: res.razon, jugadas: res.jugadas, evals: res.evals, tiempoMs: res.tiempoMs };
      this.#touch();
      this.emit('game-done', { matchId: c.id, game: pair.partidas[slot] });
    } finally {
      this.live.delete(key);
      sem.release();
    }
  }
}
