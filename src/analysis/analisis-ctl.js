import { EventBus } from '../core/events.js';
import { DEFAULT_POSITION } from '../core/chess.js';
import { analizarPartida, resumir } from './analisis.js';

/**
 * Controlador del análisis de la partida del tablero principal.
 * Guarda el análisis vigente (de ESTA partida), lo ejecuta con el juez y avisa a los paneles.
 * Eventos: 'change' { estado:'idle'|'running'|'done'|'error', hecho, total, error? }
 */
export class AnalisisCtl extends EventBus {
  constructor({ game, match, judge, library, explainer = null }) {
    super();
    Object.assign(this, { game, match, judge, library, explainer });
    this.analisis = null;
    this.resumen = null;
    this.estado = 'idle';
    this.hecho = 0;
    this.total = 0;
    this.error = null;
    this._ctl = null;
    this._clave = null; // partida a la que pertenece this.analisis
    game.on('change', (ev) => {
      if (this.estado === 'running') this.cancelar(); // la partida cambió: lo analizado ya no vale
      if (ev?.kind === 'reset' && !this.vigente) this.limpiar(false); // otra partida: el análisis anterior no le corresponde
      this.emit('change', this.info());
    });
  }

  claveActual() { return `${this.game.startFen}|${this.game.uciHistory.join(' ')}`; }

  /** ¿El análisis guardado corresponde a la partida tal como está ahora? */
  get vigente() { return !!this.analisis && this._clave === this.claveActual(); }

  info() { return { estado: this.estado, hecho: this.hecho, total: this.total, error: this.error, vigente: this.vigente }; }

  /** Clase de la jugada k (0-based) o null si no hay análisis vigente. */
  claseDe(k) { return this.vigente ? this.resumen?.plies[k] ?? null : null; }

  /** ¿Se puede analizar ahora? Devuelve el motivo si no. */
  motivoNo() {
    if (!this.game.uciHistory.length) return 'Aún no hay jugadas que analizar.';
    if (!this.judge.config.enabled) return 'Activa el «Análisis con motor · juez» para poder analizar.';
    if (this.match.running && !this.game.status().over) return 'Pon la partida en pausa para analizarla (así el análisis no le quita tiempo al motor que juega).';
    return null;
  }

  async analizar() {
    if (this.estado === 'running' || this.motivoNo()) return false;
    const jugadas = [...this.game.uciHistory], inicio = this.game.startFen, clave = this.claveActual();
    this._ctl = new AbortController();
    Object.assign(this, { estado: 'running', hecho: 0, total: jugadas.length + 1, error: null });
    this.emit('change', this.info());
    try {
      const a = await analizarPartida({
        judge: this.judge, library: this.library, inicio: inicio === DEFAULT_POSITION ? undefined : inicio, jugadas, signal: this._ctl.signal,
        onProgress: (h, t) => { this.hecho = h; this.total = t; this.emit('change', this.info()); },
      });
      this.cargar(a, clave);
      this.estado = 'done';
    } catch (e) {
      this.estado = e.name === 'AbortError' ? 'idle' : 'error';
      this.error = e.name === 'AbortError' ? null : (e.message ?? String(e));
    }
    this._ctl = null;
    this.emit('change', this.info());
    return this.estado === 'done';
  }

  cancelar() { this._ctl?.abort(); }

  /** Instala un análisis ya hecho (de un guardado o de un JSON importado). `clave` por defecto = la partida actual. */
  cargar(analisis, clave = null) {
    this.analisis = analisis;
    this._clave = clave ?? `${analisis.inicio ?? DEFAULT_POSITION}|${analisis.jugadas.join(' ')}`;
    this.resumen = resumir(analisis, { umbrales: this.judge.umbrales });
    this.emit('change', this.info());
  }

  /**
   * Instala un análisis venido de fuera (guardado, JSON importado) solo si es de ESTA partida, jugada por jugada.
   * Devuelve true si lo cargó.
   */
  cargarSiCoincide(a) {
    if (!a || a.version !== 1 || !Array.isArray(a.pos) || !Array.isArray(a.jugadas) || a.pos.length !== a.jugadas.length + 1) return false;
    if (`${a.inicio ?? DEFAULT_POSITION}|${a.jugadas.join(' ')}` !== this.claveActual()) return false;
    this.estado = 'done';
    this.cargar(a, this.claveActual());
    return true;
  }

  limpiar(emitir = true) {
    this.analisis = null; this.resumen = null; this._clave = null; this.estado = 'idle';
    if (emitir) this.emit('change', this.info());
  }
}
