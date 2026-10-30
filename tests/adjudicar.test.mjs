// Pruebas puntuales de la adjudicación de las suites (tools/adjudicar.mjs).
import assert from 'node:assert/strict';
import { parsearScore, cpParaV2, adjudicar } from '../tools/adjudicar.mjs';
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ✓', name); };

t('lee el score de una línea info y descarta las cotas', () => {
  assert.deepEqual(parsearScore('info depth 12 seldepth 18 score cp -135 nodes 1 pv e2e4'), { cp: -135 });
  assert.deepEqual(parsearScore('info depth 9 score mate 3 pv a1a2'), { mate: 3 });
  assert.equal(parsearScore('info depth 12 score cp 40 lowerbound'), null);
  assert.equal(parsearScore('bestmove e2e4'), null);
  assert.equal(parsearScore('info string NNUE'), null);
});
t('punto de vista: el score es del bando que mueve y se pasa al v2', () => {
  assert.equal(cpParaV2({ cp: 350 }, 'w', true), 350); // mueve v2 (blancas) y va +3.5
  assert.equal(cpParaV2({ cp: 350 }, 'b', true), -350); // mueve el rival (negras) y va mejor: mal para v2
  assert.equal(cpParaV2({ cp: 350 }, 'b', false), 350); // v2 juega con negras y le toca mover
  assert.equal(cpParaV2(null, 'w', true), null);
});
t('mate anunciado pesa más que cualquier cp, y más cerca = más', () => {
  assert.ok(cpParaV2({ mate: 2 }, 'w', true) > 90000);
  assert.ok(cpParaV2({ mate: 2 }, 'w', true) > cpParaV2({ mate: 7 }, 'w', true));
  assert.ok(cpParaV2({ mate: -3 }, 'w', true) < -90000);
});
t('adjudicar: umbral, simetría y sin evaluación', () => {
  assert.deepEqual(adjudicar(300), { puntos: 1, fin: 'adjudicada (gana v2)', cp: 300 });
  assert.equal(adjudicar(-450).puntos, 0);
  assert.equal(adjudicar(-450).fin, 'adjudicada (pierde v2)');
  assert.deepEqual(adjudicar(299), { puntos: 0.5, fin: 'tope de jugadas', cp: 299 });
  assert.equal(adjudicar(-299).puntos, 0.5);
  assert.deepEqual(adjudicar(null), { puntos: 0.5, fin: 'tope de jugadas', cp: null });
  assert.equal(adjudicar(150, 100).puntos, 1); // umbral propio
});
console.log(`adjudicar: ${n} pruebas ok`);
