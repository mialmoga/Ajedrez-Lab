// Pruebas puntuales del autoguardado: guardar, recuperar en pausa, archivar y límites.
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { Match } from '../src/core/match.js';
import { AutoSave, KEY_ACTUAL, KEY_LISTA, safeStorage } from '../src/core/autosave.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m }; };
const fakeEngines = { createEngine() { throw new Error('sin motor'); }, getEngineInfo: () => null };
function setup(ls = mem(), opts = {}) {
  const game = new Game();
  const match = new Match(game, fakeEngines);
  match.players.w = { kind: 'human' }; match.players.b = { kind: 'human' };
  const a = new AutoSave(game, match, { storage: safeStorage(ls), describe: () => ({ blancas: 'Ana', negras: 'Beto' }), ...opts });
  return { game, match, a, ls };
}
const MV = 'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6'.split(' ');

t('guarda la partida actual en cada jugada', () => {
  const { game, ls } = setup();
  game.play('e4'); game.play('e5');
  const s = JSON.parse(ls.m.get(KEY_ACTUAL));
  assert.deepEqual(s.jugadas, ['e2e4', 'e7e5']);
});

t('recupera jugadas y jugadores, siempre en pausa', () => {
  const ls = mem();
  const one = setup(ls);
  one.match.players.b = { kind: 'engine', engineId: 'minimax2', levelId: '4', custom: null, features: { nullMove: false } };
  for (const m of MV) one.game.play(m);
  // "se apagó el servidor": nueva página con el mismo almacenamiento
  const two = setup(ls);
  assert.equal(two.a.pending().jugadas.length, 6);
  assert.equal(two.a.restore(), 6);
  assert.equal(two.game.ply, 6);
  assert.equal(two.match.players.b.engineId, 'minimax2');
  assert.deepEqual(two.match.players.b.features, { nullMove: false });
  assert.equal(two.match.running, false);
});

t('no pisa lo guardado con una partida vacía antes de recuperar', () => {
  const ls = mem();
  const one = setup(ls);
  for (const m of MV) one.game.play(m);
  const two = setup(ls);
  two.match.setRunning(false); two.match.setRunning(true); // eventos de estado antes de restore()
  assert.equal(JSON.parse(ls.m.get(KEY_ACTUAL)).jugadas.length, 6);
});

t('pausar guarda (y marca la pausa)', () => {
  const { game, match, ls } = setup();
  for (const m of MV) game.play(m);
  match.setRunning(false);
  assert.equal(JSON.parse(ls.m.get(KEY_ACTUAL)).pausada, true);
});

t('una partida terminada se archiva una sola vez, con resultado y razón', () => {
  const { game, a } = setup();
  for (const m of 'f2f3 e7e5 g2g4 d8h4'.split(' ')) game.play(m); // mate del loco
  assert.equal(a.list().length, 1);
  const e = a.list()[0];
  assert.equal(e.resultado, '0-1'); assert.equal(e.razon, 'jaque mate'); assert.equal(e.estado, 'terminada');
  game.reset(); // Nueva partida: no se duplica
  assert.equal(a.list().length, 1);
});

t('al sustituir una partida en curso se archiva como inconclusa; una muy corta, no', () => {
  const { game, a } = setup();
  game.play('e4'); game.play('e5');
  game.reset();
  assert.equal(a.list().length, 0); // 2 jugadas: ruido
  for (const m of MV) game.play(m);
  game.reset();
  assert.equal(a.list().length, 1);
  assert.equal(a.list()[0].estado, 'inconclusa'); assert.equal(a.list()[0].resultado, '*');
});

t('cortar la partida ("continuar desde aquí") no archiva un duplicado; cargar otra sí', () => {
  const { game, a } = setup();
  for (const m of MV) game.play(m);
  game.loadMoves(MV.slice(0, 4)); // prefijo de la misma partida
  assert.equal(a.list().length, 0);
  game.loadMoves('d2d4 d7d5 c2c4 e7e6 b1c3 g8f6'.split(' ')); // otra
  assert.equal(a.list().length, 1);
});

t('límite de 10 y borrado', () => {
  const { game, a } = setup();
  for (let i = 0; i < 12; i++) { game.loadMoves(['e2e4', 'e7e5', 'g1f3', 'b8c6', i % 2 ? 'f1c4' : 'f1b5', 'a7a6'].concat(i > 1 ? ['a2a3', 'a6a5', 'b2b3', 'b7b6', 'c2c3', 'c7c6'].slice(0, (i % 6) * 2) : [])); game.reset(); }
  assert.ok(a.list().length <= 10 && a.list().length >= 2);
  const id = a.list()[0].id; a.remove(id);
  assert.ok(!a.list().some((e) => e.id === id));
  a.clear();
  assert.equal(a.list().length, 0);
});

t('sin almacenamiento disponible no lanza', () => {
  const { game, a } = setup(null);
  let err = null; a.on('error', (e) => { err = e; });
  game.play('e4');
  assert.ok(err); assert.deepEqual(a.list(), []);
});

console.log(`${n} pruebas del autoguardado OK`);
