// Pruebas del torneo: bracket (byes, semillas), desempates, ejecución completa, pausa/reanudar y JSON.
import assert from 'node:assert/strict';
import { seedOrder, createRounds, nextStep, seriesScore, fmtPoints, BYE } from '../src/tournament/bracket.js';
import { Tournament } from '../src/tournament/tournament.js';
import { registerEngine } from '../src/engines/registry.js';
import * as engines from '../src/engines/index.js';
import { Engine } from '../src/engines/engine.js';
import { search } from '../src/engines/minimax/minimax-core.js';
import { Library } from '../src/library/library.js';
import { readFileSync } from 'node:fs';

let pass = 0;
const ok = async (name, fn) => { await fn(); pass++; console.log('  ✓', name); };

// Motor "en proceso" (sin Worker) para poder probar en Node: demuestra además lo fácil que es enchufar motores.
class InProc extends Engine {
  async go(limits) { return search(this.fen, { depth: limits.depth ?? 2, time: limits.time ?? 300, noise: limits.noise ?? 0 }); }
}
registerEngine('inproc', { name: 'Minimax en proceso', levels: [{ id: '1', name: 'prof 1', limits: { depth: 1, time: 100, noise: 60 } }, { id: '2', name: 'prof 2', limits: { depth: 2, time: 200 } }], create: async () => new InProc() });

await ok('seedOrder: 4 y 8', () => {
  assert.deepEqual(seedOrder(4), [1, 4, 2, 3]);
  assert.deepEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
});

await ok('bracket de 5: tres byes para las semillas 1–3, avanzan solos', () => {
  const r = createRounds(['a', 'b', 'c', 'd', 'e']);
  assert.equal(r.length, 3);
  assert.equal(r[0].filter((m) => m.bye).length, 3);
  assert.equal(r[0][0].ganador, 'a');      // semilla 1 vs BYE
  assert.equal(r[1][0].a, 'a');            // ya está en semifinales
  assert.equal(r[0][1].a, 'd'); assert.equal(r[0][1].b, 'e'); // 4 vs 5 se juega
});

await ok('bracket de 2 y de 16', () => {
  assert.equal(createRounds(['a', 'b']).length, 1);
  assert.equal(createRounds(Array.from({ length: 16 }, (_, i) => `p${i}`)).length, 4);
  assert.throws(() => createRounds(['a']));
});

await ok('nextStep: pareja 1-0/0-1 empata → nueva pareja; tras el tope gana la mejor semilla', () => {
  const m = { a: 'x', b: 'y', pares: [] };
  const cfg = { juegosPorCruce: 2, maxParesDesempate: 1 };
  const seed = (id) => (id === 'x' ? 1 : 2);
  assert.equal(nextStep(m, cfg, seed).action, 'play-pair');
  m.pares.push({ partidas: [{ blancas: 'x', negras: 'y', resultado: '1-0' }, { blancas: 'y', negras: 'x', resultado: '1-0' }] });
  assert.deepEqual(seriesScore(m), { a: 1, b: 1 });
  assert.equal(nextStep(m, cfg, seed).action, 'play-pair');
  m.pares.push({ partidas: [{ blancas: 'x', negras: 'y', resultado: '1/2-1/2' }, { blancas: 'y', negras: 'x', resultado: '1/2-1/2' }] });
  const st = nextStep(m, cfg, seed);
  assert.equal(st.action, 'decided'); assert.equal(st.winner, 'x'); assert.equal(st.by, 'semilla');
  m.pares[1].partidas[1].resultado = '0-1'; // y con negras... x (negras? no) → x gana 1 punto extra
  assert.equal(nextStep(m, cfg, seed).by, 'desempate');
  assert.equal(fmtPoints(1.5), '1½'); assert.equal(fmtPoints(0.5), '½'); assert.equal(fmtPoints(2), '2');
});

const lib = new Library();
lib.addFromObject(JSON.parse(readFileSync(new URL('../library/aperturas-basicas.json', import.meta.url))), 'a.json');
const deps = { engines, library: lib };
const players = (n, motor = 'random', nivel = '0') => Array.from({ length: n }, (_, i) => ({ nombre: `Luchador ${i + 1}`, motor, nivel }));

await ok('torneo de 6 (aleatorios): termina, hay campeón y todos los cruces están decididos', async () => {
  const t = Tournament.create(deps, { nombre: 'T6', participantes: players(6), config: { maxJugadas: 40, concurrencia: 4, maxParesDesempate: 1 } });
  let finished = null;
  t.on('finished', (e) => (finished = e));
  await t.run();
  assert.equal(t.data.estado, 'terminado');
  assert.ok(finished?.campeon);
  assert.ok(t.matches.every((m) => m.estado === 'terminado' && m.ganador));
  for (const m of t.matches.filter((x) => !x.bye)) for (const p of m.pares) for (const g of p.partidas) {
    assert.ok(g && ['1-0', '0-1', '1/2-1/2'].includes(g.resultado));
    assert.equal(g.jugadas.length, g.evals.length);
    assert.ok(g.jugadas.length >= 4);
  }
  // los dos juegos de una pareja usan la misma apertura y colores cambiados
  const par = t.matches.find((m) => !m.bye).pares[0];
  assert.equal(par.partidas[0].blancas, par.partidas[1].negras);
  assert.deepEqual(par.partidas[0].jugadas.slice(0, par.apertura.jugadas.length), par.apertura.jugadas);
});

await ok('JSON: ida y vuelta conserva todo y un torneo terminado no se vuelve a jugar', async () => {
  const t = Tournament.create(deps, { participantes: players(4), config: { maxJugadas: 30 } });
  await t.run();
  const copia = Tournament.fromJSON(deps, JSON.parse(JSON.stringify(t.toJSON())));
  assert.deepEqual(copia.toJSON(), t.toJSON());
  await copia.run(); // no hace nada
  assert.equal(copia.data.campeon, t.data.campeon);
  assert.throws(() => Tournament.fromJSON(deps, { formato: 'otro' }));
});

await ok('pausar y reanudar (incluso desde JSON) termina sin perder partidas ya jugadas', async () => {
  const t = Tournament.create(deps, { participantes: players(8), config: { maxJugadas: 60, concurrencia: 2 } });
  let n = 0;
  t.on('game-done', () => { if (++n === 3) t.stop(); });
  await t.run();
  assert.equal(t.data.estado, 'pausado');
  const jugadas = () => t.matches.flatMap((m) => m.pares.flatMap((p) => p.partidas.filter(Boolean))).length;
  const antes = jugadas();
  assert.ok(antes >= 3);
  const t2 = Tournament.fromJSON(deps, JSON.parse(JSON.stringify(t.toJSON())));
  await t2.run();
  assert.equal(t2.data.estado, 'terminado');
  const despues = t2.matches.flatMap((m) => m.pares.flatMap((p) => p.partidas.filter(Boolean))).length;
  assert.ok(despues >= antes);
});

await ok('motores reales (minimax en proceso): guarda evaluaciones y respeta límites', async () => {
  const t = Tournament.create(deps, {
    participantes: [{ nombre: 'Fuerte', motor: 'inproc', nivel: '2' }, { nombre: 'Débil', motor: 'inproc', nivel: '1' }, { nombre: 'Azar', motor: 'random', nivel: '0' }, { nombre: 'Custom', motor: 'inproc', nivel: '2', limites: { depth: 3, time: 150 } }],
    config: { maxJugadas: 140, concurrencia: 4, maxParesDesempate: 1 },
  });
  await t.run();
  assert.equal(t.data.estado, 'terminado');
  const g = t.matches.flatMap((m) => m.pares.flatMap((p) => p.partidas)).find((x) => x && x.evals.some((e) => e != null));
  assert.ok(g, 'alguna partida con evaluaciones');
  assert.ok(g.evals.every((e) => e == null || Math.abs(e) <= 1500));
  const razones = new Set(t.matches.flatMap((m) => m.pares.flatMap((p) => p.partidas.map((x) => x.razon))));
  console.log('    razones de fin vistas:', [...razones].join(', '), '· campeón:', t.participant(t.data.campeon).nombre);
});

console.log(`\n${pass} pruebas de torneo OK`);
process.exit(0);
