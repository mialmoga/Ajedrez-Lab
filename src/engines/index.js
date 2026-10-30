// Aquí se registran los motores disponibles. Para añadir uno nuevo: una línea más.
import { registerEngine } from './registry.js';
import { MinimaxEngine, MINIMAX_LEVELS } from './minimax/minimax-engine.js';
import { Minimax2Engine, MINIMAX2_LEVELS } from './minimax2/minimax2-engine.js';
import { StockfishEngine, STOCKFISH_LEVELS } from './stockfish/stockfish-engine.js';
import { RandomEngine } from './random/random-engine.js';

registerEngine('minimax', {
  name: 'Minimax (propio)',
  description: 'Negamax con poda alfa-beta, tabla de transposición y quiescence, en un Web Worker.',
  levels: MINIMAX_LEVELS,
  create: async () => new MinimaxEngine(),
});

registerEngine('minimax2', {
  name: 'Minimax v2',
  description: 'Mejora del minimax propio con funciones activables (evaluación, null-move, aspiración…). Ver docs/MINIMAX2.md.',
  levels: MINIMAX2_LEVELS,
  create: async () => new Minimax2Engine(),
});

registerEngine('random', {
  name: 'Aleatorio',
  description: 'Jugada legal al azar. Ejemplo mínimo del contrato de motores.',
  levels: [{ id: '0', name: 'Azar', limits: {} }],
  create: async () => new RandomEngine(),
});

registerEngine('stockfish', {
  name: 'Stockfish 19 (WASM lite)',
  description: 'Stockfish compilado a WebAssembly (lite, un hilo). Dos tipos de nivel: Elo limitado (UCI_Elo) o profundidad limitada. Ver vendor/stockfish/README.txt.',
  levels: STOCKFISH_LEVELS,
  create: async () => new StockfishEngine(),
});
export { setMinimax2Defaults, getMinimax2Defaults } from './minimax2/minimax2-engine.js';
export { listEngines, getEngineInfo, createEngine } from './registry.js';
