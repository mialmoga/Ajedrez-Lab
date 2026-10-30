// Pruebas puntuales de las marcas didácticas (modo Práctica).
import assert from 'node:assert/strict';
import { Chess } from '../src/core/chess.js';
import { calcularMarcas } from '../src/analysis/marcas.js';
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const get = (fen, own) => calcularMarcas(new Chess(fen), own);

t('posición inicial: sin marcas', () => assert.deepEqual(get(new Chess().fen(), 'w'), []));
t('dama negra atacada por caballo: vulnerable para blancas, riesgo para negras', () => {
  const fen = 'rnb1kbnr/ppp1pppp/8/3q4/8/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 3';
  assert.ok(get(fen, 'w').some((m) => m.sq === 'd5' && m.tipo === 'vulnerable'));
  assert.ok(get(fen, 'b').some((m) => m.sq === 'd5' && m.tipo === 'riesgo'));
});
t('alfil clava caballo contra el rey: clavada', () => {
  const fen = 'r1bqkbnr/ppp2ppp/2np4/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4';
  assert.ok(get(fen, 'b').some((m) => m.sq === 'c6' && m.tipo === 'clavada'));
});
console.log(`marcas: ${n} pruebas ok`);
