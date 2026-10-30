// Pruebas puntuales: exportar/importar partidas (JSON y PGN) y modo revisión.
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { Match } from '../src/core/match.js';
import { Review } from '../src/core/review.js';
import { crearPartida, toPGN, leerPartida } from '../src/exchange/partida.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const UCI = 'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6'.split(' ');

t('JSON → leer: ida y vuelta conserva jugadas y nombres', () => {
  const p = crearPartida({ jugadas: UCI, blancas: 'A', negras: 'B' });
  const r = leerPartida(JSON.stringify(p));
  assert.deepEqual(r.jugadas, UCI);
  assert.equal(r.blancas, 'A');
});

t('PGN: exporta y vuelve a leer, con comillas en el nombre', () => {
  const pgn = toPGN(crearPartida({ jugadas: UCI, blancas: 'Halcón "N"', negras: 'Lobo' }));
  assert.match(pgn, /1\. e4 e5 2\. Nf3 Nc6 3\. Bb5 a6 \*/);
  const r = leerPartida(pgn);
  assert.deepEqual(r.jugadas, UCI);
  assert.equal(r.blancas, 'Halcón "N"');
});

t('PGN de fuera: ignora comentarios, variantes, NAGs, 0-0 y un segundo juego', () => {
  const r = leerPartida(`[White "a"]\n[Black "b"]\n[Result "1-0"]\n\n1. e4 { [%clk 0:03] } e5 2. Nf3 $1 (2. Bc4 Nf6) 2... Nc6 3. Bb5 a6 4. 0-0 Nf6?! 1-0\n\n[Event "x"]\n\n1. d4 d5`);
  assert.equal(r.jugadas.length, 8);
  assert.equal(r.resultado, '1-0');
  assert.equal(r.aviso, undefined);
});

t('PGN con jugada ilegal: carga hasta la última válida con aviso; sin ninguna, error', () => {
  const r = leerPartida('1. e4 e5 2. Nf3 Nc6 3. Ke5');
  assert.equal(r.jugadas.length, 4);
  assert.match(r.aviso, /Ke5/);
  assert.throws(() => leerPartida('1. Ke5'), /ilegal/);
  assert.throws(() => leerPartida(JSON.stringify({ formato: 'ajedrez-lab/liga@1' })), /Formato no reconocido/);
});

t('PGN desde un FEN (SetUp) y turno de negras', () => {
  const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2';
  const p = crearPartida({ jugadas: ['g1f3', 'b8c6'], inicio: fen });
  const r = leerPartida(toPGN(p));
  assert.equal(r.inicio, fen);
  assert.deepEqual(r.jugadas, ['g1f3', 'b8c6']);
});

t('revisión: navega, bloquea motores, sale al mover y continúa desde aquí', () => {
  const game = new Game();
  const match = new Match(game, { createEngine() { throw new Error('no debe crear motor'); }, getEngineInfo: () => null });
  match.players.w = { kind: 'human' }; match.players.b = { kind: 'human' };
  game.loadMoves(UCI);
  const rv = new Review(game, match);
  const evs = [];
  rv.on('change', (e) => evs.push(e));
  rv.goto(2);
  assert.ok(rv.active && rv.viewPly === 2 && match.running === false);
  assert.equal(rv.fen, game.fens[2]);
  rv.step(1);
  assert.equal(evs.at(-1).move.san, 'Nf3'); // avanzar de uno en uno entrega la jugada para animar
  rv.goto(99); assert.equal(rv.viewPly, game.ply); // acota
  rv.goto(-5); assert.equal(rv.viewPly, 0);
  rv.goto(3);
  rv.continueHere();
  assert.ok(!rv.active && game.ply === 3 && match.running === false);
  rv.goto(1); rv.exit();
  assert.equal(match.running, false); // entró estando en pausa: sale igual
});

t('revisión: una jugada nueva o un reinicio terminan la revisión', () => {
  const game = new Game();
  const match = new Match(game, { createEngine() { throw new Error('x'); }, getEngineInfo: () => null });
  match.players.w = { kind: 'human' }; match.players.b = { kind: 'human' };
  game.loadMoves(UCI);
  const rv = new Review(game, match);
  rv.goto(2);
  game.reset();
  assert.ok(!rv.active);
  assert.equal(match.running, true); // Nueva partida devuelve la pausa que ella misma puso
});

console.log(`${n} pruebas OK`);
