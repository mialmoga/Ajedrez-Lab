/**
 * Juez: usa un motor del registro (Stockfish, Minimax v2…) para evaluar posiciones.
 * Tiene su propia instancia de motor (no interfiere con los jugadores), atiende una consulta a la vez
 * y guarda en caché por posición y juez.
 */
import { UMBRALES_DEFECTO } from './verdict.js';

export class Judge {
  /** @param {{engines:{createEngine:Function,getEngineInfo:Function,listEngines:Function}, umbrales?:object}} deps */
  constructor({ engines, umbrales = {} }) {
    this.engines = engines;
    this.umbrales = { ...UMBRALES_DEFECTO, ...umbrales };
    this.config = { enabled: true, engineId: null, levelId: null };
    this._engine = null;
    this._engineKey = null;
    this._chain = Promise.resolve();
    this._cache = new Map();
    this._gen = 0;
  }

  /** Motores válidos como juez (cualquiera menos el aleatorio, que no evalúa). */
  options() {
    return this.engines.listEngines().filter((e) => e.id !== 'random');
  }

  defaultEngineId() {
    const ids = this.options().map((e) => e.id);
    return ids.includes('stockfish') ? 'stockfish' : ids.includes('minimax2') ? 'minimax2' : ids[0] ?? null;
  }

  setConfig(cfg) {
    this.config = { ...this.config, ...cfg };
    if (!this.config.engineId) this.config.engineId = this.defaultEngineId();
    const info = this.engines.getEngineInfo(this.config.engineId);
    const levels = info?.levels ?? [];
    if (!levels.some((l) => l.id === this.config.levelId)) this.config.levelId = (levels.find((l) => l.max) ?? levels.at(-1) ?? levels[0])?.id ?? null; // por defecto el nivel más alto
    const key = `${this.config.engineId}:${this.config.levelId}`;
    if (key !== this._engineKey) { this._gen++; this._disposeEngine(); }
    return this.config;
  }

  get name() {
    const info = this.engines.getEngineInfo(this.config.engineId);
    const lvl = info?.levels.find((l) => l.id === this.config.levelId);
    return info ? `${info.name}${lvl && info.levels.length > 1 ? ` (${lvl.name})` : ''}` : '—';
  }

  /** Nombre corto para frases ("Stockfish 19 (WASM lite)"). */
  get shortName() {
    return this.engines.getEngineInfo(this.config.engineId)?.name ?? '—';
  }

  /** ¿El juez configurado es débil? (niveles bajos fiables solo para lo grueso) */
  get weak() {
    const levels = this.engines.getEngineInfo(this.config.engineId)?.levels ?? [];
    const idx = levels.findIndex((l) => l.id === this.config.levelId);
    if (idx >= 0 && typeof levels[idx].weak === 'boolean') return levels[idx].weak; // el motor lo declara
    return levels.length > 2 && idx >= 0 && idx < Math.ceil(levels.length / 2) - 1;
  }

  _disposeEngine() {
    try { this._engine?.dispose(); } catch { /* ya liberado */ }
    this._engine = null;
    this._engineKey = null;
  }

  /** Evalúa un FEN → { eval, mate, move, depth } (blancas), o null. Se serializa: una consulta a la vez. */
  evaluate(fen) {
    if (!this.config.engineId) this.setConfig({});
    const gen = this._gen;
    const ckey = `${this.config.engineId}:${this.config.levelId}|${fen.split(' ').slice(0, 4).join(' ')}`;
    if (this._cache.has(ckey)) return Promise.resolve(this._cache.get(ckey));
    const job = this._chain.then(async () => {
      if (gen !== this._gen) return null; // el juez cambió mientras esperaba
      const key = `${this.config.engineId}:${this.config.levelId}`;
      if (!this._engine || this._engineKey !== key) {
        this._disposeEngine();
        this._engine = await this.engines.createEngine(this.config.engineId);
        this._engineKey = key;
      }
      const info = this.engines.getEngineInfo(this.config.engineId);
      const base = info?.levels.find((l) => l.id === this.config.levelId)?.limits ?? {};
      const limits = { ...base, time: Math.min(base.time ?? Infinity, this.umbrales.juezTiempoMs), noise: 0 };
      await this._engine.setPosition(fen, null);
      const res = await this._engine.go(limits);
      if (res && gen === this._gen) {
        if (this._cache.size > 3000) this._cache.clear();
        this._cache.set(ckey, res);
      }
      return res ?? null;
    });
    this._chain = job.catch(() => null);
    return job;
  }

  dispose() { this._gen++; this._disposeEngine(); this._cache.clear(); }
}
