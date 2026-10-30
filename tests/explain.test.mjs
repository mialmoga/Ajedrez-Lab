// Pruebas puntuales del explicador (posiciones conocidas).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Dictionary } from '../src/analysis/dictionary.js';
import { Explainer } from '../src/analysis/explainer.js';
import { Library } from '../src/library/library.js';

const dict = new Dictionary(JSON.parse(readFileSync(new URL('../library/explicaciones-es.json', import.meta.url))));
const lib = new Library();
lib.addFromObject(JSON.parse(readFileSync(new URL('../library/aperturas-basicas.json', import.meta.url))), 'aperturas');
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const moves = (s) => s.split(' ');
const say = (lib_, start, list) => new Explainer({ library: lib_, dictionary: dict }).explainPly(start, list, list.length - 1);
const ids = (r) => r.hechos ?? [];

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ✓', name); };

t('mate del loco', () => assert.match(say(null, START, moves('f2f3 e7e5 g2g4 d8h4')).texto, /Jaque mate/));
t('retirada de dama atacada', () => {
  const r = say(null, START, moves('e2e4 d7d5 e4d5 d8d5 b1c3 d5a5'));
  assert.ok(ids(r).includes('retirada') || ids(r).includes('retroceso'));
  assert.match(r.texto, /probablemente/);
});
t('horquilla de caballo', () => assert.ok(ids(say(null, 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', ['d5c7'])).includes('horquilla')));
t('clavada con alfil', () => assert.ok(ids(say(null, '4k3/8/2n5/8/8/8/4B3/4K3 w - - 0 1', ['e2b5'])).includes('clavada')));
t('captura que gana material', () => assert.ok(ids(say(null, '4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1', ['d2d5'])).includes('captura_gana')));
t('enroque', () => assert.match(say(null, START, moves('e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 e1g1')).texto, /Enroque corto/));
t('final: rey activo', () => assert.ok(ids(say(null, '8/8/4k3/8/8/8/5K2/8 w - - 0 1', ['f2e3'])).includes('rey_activo')));
t('la nota de la librería manda sobre las reglas', () => {
  const line = lib.lines[0];
  const r = say(lib, line.startFen, line.moves.slice(0, 5).map((m) => m.uci));
  const nota = line.moves[4].nota;
  if (nota) { assert.equal(r.fuente, 'librería'); assert.equal(r.texto, nota); }
});
t('sin plantilla no truena y calla', () => {
  const r = new Explainer({ library: null, dictionary: new Dictionary() }).explainPly(START, ['e2e4'], 0);
  assert.equal(r, null);
});

console.log(`\n${n} pruebas del explicador OK`);
