// Pruebas puntuales de la liga: calendario, tabla/desempate, Elo estimado y una liga corta de punta a punta.
import assert from 'node:assert/strict';
import { roundRobin } from '../src/league/schedule.js';
import { standings, crossTable, estimateElo } from '../src/league/standings.js';
import { League } from '../src/league/league.js';
import { registerEngine, listEngines, getEngineInfo, createEngine } from '../src/engines/registry.js';
import { RandomEngine } from '../src/engines/random/random-engine.js';

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('  ✓', name); };

await t('calendario: todos contra todos sin repetir (par e impar)', () => {
  for (const k of [2, 3, 4, 5, 8]) {
    const ids = Array.from({ length: k }, (_, i) => `p${i + 1}`);
    const c = roundRobin(ids);
    assert.equal(c.length, k * (k - 1) / 2);
    assert.equal(new Set(c.map((x) => [x.a, x.b].sort().join('-'))).size, c.length);
    for (const r of new Set(c.map((x) => x.ronda))) { // nadie juega dos veces en la misma ronda
      const en = c.filter((x) => x.ronda === r).flatMap((x) => [x.a, x.b]);
      assert.equal(new Set(en).size, en.length);
    }
  }
});

const parts = ['A', 'B', 'C'].map((nombre, i) => ({ id: `p${i + 1}`, nombre, semilla: i + 1 }));
const g = (b, n_, resultado) => ({ blancas: b, negras: n_, resultado });
const cruce = (a, b, ...partidas) => ({ a, b, estado: 'terminado', pares: [{ partidas }] });

await t('tabla: puntos, directo y victorias', () => {
  // A y B empatan a 2 puntos; B le ganó a A en el directo → B primero
  const cruces = [
    cruce('p1', 'p2', g('p1', 'p2', '1/2-1/2'), g('p2', 'p1', '1-0')),   // A ½, B 1½
    cruce('p1', 'p3', g('p1', 'p3', '1-0'), g('p3', 'p1', '1/2-1/2')),   // A 1½, C ½
    cruce('p2', 'p3', g('p2', 'p3', '1/2-1/2'), g('p3', 'p2', '1/2-1/2')), // B 1, C 1
  ];
  const s = standings(parts, cruces);
  assert.deepEqual(s.map((r) => r.id), ['p2', 'p1', 'p3']);
  assert.equal(s[0].pts, 2.5); assert.equal(s[1].pts, 2); assert.equal(s[2].pts, 1.5);
  assert.equal(crossTable(parts, cruces).p2.p1, 1.5);
});

await t('Elo estimado: ancla fija y rival más débil/fuerte', () => {
  const ids = ['p1', 'p2', 'p3'];
  const anchors = new Map([['p1', 1500]]);
  // p2 saca 50 % contra el ancla → ≈1500; p3 saca 90 % → bastante más
  const games = [];
  for (let i = 0; i < 10; i++) games.push(g('p1', 'p2', i % 2 ? '1-0' : '0-1'));
  for (let i = 0; i < 10; i++) games.push(g('p1', 'p3', i === 0 ? '1-0' : '0-1'));
  const e = estimateElo(ids, games, anchors);
  assert.equal(e.get('p1').elo, 1500); assert.ok(e.get('p1').ancla);
  assert.ok(Math.abs(e.get('p2').elo - 1500) < 60, `p2=${e.get('p2').elo}`);
  assert.ok(e.get('p3').elo > 1800 && e.get('p3').err > 0);
  assert.equal(estimateElo(ids, games, new Map()), null);
});

// motores en proceso para la liga corta
registerEngine('rnd', { name: 'Azar', levels: [{ id: '0', name: 'Azar', limits: {} }, { id: '1', name: 'Azar 1500', limits: { elo: 1500 } }], create: async () => new RandomEngine() });
const engines = { listEngines, getEngineInfo, createEngine };

await t('liga corta de punta a punta (3 participantes, azar) + JSON', async () => {
  const L = League.create({ engines, library: null }, {
    nombre: 'Prueba', participantes: [{ nombre: 'Uno', motor: 'rnd', nivel: '0' }, { nombre: 'Dos', motor: 'rnd', nivel: '1' }, { nombre: 'Tres', motor: 'rnd', nivel: '0' }],
    config: { maxJugadas: 60, concurrencia: 4 },
  });
  assert.equal(L.matches.length, 3);
  assert.deepEqual([...L.anchors()], [['p2', 1500]]);
  let finished = false; L.on('finished', () => { finished = true; });
  await L.run();
  assert.ok(finished && L.data.estado === 'terminado');
  assert.ok(L.matches.every((c) => c.estado === 'terminado' && c.pares[0].partidas.every(Boolean)));
  const s = standings(L.data.participantes, L.matches);
  assert.equal(s.reduce((a, r) => a + r.pj, 0), 12); // 6 partidas × 2 jugadores
  assert.ok(L.eloEstimates().get('p1'));
  const L2 = League.fromJSON({ engines }, JSON.parse(JSON.stringify(L.toJSON())));
  assert.equal(L2.data.estado, 'terminado');
  assert.throws(() => League.fromJSON({ engines }, { formato: 'x' }), /Formato/);
});

console.log(`\n${n} pruebas de liga OK`);
