// Pruebas puntuales de las piezas delicadas (motor y partida). Sin framework: node tests/smoke.test.mjs
import assert from 'node:assert/strict';
import { search } from '../src/engines/minimax/minimax-core.js';
import { Game } from '../src/core/game.js';
import { Chess } from '../src/core/chess.js';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { Library } from '../src/library/library.js';
import { analyze, pickBookMove } from '../src/library/detector.js';
import { insertTextChunk, readTextChunks } from '../src/exchange/png-chunks.js';
import { findMoveInText } from '../src/exchange/parse-move.js';

let pass = 0;
const ok = (name, fn) => { fn(); pass++; console.log('  ✓', name); };

// --- motor ---
ok('mate en 1 (Dh5# estilo: Qh5 mate del loco)', () => {
  // 1.f3 e5 2.g4 -> Qh4#
  const r = search('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2', { depth: 3, time: 2000 });
  assert.equal(r.move, 'd8h4');
  assert.equal(r.mate, -1); // mate de negras
});

ok('mate en 2 (Kc6? no: Ra6+ ... posición clásica)', () => {
  // Blancas: Rh1->; mate en 2 con dos torres: Ra1 y Rb2 vs rey en h8 (escalera)
  const r = search('7k/8/8/8/8/8/1R6/R3K3 w - - 0 1', { depth: 4, time: 3000 });
  assert.ok(r.mate === 2 || r.mate === 1, `mate esperado, fue ${r.mate} (${r.move})`);
});

ok('no deja la dama colgada (posición con captura gratis)', () => {
  // La dama blanca puede tomar un peón defendido por el alfil: debe preferir tomar la torre libre.
  const r = search('4k3/8/3b4/8/3r4/8/8/3QK3 w - - 0 1', { depth: 4, time: 2000 });
  assert.equal(r.move, 'd1d4'); // gana la torre (el alfil recaptura pero cambia dama por torre+... se evalúa)
});

ok('devuelve jugada legal en la posición inicial y reporta nps', () => {
  const r = search('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', { depth: 5, time: 2500 });
  const legal = new Chess().moves({ verbose: true }).map((m) => m.from + m.to);
  assert.ok(legal.includes(r.move), r.move);
  console.log(`    profundidad ${r.depth}, ${r.nodes} nodos, ${r.nps} nps, pv ${r.pv.join(' ')}`);
});

ok('posición sin jugadas legales devuelve null', () => {
  const r = search('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', { depth: 2 });
  assert.equal(r, null);
});

ok('con ruido alto sigue devolviendo jugada legal', () => {
  const r = search('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', { depth: 1, time: 300, noise: 180 });
  assert.equal(r.move.length >= 4, true);
});

// --- partida ---
ok('Game: SAN, UCI, ilegal, undo y estado', () => {
  const g = new Game();
  assert.ok(g.play('e4'));
  assert.ok(g.play('e7e5'));
  assert.equal(g.play('e4e5'), null);
  assert.equal(g.moves.length, 2);
  g.undo();
  assert.equal(g.moves.length, 1);
  assert.equal(g.turn, 'b');
  assert.equal(g.moveText(), '1. e4');
});

ok('Game: mate del loco termina la partida', () => {
  const g = new Game();
  let over = null;
  g.on('gameover', (s) => (over = s));
  for (const m of ['f3', 'e5', 'g4', 'Qh4#']) g.play(m);
  assert.equal(over?.winner, 'b');
});



// --- librería y detector ---
const lib = new Library();
const res = lib.addFromObject(JSON.parse(readFileSync(new URL('../library/aperturas-basicas.json', import.meta.url))), 'aperturas-basicas.json');

ok('librería de ejemplo: 8 líneas, sin avisos (todas las jugadas legales)', () => {
  assert.equal(res.added, 8);
  assert.deepEqual(res.warnings, []);
});

ok('detector: tras 1.e4 e5 2.Nf3 Nc6 3.Bb5 solo viven Española y Berlín, predice a6 (peso 3) sobre Nf6 (peso 2)', () => {
  const g = new Game();
  for (const m of ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']) g.play(m);
  const r = analyze(lib, g);
  assert.equal(r.alive.length, 2);
  assert.equal(r.nextMoves[0].san, 'a6');
  assert.equal(r.nextMoves[0].pct, 60);
  assert.equal(r.nextMoves[1].san, 'Nf6');
  assert.ok(r.lastMoveNotes[0].nota.includes('Presiona el caballo'));
});

ok('detector: transposición (1.Nf3 Nc6 2.e4 e5 3.Bb5) llega a la misma posición, exact=false', () => {
  const g = new Game();
  for (const m of ['Nf3', 'Nc6', 'e4', 'e5', 'Bb5']) g.play(m);
  const r = analyze(lib, g);
  assert.ok(r.inBook && r.alive.length === 2);
  assert.ok(r.alive.every((a) => a.exact === false));
});

ok('detector: salir de la librería recuerda dónde y qué esperaba', () => {
  const g = new Game();
  for (const m of ['e4', 'e5', 'Nf3', 'Nc6', 'd4']) g.play(m);
  const r = analyze(lib, g);
  assert.equal(r.inBook, false);
  assert.equal(r.leftAtPly, 4);
  assert.ok(r.expected.length >= 2);
});

ok('libro de aperturas devuelve una jugada de la librería', () => {
  const uci = pickBookMove(lib, new Game().fen);
  assert.ok(['e2e4', 'd2d4'].includes(uci), uci);
});

ok('librería: jugada ilegal avisa y corta la línea', () => {
  const l = new Library();
  const r = l.addFromObject({ nombre: 'x', jugadas: ['e4', 'e5', 'Ke4', 'Nf3'] }, 'x.json');
  assert.equal(r.added, 1);
  assert.equal(l.lines[0].moves.length, 2);
  assert.equal(r.warnings.length, 1);
});

// --- intercambio ---
function tinyPng() {
  const crcTable = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const type = Buffer.from(t); const body = Buffer.concat([type, d]); const out = Buffer.alloc(12 + d.length); out.writeUInt32BE(d.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), 8 + d.length); return out; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  const idat = deflateSync(Buffer.from([0, 255, 0, 0]));
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]));
}

ok('PNG: el texto incrustado se lee de vuelta y el IEND queda al final', () => {
  const png = tinyPng();
  const json = JSON.stringify({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', jugadas: ['e4'] });
  const out = insertTextChunk(png, 'ajedrez-lab', json);
  assert.equal(readTextChunks(out)['ajedrez-lab'], json);
  // el IEND sigue al final y la imagen sigue siendo decodificable por zlib (IDAT intacto)
  assert.equal(Buffer.from(out.subarray(out.length - 8, out.length - 4)).toString(), 'IEND');
});

ok('parse-move: encuentra la jugada dentro de texto libre', () => {
  const fen = new Game().fen;
  assert.equal(findMoveInText('Mi jugada: Nf3, porque desarrolla.', fen).san, 'Nf3');
  assert.equal(findMoveInText('1. e4', fen).san, 'e4');
  assert.equal(findMoveInText('g1f3', fen).san, 'Nf3');
  assert.equal(findMoveInText('no se qué jugar', fen), null);
});

console.log(`\n${pass} pruebas OK`);
