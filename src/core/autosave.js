import { EventBus } from './events.js';
import { crearPartida } from '../exchange/partida.js';
import { DEFAULT_POSITION } from './game.js';

export const KEY_ACTUAL = 'ajedrez-lab:partida-actual';
export const KEY_LISTA = 'ajedrez-lab:partidas';

/** localStorage que nunca lanza (modo privado, cuota llena, etc.). */
export function safeStorage(ls = typeof localStorage !== 'undefined' ? localStorage : null) {
  return {
    get(k) { try { return ls ? JSON.parse(ls.getItem(k)) : null; } catch { return null; } },
    set(k, v) { try { ls?.setItem(k, JSON.stringify(v)); return !!ls; } catch { return false; } },
    remove(k) { try { ls?.removeItem(k); } catch { /* nada */ }},
  };
}

const pickPlayer = (p) => ({ kind: p.kind, engineId: p.engineId, levelId: p.levelId, custom: p.custom ?? null, features: p.features ?? null });
const isPrefix = (short, long) => short.length <= long.length && short.every((m, i) => m === long[i]);

/**
 * Autoguardado de la partida del tablero principal.
 *  - La partida actual se guarda en cada cambio, al pausar y (desde fuera) al cerrar/ocultar la pestaña.
 *  - Al terminar una partida, o al sustituirla por otra (Nueva, importar…), se archiva en una lista de las últimas `max`.
 *  - Al abrir la página se puede recuperar la partida y sus jugadores (`restore()`), siempre en pausa.
 * Eventos: 'list' (cambió la lista archivada), 'error' { message } (no cupo en el navegador).
 */
export class AutoSave extends EventBus {
  /** @param {{describe?: () => {blancas:string, negras:string}, storage?: ReturnType<typeof safeStorage>, max?: number, minPlies?: number, modo?: import('./modo.js').GameMode}} opts */
  constructor(game, match, { describe = () => ({}), storage = safeStorage(), max = 10, minPlies = 4, modo = null, analisis = null } = {}) {
    super();
    this.game = game;
    this.match = match;
    this.describe = describe;
    this.store = storage;
    this.max = max;
    this.minPlies = minPlies;
    this.modo = modo;
    this.analisisCtl = analisis; // AnalisisCtl: su análisis (si es de la partida actual) viaja con ella
    this.saved = storage.get(KEY_ACTUAL); // lo que había antes de abrir la página
    this.last = null; // instantánea de la partida anterior al próximo reset
    this.archivedCurrent = false;
    game.on('change', (ev) => this.#onChange(ev));
    game.on('gameover', () => this.#onGameOver());
    match.on('state', () => this.saveCurrent());
    analisis?.on('change', (e) => { if (e.estado === 'done' && e.vigente) this.#alTerminarAnalisis(); });
  }

  /** El análisis acaba de terminar (o se cargó): guárdalo con la partida actual y con su copia archivada, si ya la hay. */
  #alTerminarAnalisis() {
    this.last = this.#snap();
    this.saveCurrent();
    const clave = this.last.jugadas.join(' ') + '|' + (this.last.inicio ?? '');
    const lista = this.list();
    const e = lista.find((x) => x.jugadas.join(' ') + '|' + (x.inicio ?? '') === clave);
    if (e && !e.analisis) { e.analisis = this.analisisCtl.analisis; this.store.set(KEY_LISTA, lista); }
  }

  #snap() {
    const g = this.game;
    return {
      jugadas: g.uciHistory,
      inicio: g.startFen !== DEFAULT_POSITION ? g.startFen : undefined,
      ...(this.modo ? { modo: this.modo.value } : {}),
      ...(this.analisisCtl?.vigente ? { analisis: this.analisisCtl.analisis } : {}),
      ...this.describe(),
    };
  }

  #onChange(ev) {
    const snap = this.#snap();
    if (ev.kind === 'reset') {
      const prev = this.last;
      if (prev && prev.jugadas.length >= this.minPlies && !this.archivedCurrent && !(snap.jugadas.length > 0 && isPrefix(snap.jugadas, prev.jugadas))) this.#archive(prev, 'abandonada');
      this.archivedCurrent = false;
    }
    this.last = snap;
    this.saveCurrent();
  }

  #onGameOver() {
    const snap = this.#snap();
    this.#archive(snap, this.game.status().reason);
    this.archivedCurrent = true;
  }

  /** Escribe la partida actual y los jugadores. */
  saveCurrent() {
    if (this.saved && !this.game.ply) return; // aún sin recuperar: no pisar lo guardado con una partida vacía
    const snap = this.#snap();
    const ok = this.store.set(KEY_ACTUAL, {
      v: 1, ts: Date.now(), jugadas: snap.jugadas, inicio: snap.inicio,
      jugadores: { w: pickPlayer(this.match.players.w), b: pickPlayer(this.match.players.b) },
      pausada: !this.match.running,
      ...(this.modo ? { modo: this.modo.value } : {}),
      ...(snap.analisis ? { analisis: snap.analisis } : {}),
    });
    if (!ok) this.emit('error', { message: 'No cupo en el almacenamiento del navegador: exporta la partida para no perderla.' });
  }

  /** Partida guardada antes de abrir la página (o null si no hay o está vacía). */
  pending() {
    const s = this.saved;
    return s && Array.isArray(s.jugadas) && s.jugadas.length ? s : null;
  }

  /** Recupera la partida anterior: jugadores, jugadas y pausa. Devuelve cuántas jugadas cargó (0 si nada). */
  restore() {
    const s = this.pending();
    if (!s) return 0;
    for (const c of ['w', 'b']) if (s.jugadores?.[c]) Object.assign(this.match.players[c], s.jugadores[c]);
    this.match.setRunning(false); // siempre pausada: el usuario decide cuándo seguir
    this.saved = null;
    const n = this.game.loadMoves(s.jugadas, s.inicio ?? DEFAULT_POSITION);
    this.modo?.forzar(s.modo); // conserva el modo con el que se jugó (sin campo = prueba)
    this.analisisCtl?.cargarSiCoincide(s.analisis);
    return n;
  }

  // --- lista de últimas partidas ---
  list() { return this.store.get(KEY_LISTA) ?? []; }

  #archive(snap, razon) {
    if (!snap || snap.jugadas.length < this.minPlies) return;
    const lista = this.list();
    const clave = snap.jugadas.join(' ') + '|' + (snap.inicio ?? '');
    if (lista.some((e) => e.jugadas.join(' ') + '|' + (e.inicio ?? '') === clave)) return; // ya está
    let p;
    try { p = crearPartida({ jugadas: snap.jugadas, inicio: snap.inicio, blancas: snap.blancas, negras: snap.negras, modo: snap.modo, analisis: snap.analisis, razon: razon === 'abandonada' ? undefined : razon }); }
    catch { return; }
    if (razon === 'abandonada') p.resultado = '*';
    const entrada = { ...p, id: `g-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, guardada: new Date().toISOString(), estado: razon === 'abandonada' ? 'inconclusa' : 'terminada' };
    const nueva = [entrada, ...lista].slice(0, this.max);
    if (!this.store.set(KEY_LISTA, nueva)) this.emit('error', { message: 'No cupo en el almacenamiento: exporta tus partidas.' });
    this.emit('list', {});
  }

  remove(id) { this.store.set(KEY_LISTA, this.list().filter((e) => e.id !== id)); this.emit('list', {}); }
  clear() { this.store.remove(KEY_LISTA); this.emit('list', {}); }
}
