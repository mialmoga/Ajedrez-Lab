// Pruebas puntuales de la lógica de la autopsia (tools/autopsia-nucleo.mjs).
import assert from 'node:assert/strict';
import { valorCp, perdida, causaDelError, fase, tipoDeJugada, resumirErrores, TOPE_PERDIDA } from '../tools/autopsia-nucleo.mjs';
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ✓', name); };

t('pérdida: lo que baja la evaluación de quien movió (antes + después del rival)', () => {
  assert.equal(perdida({ cp: 50 }, { cp: 30 }), 80); // +0.5 → el rival queda +0.3: v2 pasa a −0.3
  assert.equal(perdida({ cp: 100 }, { cp: -100 }), 0); // jugó la mejor
  assert.equal(perdida({ cp: 20 }, { cp: -60 }), 0); // mejoró (la evaluación previa era imprecisa): nunca negativo
  assert.equal(perdida(null, { cp: 1 }), null);
});
t('el mate pesa mucho pero la pérdida tiene tope', () => {
  assert.ok(valorCp({ mate: 2 }) > valorCp({ mate: 6 }));
  assert.ok(valorCp({ mate: -2 }) < -9000);
  assert.equal(perdida({ mate: 3 }, { cp: 200 }), TOPE_PERDIDA); // tenía mate y lo soltó
});
t('causa: horizonte corto, largo o evaluación', () => {
  assert.deepEqual(causaDelError([{ factor: 4, perdida: 20 }, { factor: 16, perdida: 0 }]), { causa: 'horizonte-corto', factor: 4 });
  assert.deepEqual(causaDelError([{ factor: 4, perdida: 400 }, { factor: 16, perdida: 30 }]), { causa: 'horizonte-largo', factor: 16 });
  assert.deepEqual(causaDelError([{ factor: 4, perdida: 400 }, { factor: 16, perdida: 380 }]), { causa: 'evaluacion', factor: null });
  assert.equal(causaDelError([]).causa, 'sin-sondeo');
});
t('fase y tipo de jugada', () => {
  assert.equal(fase(8, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'), 'apertura');
  assert.equal(fase(30, 'r1bq1rk1/pp2ppbp/2np1np1/8/3NP3/2N1BP2/PPPQ2PP/R3KB1R w KQ - 0 9'), 'medio');
  assert.equal(fase(90, '8/5k2/8/3R4/8/2K5/8/6r1 w - - 0 60'), 'final');
  assert.equal(tipoDeJugada('Qxf7#'), 'jaque');
  assert.equal(tipoDeJugada('exd5'), 'captura');
  assert.equal(tipoDeJugada('Nf3'), 'tranquila');
});
t('resumen: causas, fases y tácticas perdidas', () => {
  const r = resumirErrores([
    { causa: 'horizonte-corto', fase: 'medio', tipoV2: 'tranquila', tipoMejor: 'captura', perdida: 200 },
    { causa: 'evaluacion', fase: 'final', tipoV2: 'captura', tipoMejor: 'tranquila', perdida: 400 },
  ]);
  assert.equal(r.total, 2);
  assert.deepEqual(r.porCausa, { 'horizonte-corto': 1, evaluacion: 1 });
  assert.equal(r.tacticaPerdida, 1);
  assert.equal(r.perdidaMedia, 300);
  assert.equal(resumirErrores([]).perdidaMedia, 0);
});
console.log(`autopsia: ${n} pruebas ok`);
