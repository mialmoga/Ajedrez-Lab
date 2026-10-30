import { EventBus } from '../core/events.js';
import { createRounds, advance, nextStep, seriesScore, BYE } from './bracket.js';
import { pickOpening } from './openings.js';
import { playGame } from './game-runner.js';

export const FORMAT = 'ajedrez-lab/torneo@1';

export const DEFAULT_CONFIG = {
  juegosPorCruce: 2, // pares de partidas: 2 = 1 pareja (colores cambiados), 4 = 2 parejas…
  maxParesDesempate: 3, // parejas extra si siguen empatados; después avanza la mejor semilla
  maxJugadas: 250,
  concurrencia: 3, // partidas simultáneas
  usarLibreria: true, // aperturas desde la librería (si no, 4 jugadas al azar)
  adjudicar: true, // victoria por ventaja decisiva sostenida
};

class Semaphore {
  constructor(n) { this.free = Math.max(1, n); this.queue = []; }
  async acquire() {
    if (this.free > 0) { this.free--; return; }
    await new Promise((r) => this.queue.push(r));
  }
  release() {
    const next = this.queue.shift();
    if (next) next(); else this.free++;
  }
}

const uid = () => `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Torneo de eliminación directa entre motores. Todo el estado vive en `this.data`
 * (JSON puro, formato torneo@1), así se guarda, se reanuda y se reproduce sin volver a jugar.
 *
 * Eventos:
 *   'update'      el estado cambió (para redibujar y autoguardar)
 *   'game-start'  { key, matchId, blancas, negras }
 *   'progress'    { key }  una jugada más en una partida en vivo (ver this.live)
 *   'game-done'   { matchId, game }
 *   'match-done'  { match }
 *   'finished'    { campeon }
 *   'error'       { message }
 */
export class Tournament extends EventBus {
  /** @param {{ engines:{createEngine:Function,getEngineInfo:Function}, library?:object }} deps */
  constructor(deps, data) {
    super();
    this.engines = deps.engines;
    this.library = deps.library ?? null;
    this.data = data;
    this.running = false;
    this.live = new Map(); // key -> { matchId, blancas, negras, jugadas, evals }
    this._ctrl = null;
  }

  /** @param participantes [{ nombre, motor, nivel, limites? }] en orden de semilla */
  static create(deps, { nombre = 'Torneo', participantes, config = {} }) {
    const parts = participantes.map((p, i) => ({
      id: `p${i + 1}`, nombre: p.nombre || `Participante ${i + 1}`, motor: p.motor, nivel: p.nivel ?? null,
      limites: p.limites ?? null, opciones: p.opciones ?? null, semilla: i + 1,
    }));
    const now = new Date().toISOString();
    return new Tournament(deps, {
      formato: FORMAT, id: uid(), nombre, creado: now, actualizado: now,
      config: { ...DEFAULT_CONFIG, ...config },
      participantes: parts,
      rondas: createRounds(parts.map((p) => p.id)),
      campeon: null, estado: 'pendiente',
    });
  }

  static fromJSON(deps, obj) {
    if (obj?.formato !== FORMAT) throw new Error(`Formato no reconocido (se esperaba ${FORMAT})`);
    if (!Array.isArray(obj.participantes) || !Array.isArray(obj.rondas)) throw new Error('Torneo incompleto');
    const data = JSON.parse(JSON.stringify(obj));
    data.config = { ...DEFAULT_CONFIG, ...data.config };
    if (data.estado === 'en curso') data.estado = 'pausado'; // se guardó a medias
    for (const r of data.rondas) for (const m of r) if (m.estado === 'en curso') m.estado = 'pendiente';
    return new Tournament(deps, data);
  }

  toJSON() { return this.data; }

  participant(id) { return this.data.participantes.find((p) => p.id === id) ?? null; }
  get matches() { return this.data.rondas.flat(); }
  get final() { return this.data.rondas.at(-1)[0]; }

  #seedOf = (id) => this.participant(id)?.semilla ?? 999;

  #limitsOf(p) {
    const base = p.limites ?? this.engines.getEngineInfo(p.motor)?.levels.find((l) => l.id === p.nivel)?.limits ?? {};
    return p.opciones ? { ...base, features: { ...p.opciones } } : base;
  }

  #touch() {
    this.data.actualizado = new Date().toISOString();
    this.emit('update');
  }

  /** Ejecuta (o reanuda) el torneo. Se resuelve cuando termina o se pausa con stop(). */
  async run() {
    if (this.running || this.data.estado === 'terminado') return;
    this.running = true;
    this._ctrl = new AbortController();
    this.data.estado = 'en curso';
    this.#touch();
    const sem = new Semaphore(this.data.config.concurrencia);
    const proms = new Map();
    for (const round of this.data.rondas) {
      for (const m of round) {
        proms.set(m.id, (async () => {
          if (m.fuentes.length) await Promise.all(m.fuentes.map((id) => proms.get(id)));
          if (this._ctrl.signal.aborted || m.estado === 'terminado' || !m.a || !m.b || m.a === BYE || m.b === BYE) return;
          await this.#runMatch(m, sem);
        })().catch((err) => { this.emit('error', { message: err.message }); this._ctrl.abort(); }));
      }
    }
    await Promise.all(proms.values());
    const aborted = this._ctrl.signal.aborted;
    this.running = false;
    if (!aborted && this.final.estado === 'terminado') {
      this.data.campeon = this.final.ganador;
      this.data.estado = 'terminado';
      this.#touch();
      this.emit('finished', { campeon: this.data.campeon });
    } else {
      this.data.estado = 'pausado';
      this.#touch();
    }
  }

  /** Pausa: cancela las partidas en juego (se reiniciarán al reanudar) y conserva las terminadas. */
  stop() {
    this._ctrl?.abort();
  }

  async #runMatch(m, sem) {
    const cfg = this.data.config;
    m.estado = 'en curso';
    this.#touch();
    const signal = this._ctrl.signal;
    while (!signal.aborted) {
      const step = nextStep(m, cfg, this.#seedOf);
      if (step.action === 'decided') {
        m.puntos = seriesScore(m);
        m.ganador = step.winner;
        m.decidido = step.by;
        m.estado = 'terminado';
        advance(this.data.rondas, m);
        this.#touch();
        this.emit('match-done', { match: m });
        return;
      }
      let pair;
      if (step.action === 'finish-pair') pair = m.pares.find((p) => !p.partidas.every(Boolean));
      else {
        pair = {
          apertura: pickOpening(cfg.usarLibreria ? this.library : null),
          partidas: [null, null],
        };
        m.pares.push(pair);
        this.#touch();
      }
      const slots = [0, 1].filter((i) => !pair.partidas[i]);
      await Promise.all(slots.map((i) => this.#playSlot(m, pair, i, sem)));
    }
    if (m.estado === 'en curso') {
      m.puntos = seriesScore(m);
      m.estado = 'pendiente';
      this.#touch();
    }
  }

  async #playSlot(m, pair, slot, sem) {
    const signal = this._ctrl.signal;
    const [wId, bId] = slot === 0 ? [m.a, m.b] : [m.b, m.a];
    const w = this.participant(wId), b = this.participant(bId);
    await sem.acquire();
    const key = `${m.id}:${m.pares.indexOf(pair)}:${slot}`;
    try {
      if (signal.aborted) return;
      const live = { matchId: m.id, blancas: wId, negras: bId, jugadas: [...pair.apertura.jugadas], evals: pair.apertura.jugadas.map(() => null), apertura: pair.apertura };
      this.live.set(key, live);
      this.emit('game-start', { key, matchId: m.id, blancas: wId, negras: bId });
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
      pair.partidas[slot] = {
        blancas: wId, negras: bId, resultado: res.resultado, razon: res.razon,
        jugadas: res.jugadas, evals: res.evals, tiempoMs: res.tiempoMs,
      };
      m.puntos = seriesScore(m);
      this.#touch();
      this.emit('game-done', { matchId: m.id, game: pair.partidas[slot] });
    } finally {
      this.live.delete(key);
      sem.release();
    }
  }
}
