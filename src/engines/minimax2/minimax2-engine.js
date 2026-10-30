import { Engine } from '../engine.js';
import { DEFAULT_FEATURES } from './minimax2-core.js';

/** Funciones activadas por defecto (se sobrescriben al cargar library/minimax2-config.json). */
let defaults = { ...DEFAULT_FEATURES };
export function setMinimax2Defaults(features = {}) { defaults = { ...DEFAULT_FEATURES, ...features }; }
export function getMinimax2Defaults() { return { ...defaults }; }

/**
 * Proxy del motor Minimax v2: manda la búsqueda a un Web Worker.
 * stop() termina el worker (una búsqueda síncrona no puede escuchar mensajes) y se
 * recrea solo en la siguiente llamada a go().
 */
export class Minimax2Engine extends Engine {
  #worker = null;
  #pending = null;
  #seq = 0;

  async setPosition(fen, historial = null) {
    this.fen = fen;
    this.historial = historial;
  }

  async init() {
    this.#spawn();
  }

  #spawn() {
    const w = new Worker(new URL('./minimax2-worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      const { id, type } = e.data;
      if (!this.#pending || this.#pending.id !== id) return;
      if (type === 'info') this.onInfo?.(e.data.info);
      else if (type === 'result') { const p = this.#pending; this.#pending = null; p.resolve(e.data.result); }
      else if (type === 'error') { const p = this.#pending; this.#pending = null; p.reject(new Error(e.data.message)); }
    };
    w.onerror = (ev) => {
      const p = this.#pending;
      this.#pending = null;
      p?.reject(new Error(`Worker del motor falló: ${ev.message ?? 'error desconocido'}`));
    };
    this.#worker = w;
  }

  go(limits = {}) {
    if (!this.#worker) this.#spawn();
    if (this.#pending) this.stop();
    if (!this.#worker) this.#spawn();
    return new Promise((resolve, reject) => {
      const id = ++this.#seq;
      this.#pending = { id, resolve, reject };
      this.#worker.postMessage({ id, fen: this.fen, limits: { ...limits, features: { ...defaults, ...(limits.features ?? {}) }, historial: this.historial } });
    });
  }

  stop() {
    const p = this.#pending;
    this.#pending = null;
    this.#worker?.terminate();
    this.#worker = null;
    p?.resolve(null);
  }

  dispose() {
    this.stop();
  }
}

/** Niveles de fuerza: más profundidad/tiempo = más fuerte. El ruido debilita a propósito. */
export const MINIMAX2_LEVELS = [
  { id: '1', name: '1 · Aprendiz', limits: { depth: 1, time: 300, noise: 180 } },
  { id: '2', name: '2 · Casual', limits: { depth: 2, time: 600, noise: 70 } },
  { id: '3', name: '3 · Club', limits: { depth: 4, time: 1500, noise: 15 } },
  { id: '4', name: '4 · Fuerte', limits: { depth: 6, time: 3000, noise: 0 } },
  { id: '5', name: '5 · Experto', limits: { depth: 10, time: 8000, noise: 0 } },
];
