/**
 * CONTRATO DE MOTOR
 * -----------------
 * Cualquier motor (propio, Stockfish WASM, una red neuronal, un servicio externo...)
 * es una clase que implementa esta interfaz y se registra en `registry.js`.
 * El resto de la app (Match, UI) solo conoce este contrato.
 *
 * Convenciones:
 *  - Las jugadas viajan en UCI: "e2e4", "e7e8q" (así habla también Stockfish).
 *  - `eval` va en centipeones desde el punto de vista de las BLANCAS (+ = mejor blancas).
 *  - `mate` (opcional): número de jugadas para mate; positivo = mate de blancas.
 *
 * @typedef {Object} SearchLimits
 * @property {number} [depth]  profundidad máxima (plies)
 * @property {number} [time]   tiempo máximo en ms
 * @property {number} [noise]  ruido en centipeones para debilitar al motor (niveles bajos)
 *
 * @typedef {Object} SearchResult
 * @property {string}   move     mejor jugada en UCI
 * @property {number}   [eval]   evaluación en cp (punto de vista de blancas)
 * @property {number|null} [mate]
 * @property {number}   [depth]  profundidad alcanzada
 * @property {number}   [nodes]
 * @property {string[]} [pv]     variante principal en UCI
 *
 * @typedef {Object} EngineLevel
 * @property {string} id
 * @property {string} name
 * @property {SearchLimits} limits
 */
export class Engine {
  /** Callback opcional que el motor invoca con información parcial: ({depth, eval, nodes, pv}) */
  onInfo = null;

  /** Prepara recursos (workers, WASM...). Se llama una vez antes de usarlo. */
  async init() {}

  /** Fija la posición actual (FEN completo). `historial` (opcional): FEN de las posiciones previas de la partida. */
  async setPosition(fen, historial = null) {
    this.fen = fen;
    this.historial = historial;
  }

  /**
   * Busca la mejor jugada.
   * @param {SearchLimits} limits
   * @returns {Promise<SearchResult|null>} null si la búsqueda fue cancelada con stop()
   */
  async go(limits) {
    throw new Error('Engine.go() no implementado');
  }

  /** Cancela la búsqueda en curso (go() debe resolverse con null). */
  stop() {}

  /** Libera recursos. */
  dispose() {}
}
