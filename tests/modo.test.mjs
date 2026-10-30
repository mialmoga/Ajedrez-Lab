// Pruebas puntuales del modo Prueba/Práctica.
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { Match } from '../src/core/match.js';
import { GameMode } from '../src/core/modo.js';
import { AutoSave, safeStorage } from '../src/core/autosave.js';
import { crearPartida } from '../src/exchange/partida.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m }; };
const fakeEngines = { createEngine() { throw new Error('sin motor'); }, getEngineInfo: () => null };
const fakeReview = () => { const l = []; return { active: false, on: (e, f) => { l.push(f); return () => {}; } }; };
function setup(ls = mem(), humans = true) {
  const game = new Game();
  const match = new Match(game, fakeEngines);
  match.players.w = humans ? { kind: 'human' } : { kind: 'engine' };
  match.players.b = { kind: humans ? 'human' : 'engine' };
  const review = fakeReview();
  const modo = new GameMode(game, match, review);
  const a = new AutoSave(game, match, { storage: safeStorage(ls), modo });
  return { game, match, modo, review, a, ls };
}

t('arranca en prueba y sin ayuda con humanos', () => {
  const { modo } = setup();
  assert.equal(modo.value, 'prueba'); assert.equal(modo.ayuda, false); assert.equal(modo.locked, false);
});
t('se puede cambiar antes de jugar y se bloquea con la primera jugada', () => {
  const { modo, game } = setup();
  assert.equal(modo.set('practica'), true); assert.equal(modo.ayuda, true);
  game.play('e4');
  assert.equal(modo.locked, true);
  assert.equal(modo.set('prueba'), false); assert.equal(modo.value, 'practica');
  assert.equal(modo.set('basura'), false);
});
t('nueva partida vuelve a prueba', () => {
  const { modo, game } = setup();
  modo.set('practica'); game.play('e4'); game.reset();
  assert.equal(modo.value, 'prueba'); assert.equal(modo.locked, false);
});
t('revisión y motor-contra-motor tienen ayuda aunque sea prueba', () => {
  const a = setup();
  a.review.active = true; assert.equal(a.modo.ayuda, true);
  assert.equal(setup(mem(), false).modo.ayuda, true);
});
t('forzar actúa con jugadas hechas', () => {
  const { modo, game } = setup();
  game.play('e4'); modo.forzar('practica');
  assert.equal(modo.value, 'practica'); assert.equal(modo.locked, true);
});
t('el autoguardado conserva el modo; sin campo = prueba', () => {
  const ls = mem();
  const one = setup(ls);
  one.modo.set('practica');
  for (const m of 'e4 e5 Nf3 Nc6'.split(' ')) one.game.play(m);
  const two = setup(ls);
  assert.equal(two.a.restore(), 4);
  assert.equal(two.modo.value, 'practica');
  const old = JSON.parse(ls.m.get('ajedrez-lab:partida-actual') ?? [...ls.m.values()][0]);
  delete old.modo; // guardado antiguo
  const k = [...ls.m.keys()][0]; ls.m.set(k, JSON.stringify(old));
  const three = setup(ls); three.a.restore();
  assert.equal(three.modo.value, 'prueba');
});
t('la exportación incluye modo solo si es válido', () => {
  assert.equal(crearPartida({ jugadas: ['e2e4'], modo: 'practica' }).modo, 'practica');
  assert.equal('modo' in crearPartida({ jugadas: ['e2e4'], modo: 'x' }), false);
});
console.log(`modo: ${n} pruebas ok`);
