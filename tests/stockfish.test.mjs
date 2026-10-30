// Adaptador de Stockfish probado con un Worker falso que habla UCI (el motor real se probó aparte).
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { createWakeLock } from '../src/ui/wake-lock.js';
import { StockfishEngine, parseInfo, STOCKFISH_LEVELS, positionCommand } from '../src/engines/stockfish/stockfish-engine.js';

const made = [];
class FakeUci {
  constructor() { this.sent = []; this.terminated = false; made.push(this); }
  say(l) { queueMicrotask(() => this.onmessage?.({ data: l })); }
  postMessage(c) {
    this.sent.push(c);
    if (c === 'uci') this.say('uciok');
    else if (c === 'isready') this.say('readyok');
    else if (c.startsWith('go')) {
      if (this.hang) return;
      this.say('info depth 5 seldepth 7 multipv 1 score cp 40 nodes 1234 pv e7e5 g1f3');
      this.say('info depth 6 multipv 2 score cp -90 nodes 2000 pv a7a6');
      this.say(this.mate ? 'info depth 7 score mate 2 nodes 3000 pv d8h4' : 'info depth 8 score cp 55 nodes 4000 pv e7e5 g1f3');
      this.say('bestmove e7e5 ponder g1f3');
    }
  }
  terminate() { this.terminated = true; }
}
const mk = () => new StockfishEngine({ workerFactory: () => new FakeUci() });

// parseInfo
assert.deepEqual(parseInfo('info depth 9 score cp -30 nodes 99 pv e2e4 e7e5', 1), { depth: 9, eval: -30, mate: null, nodes: 99, pv: ['e2e4', 'e7e5'] });
assert.equal(parseInfo('info depth 3 multipv 2 score cp 10 pv a2a3'), null);
assert.equal(parseInfo('info string hola'), null);
console.log('  ✓ parseInfo');

// saludo UCI, signo desde las blancas (juegan negras → se invierte) y opciones de Elo
{
  const e = mk(); await e.init();
  await e.setPosition('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  const infos = []; e.onInfo = (i) => infos.push(i);
  const r = await e.go({ elo: 1500, depth: 6, time: 300 });
  assert.equal(r.move, 'e7e5'); assert.equal(r.eval, -55); assert.equal(r.depth, 8);
  assert.ok(infos.length >= 2 && infos.every((i) => i.depth !== 6 || i.eval === -40));
  const sent = made.at(-1).sent;
  assert.ok(sent.includes('setoption name UCI_LimitStrength value true') && sent.includes('setoption name UCI_Elo value 1500'));
  assert.ok(sent.some((c) => c.startsWith('position fen rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b')));
  assert.ok(sent.includes('go depth 6 movetime 300'));
  e.dispose();
  console.log('  ✓ saludo UCI, evaluación desde blancas y Elo');
}

// mate: signo desde blancas
{
  const e = mk(); await e.init(); made.at(-1).mate = true;
  await e.setPosition('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1');
  const r = await e.go({ depth: 8 });
  assert.equal(r.mate, 2); e.dispose();
  console.log('  ✓ mate positivo para blancas');
}

// stop → null, y el motor se recrea solo en el siguiente go()
{
  const e = mk(); await e.init(); made.at(-1).hang = true;
  const first = made.at(-1);
  const p = e.go({ time: 5000 });
  await new Promise((r) => setTimeout(r, 20));
  e.stop();
  assert.equal(await p, null); assert.ok(first.terminated);
  const r = await e.go({ depth: 4 });
  assert.equal(r.move, 'e7e5'); assert.notEqual(made.at(-1), first);
  e.dispose();
  console.log('  ✓ stop() devuelve null y se recrea el worker');
}

{
  // historial: Stockfish debe recibir las jugadas desde la última captura/peón para ver las repeticiones
  const g = new Game();
  g.loadMoves('g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1'.split(' '));
  const cmd = positionCommand(g.fen, g.fens.slice(0, -1));
  assert.match(cmd, /^position fen rnbqkbnr\/pppppppp\/8\/8\/8\/8\/PPPPPPPP\/RNBQKBNR w KQkq - 0 1 moves g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1$/);
  assert.equal(positionCommand(g.fen, null), `position fen ${g.fen}`);
  g.loadMoves('e2e4 e7e5 d2d3'.split(' ')); // acaba de moverse un peón: nada que repetir
  assert.equal(positionCommand(g.fen, g.fens.slice(0, -1)), `position fen ${g.fen}`);
  const e = new StockfishEngine({ workerFactory: () => new FakeUci() });
  g.loadMoves('g1f3 g8f6 f3g1 f6g8'.split(' '));
  await e.setPosition(g.fen, g.fens.slice(0, -1));
  await e.go({ depth: 2 });
  assert.ok(made.at(-1).sent.some((c) => c.startsWith('position fen') && c.includes(' moves g1f3 g8f6 f3g1 f6g8')));
  e.dispose();
  console.log('  ✓ Stockfish recibe el historial (position … moves …)');
}

{
  // bloqueo de pantalla: se pide al correr, se suelta al parar y se tolera la falta de API
  assert.equal(createWakeLock().supported, false); // en Node no hay navigator.wakeLock
  let released = 0, requested = 0;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { wakeLock: { request: async () => { requested++; return { release: async () => { released++; }, addEventListener() {} }; } } } });
  const wl = createWakeLock();
  wl.set(true); await new Promise((r) => setTimeout(r, 5));
  assert.ok(wl.active && requested === 1);
  wl.set(true); await new Promise((r) => setTimeout(r, 5));
  assert.equal(requested, 1); // idempotente
  wl.set(false);
  assert.ok(!wl.active && released === 1);
  delete globalThis.navigator;
  console.log('  ✓ el bloqueo de pantalla se pide y se suelta');
}

assert.ok(STOCKFISH_LEVELS.length >= 5 && STOCKFISH_LEVELS.every((l) => l.limits.time));
console.log('6 pruebas de Stockfish OK');
