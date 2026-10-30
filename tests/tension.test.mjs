// Pruebas puntuales de la curva de tensión del modo cine.
import assert from 'node:assert/strict';
import { curvaTension } from '../src/analysis/tension.js';
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const J = (...sans) => sans.map((san) => ({ san }));

t('apertura tranquila: nivel 0 y sin eventos', () => {
  const c = curvaTension({ jugadas: J('e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6') });
  assert.ok(c.nivel.every((x) => x === 0));
  assert.ok(c.evento.every((x) => x === null));
  assert.ok(c.t.every((x) => x < 0.2));
});
t('capturas y jaques suben la tensión; el mate es el clímax', () => {
  const c = curvaTension({ jugadas: [{ san: 'e4' }, { san: 'd5' }, { san: 'exd5', captured: 'p' }, { san: 'Qxd5', captured: 'p' }, { san: 'Nc3' }, { san: 'Qxg2', captured: 'p' }, { san: 'Qxf7+', captured: 'p' }, { san: 'Kd8' }, { san: 'Qf8#' }] });
  assert.equal(c.evento[2], 'captura');
  assert.equal(c.evento[6], 'jaque');
  assert.equal(c.evento[8], 'mate');
  assert.equal(c.t[8], 1);
  assert.equal(c.nivel[8], 2);
  assert.equal(c.pico.i, 8);
  assert.ok(c.t[6] > c.t[4]);
});
t('captura de pieza grande pesa más que la de peón', () => {
  const p = curvaTension({ jugadas: [{ san: 'e4' }, { san: 'Nf6' }, { san: 'exf6', captured: 'n' }] }).t[2];
  const q = curvaTension({ jugadas: [{ san: 'e4' }, { san: 'Nf6' }, { san: 'Rxf6', captured: 'q' }] }).t[2];
  const pe = curvaTension({ jugadas: [{ san: 'e4' }, { san: 'd5' }, { san: 'exd5', captured: 'p' }] }).t[2];
  assert.ok(q >= p && p > pe);
});
t('con análisis: un error grave y un cambio brusco disparan evento y tensión', () => {
  const jugadas = J('e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#');
  const plies = jugadas.map((_, i) => ({ clase: i === 5 ? 'error_grave' : null }));
  const pos = [0, 20, 15, 25, 20, 30, 25, null].map((e, i) => (i === 7 ? { e: null, m: 1 } : { e, m: null }));
  const c = curvaTension({ jugadas, plies, pos });
  assert.equal(c.evento[5], 'error');
  assert.ok(c.t[5] > 0.5);
  assert.equal(c.evento[6], 'mate');
});
t('histéresis: un pico aislado no hace parpadear el nivel y se enfría después', () => {
  const j = J('e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6', 'c3', 'O-O');
  j[8] = { san: 'Qxf7+', captured: 'p' };
  const c = curvaTension({ jugadas: j });
  assert.ok(c.nivel[8] >= 1);
  assert.equal(c.nivel[15], 0);
  const cambios = c.nivel.filter((x, i) => i && x !== c.nivel[i - 1]).length;
  assert.ok(cambios <= 3);
});
t('partida vacía no revienta', () => {
  const c = curvaTension({ jugadas: [] });
  assert.deepEqual(c.t, []);
  assert.equal(c.pico.i, -1);
});
console.log(`tension: ${n} pruebas ok`);
