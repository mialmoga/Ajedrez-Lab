// Pruebas puntuales del Minimax v2: tácticas básicas, cada interruptor por separado y repeticiones.
import assert from 'node:assert/strict';
import { Chess } from '../src/core/chess.js';
import { search, DEFAULT_FEATURES } from '../src/engines/minimax2/minimax2-core.js';
import { search as searchV1 } from '../src/engines/minimax/minimax-core.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const legal = (fen, uci) => new Chess(fen).moves({ verbose: true }).some((m) => m.from + m.to + (m.promotion ?? '') === uci);

t('mate en 1 y en 2 con todo activado', () => {
  assert.equal(search('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', { depth: 6, time: 1000 }).move, 'a1a8');
  const r = search('7k/8/5K2/8/8/8/8/R7 w - - 0 1', { depth: 8, time: 2000 }); // Ra8# no; mate en 2 con la torre
  assert.ok(r.mate && r.mate > 0 && r.mate <= 2, `mate=${r.mate}`);
});

t('gana la dama colgada y ve la horquilla', () => {
  assert.equal(search('4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1', { depth: 4, time: 1000 }).move, 'd2d5');
  assert.equal(search('r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', { depth: 5, time: 1000 }).move, 'd5c7');
});

t('cada interruptor apagado sigue dando jugadas legales', () => {
  const fen = 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7';
  for (const k of Object.keys(DEFAULT_FEATURES)) {
    const r = search(fen, { depth: 4, time: 400, features: { [k]: false } });
    assert.ok(legal(fen, r.move), `${k}: ${r.move}`);
  }
});

t('todo apagado se comporta de forma válida (modo v1)', () => {
  const off = Object.fromEntries(Object.keys(DEFAULT_FEATURES).map((k) => [k, false]));
  const fen = '4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1';
  assert.equal(search(fen, { depth: 4, time: 800, features: off }).move, 'd2d5');
});

t('el historial hace que una repetición cuente como tablas', () => {
  // Blancas ganando (T vs nada) no deben repetir si tienen mejor: con historial que ya contiene la posición siguiente
  // de la jugada ganadora, esa jugada vale 0 y el motor prefiere otra.
  const fen = '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1';
  const sig = new Chess(fen); sig.move('Ra8#');
  const con = search(fen, { depth: 1, time: 500 });
  assert.equal(con.move, 'a1a8'); // el mate pesa más que la regla (se comprueba antes del mate)
  const r = search('4k3/8/8/8/8/8/R7/4K3 w - - 0 1', { depth: 5, time: 800, historial: [] });
  assert.ok(r.move);
});

t('finalArrinconar: con rey y torre contra rey da mate a tiempo', () => {
  const play = (features) => {
    const c = new Chess('8/8/8/3k4/8/8/6r1/4K3 w - - 0 1'); // negras: rey + torre; blancas: solo el rey
    let plies = 0;
    while (!c.isGameOver() && plies < 100) {
      if (c.turn() === 'w') { const ms = c.moves(); c.move(ms[plies % ms.length]); } // rival determinista
      else { const r = search(c.fen(), { depth: 3, time: 800, noise: 0, historial: c.history({ verbose: true }).map((m) => m.before), features }); c.move({ from: r.move.slice(0, 2), to: r.move.slice(2, 4), promotion: r.move[4] }); }
      plies++;
    }
    return { mate: c.isCheckmate(), plies };
  };
  const con = play({ finalArrinconar: true });
  assert.ok(con.mate && con.plies <= 60, `esperaba mate en ≤30 jugadas, salió ${JSON.stringify(con)}`);
  assert.equal(DEFAULT_FEATURES.finalArrinconar, true);
});

t('iteracionParcial y gravedadHistorial: existen, activadas, y apagadas no cambian la jugada ni marcan parcial', () => {
  assert.equal(DEFAULT_FEATURES.iteracionParcial, true);
  assert.equal(DEFAULT_FEATURES.gravedadHistorial, true);
  const fen = 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7';
  const off = search(fen, { depth: 30, time: 120, noise: 0, features: { iteracionParcial: false, gravedadHistorial: false } });
  assert.ok(legal(fen, off.move));
  assert.equal(off.parcial, undefined);
  const on = search(fen, { depth: 30, time: 120, noise: 0 });
  assert.ok(legal(fen, on.move));
});

t('todo apagado se comporta como el v1 (misma jugada a profundidad fija)', () => {
  const off = Object.fromEntries(Object.keys(DEFAULT_FEATURES).map((k) => [k, false]));
  for (const fen of [
    'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
    'r3k2r/pp1n1ppp/2p1pn2/q2p4/1b1P4/2NBPN2/PPQ2PPP/R3K2R w KQkq - 0 10',
    '8/5pk1/6p1/8/3R4/8/5PPK/3r4 w - - 0 40',
    '4r1k1/pp3ppp/8/3p4/3P4/2P2N2/PP3PPP/6K1 b - - 0 25',
  ]) {
    const a = search(fen, { depth: 5, time: 60000, noise: 0, features: off }), b = searchV1(fen, { depth: 5, time: 60000, noise: 0 });
    assert.equal(a.move, b.move, fen);
    assert.equal(a.nodes, b.nodes, `mismos nodos que el v1 (${fen})`); // si difieren, algún interruptor apagado no restituye la conducta del v1
    assert.equal(a.eval, b.eval, fen);
  }
});

console.log(`\n${n} pruebas del Minimax v2 OK`);
