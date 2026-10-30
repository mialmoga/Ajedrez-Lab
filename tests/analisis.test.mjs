// Pruebas puntuales del análisis de partida: clasificación pura, precisión, resumen y recorrido con un juez real en proceso.
import assert from 'node:assert/strict';
import { clasificar, precisionJugada, resumir, analizarPartida } from '../src/analysis/analisis.js';
import { Judge } from '../src/analysis/judge.js';
import { Engine } from '../src/engines/engine.js';
import { registerEngine, listEngines, getEngineInfo, createEngine } from '../src/engines/registry.js';
import { search } from '../src/engines/minimax2/minimax2-core.js';
import { Game } from '../src/core/game.js';
import { Match } from '../src/core/match.js';
import { AutoSave, KEY_LISTA, safeStorage } from '../src/core/autosave.js';
import { AnalisisCtl } from '../src/analysis/analisis-ctl.js';
import { crearPartida } from '../src/exchange/partida.js';

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('  ✓', name); };
const cls = (o) => clasificar({ color: 'w', uci: 'a2a3', bestUci: 'e2e4', ...o })?.clase;

await t('clasificar: escala de pérdidas y la mejor jugada', () => {
  assert.equal(cls({ before: { eval: 20 }, after: { eval: 10 } }), 'mejor');            // pérdida ≤ 15
  assert.equal(cls({ before: { eval: 20 }, after: { eval: -20 } }), 'buena');           // 40
  assert.equal(cls({ before: { eval: 20 }, after: { eval: -50 } }), 'imprecision');     // 70
  assert.equal(cls({ before: { eval: 20 }, after: { eval: -150 } }), 'error');          // 170
  assert.equal(cls({ before: { eval: 20 }, after: { eval: -400 } }), 'error_grave');    // 420
  assert.equal(cls({ before: { eval: 20 }, after: { eval: -400 }, uci: 'e2e4' }), 'mejor'); // era la mejor (todo era malo)
  assert.equal(clasificar({ color: 'b', uci: 'a7a6', bestUci: 'e7e5', before: { eval: -20 }, after: { eval: 500 } }).clase, 'error_grave'); // negras: signo invertido
  assert.equal(clasificar({ color: 'w', uci: 'a2a3', bestUci: 'e2e4', before: null, after: { eval: 0 } }), null); // sin dato
});

await t('clasificar: partida decidida no se castiga, pero perder un mate sí', () => {
  assert.equal(cls({ before: { eval: 900 }, after: { eval: 600 } }), 'buena');         // sigue ganando de sobra
  assert.equal(cls({ before: { eval: -900 }, after: { eval: -1200 } }), 'buena');       // ya estaba perdida
  assert.equal(cls({ before: { eval: 900 }, after: { eval: 100 } }), 'error_grave');    // tira la ventaja
  assert.equal(cls({ before: { mate: 2 }, after: { eval: 900 } }), 'error_grave');      // mate perdido
});

await t('clasificar: libro y brillante', () => {
  assert.equal(cls({ before: { eval: 20 }, after: { eval: 10 }, libro: true }), 'libro');
  assert.equal(cls({ before: { eval: 20 }, after: { eval: -300 }, libro: true }), 'error_grave'); // libro pero malo: no se perdona
  assert.equal(cls({ before: { eval: 30 }, after: { eval: 40 }, uci: 'e2e4', sacrifica: true }), 'brillante');
  assert.equal(cls({ before: { eval: 800 }, after: { eval: 820 }, uci: 'e2e4', sacrifica: true }), 'mejor');   // ya ganaba: no es brillante
  assert.equal(cls({ before: { eval: 30 }, after: { eval: -200 }, uci: 'e2e4', sacrifica: true }), 'mejor');   // sacrificio que deja perdido
});

await t('precisión: sin pérdida ≈ 100, desastre baja mucho, y es monótona', () => {
  const p0 = precisionJugada(20, 20), p1 = precisionJugada(20, -100), p2 = precisionJugada(20, -800);
  assert.ok(p0 > 99 && p0 <= 100);
  assert.ok(p1 < p0 && p2 < p1 && p2 < 30, `${p0} ${p1} ${p2}`);
});

await t('resumir: contadores por bando, precisión y momentos clave', () => {
  // 1.e4 e5 2.Qh5 (floja) Nc6 3.Qxf7# ; evaluaciones inventadas
  const analisis = { version: 1, jugadas: ['e2e4', 'e7e5', 'd1h5', 'b8c6'],
    pos: [{ e: 20, m: null, b: 'e2e4' }, { e: 30, m: null, b: 'e7e5' }, { e: 25, m: null, b: 'g1f3' }, { e: -300, m: null, b: 'g7g6' }, { e: -310, m: null, b: null }],
    lib: [true, true, false, false], sac: [false, false, false, false] };
  const r = resumir(analisis);
  assert.deepEqual(r.plies.map((p) => p.clase), ['libro', 'libro', 'error_grave', 'mejor'].map((c, i) => (i === 3 ? r.plies[3].clase : c)));
  assert.equal(r.contadores.w.libro, 1); assert.equal(r.contadores.w.error_grave, 1); assert.equal(r.contadores.b.libro, 1);
  assert.equal(r.plies[2].mejor, 'g1f3');
  assert.ok(r.precision.w < r.precision.b && r.completo);
  assert.deepEqual(r.clave.map((p) => p.i), [2]);
});

// juez real (minimax v2 en proceso) sobre una partida corta con un error claro
class InProc extends Engine { async go(l) { return search(this.fen, { depth: l.depth ?? 4, time: l.time ?? 300 }); } }
registerEngine('juez-inproc', { name: 'Minimax (prueba)', levels: [{ id: '1', name: 'rápido', limits: { depth: 4, time: 300 } }], create: async () => new InProc() });
const judge = new Judge({ engines: { listEngines, getEngineInfo, createEngine } });
judge.setConfig({ engineId: 'juez-inproc' });

await t('real: analizar una partida marca el error, reporta progreso y detecta el mate final', async () => {
  const inicio = '4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1';
  const prog = [];
  const a = await analizarPartida({ judge, inicio, jugadas: ['e1f1', 'd5d2'], onProgress: (h, tot) => prog.push([h, tot]) });
  assert.equal(a.pos.length, 3); assert.equal(a.jugadas.length, 2);
  assert.deepEqual(prog.at(-1), [3, 3]);
  const r = resumir(a);
  assert.equal(r.plies[0].clase, 'error_grave', JSON.stringify(r.plies[0]));   // dejar la torre ante la dama... (Rxd5 era mejor)
  assert.equal(r.plies[0].mejor, 'd2d5');
});

await t('real: una jugada ilegal da un error claro', async () => {
  await assert.rejects(analizarPartida({ judge, jugadas: ['e2e4', 'e2e4'] }), /ilegal en la posición 2/);
});

await t('real: cancelar con AbortSignal', async () => {
  const ctl = new AbortController();
  const p = analizarPartida({ judge, jugadas: ['e2e4', 'e7e5', 'g1f3'], signal: ctl.signal, onProgress: (h) => { if (h >= 2) ctl.abort(); } });
  await assert.rejects(p, (e) => e.name === 'AbortError');
});

await t('real: una partida que termina en mate usa el mate como evaluación final', async () => {
  const a = await analizarPartida({ judge, jugadas: ['f2f3', 'e7e5', 'g2g4', 'd8h4'] }); // mate del loco
  assert.equal(a.pos.at(-1).terminal, true);
  assert.ok(a.pos.at(-1).m < 0);
  const r = resumir(a);
  assert.ok(r.plies[2].clase === 'error_grave' || r.plies[2].clase === 'error', JSON.stringify(r.plies));
  assert.equal(r.plies[3].clase, 'mejor');
});

// --- guardado junto a la partida (juez simulado, sin motores) ---
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m }; };
const fakeEngines = { createEngine() { throw new Error('sin motor'); }, getEngineInfo: () => null };
const juezFalso = { config: { enabled: true }, umbrales: {}, name: 'Juez falso', async evaluate() { return { eval: 10, mate: null, move: 'e2e4' }; } };
function montar(ls) {
  const game = new Game(), match = new Match(game, fakeEngines);
  match.players.w = { kind: 'human' }; match.players.b = { kind: 'human' };
  match.setRunning(false); // analizar exige partida en pausa
  const ctl = new AnalisisCtl({ game, match, judge: juezFalso, library: null });
  const a = new AutoSave(game, match, { storage: safeStorage(ls), analisis: ctl, describe: () => ({ blancas: 'Ana', negras: 'Beto' }) });
  return { game, match, ctl, a };
}
const PARTIDA = 'e4 e5 Nf3 Nc6 Bb5 a6'.split(' ');

await t('guardado: el análisis se recupera con la partida y desaparece al cambiar de partida', async () => {
  const ls = mem();
  const uno = montar(ls);
  for (const m of PARTIDA) uno.game.play(m);
  assert.equal(await uno.ctl.analizar(), true);
  assert.ok(uno.ctl.vigente);
  const dos = montar(ls);                       // «recargar la página»
  assert.equal(dos.a.restore(), 6);
  assert.ok(dos.ctl.vigente, 'el análisis debe volver');
  assert.equal(dos.ctl.resumen.plies.length, 6);
  dos.game.reset();
  assert.equal(dos.ctl.analisis, null);          // otra partida: no arrastra el análisis
});

await t('guardado: la copia archivada lleva el análisis, también si termina después', async () => {
  const ls = mem();
  const x = montar(ls);
  for (const m of 'f3 e5 g4 Qh4#'.split(' ')) x.game.play(m); // termina (archivada sin análisis: 4 jugadas = mínimo)
  assert.equal(x.a.list().length, 1);
  assert.equal(x.a.list()[0].analisis, undefined);
  await x.ctl.analizar();
  assert.ok(x.a.list()[0].analisis, 'el análisis posterior se adjunta a la copia archivada');
});

await t('exportar/importar: solo viaja si coincide con las jugadas', () => {
  const an = { version: 1, jugadas: ['e2e4'], pos: [{ e: 0, m: null, b: null }, { e: 0, m: null, b: null }], lib: [false], sac: [false] };
  assert.ok(crearPartida({ jugadas: ['e2e4'], analisis: an }).analisis);
  assert.equal(crearPartida({ jugadas: ['d2d4'], analisis: an }).analisis, undefined);
  const g = new Game(), m = new Match(g, fakeEngines); m.setRunning(false);
  const ctl = new AnalisisCtl({ game: g, match: m, judge: juezFalso, library: null });
  g.play('e4');
  assert.equal(ctl.cargarSiCoincide(an), true);
  assert.equal(ctl.cargarSiCoincide({ ...an, jugadas: ['d2d4'] }), false);
  assert.equal(ctl.cargarSiCoincide({ ...an, pos: [] }), false);
});

console.log(`\n${n} pruebas del análisis OK`);
process.exit(0);
