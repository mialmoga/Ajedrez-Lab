// Pruebas puntuales del juez: veredictos puros, integración con un motor real en proceso y la amenaza de mate.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { judgeFacts, povScore } from '../src/analysis/verdict.js';
import { Judge } from '../src/analysis/judge.js';
import { Dictionary } from '../src/analysis/dictionary.js';
import { Explainer } from '../src/analysis/explainer.js';
import { Engine } from '../src/engines/engine.js';
import { registerEngine, listEngines, getEngineInfo, createEngine } from '../src/engines/registry.js';
import { search } from '../src/engines/minimax2/minimax2-core.js';

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('  ✓', name); };
const ids = (f) => f.map((x) => x.id);

await t('povScore: mates pesan más que cualquier material y respetan el color', () => {
  assert.ok(povScore({ mate: 2 }, 'w') > 9000 && povScore({ mate: 2 }, 'b') < -9000);
  assert.equal(povScore({ eval: 120 }, 'b'), -120);
  assert.equal(povScore(null, 'w'), null);
});

await t('veredictos: imprecisión, error, error grave y "era mejor"', () => {
  const base = { color: 'w', uci: 'a2a3', bestUci: 'e2e4', bestSan: 'e4' };
  assert.deepEqual(ids(judgeFacts({ ...base, before: { eval: 20 }, after: { eval: -50 } })), ['imprecision', 'mejor_era']);
  assert.deepEqual(ids(judgeFacts({ ...base, before: { eval: 20 }, after: { eval: -150 } })), ['error', 'mejor_era']);
  assert.deepEqual(ids(judgeFacts({ ...base, before: { eval: 20 }, after: { eval: -700 } })), ['error_grave', 'mejor_era']);
  assert.deepEqual(judgeFacts({ ...base, before: { eval: 20 }, after: { eval: 0 } }), []); // pérdida pequeña: nada
  // jugando negras el signo se invierte
  assert.deepEqual(ids(judgeFacts({ ...base, color: 'b', before: { eval: -20 }, after: { eval: 700 } })), ['error_grave', 'mejor_era']);
});

await t('veredictos: mejor jugada solo si la posición es clara; mate perdido', () => {
  const same = { color: 'w', uci: 'e2e4', bestUci: 'e2e4', bestSan: 'e4' };
  assert.deepEqual(ids(judgeFacts({ ...same, before: { eval: 20 }, after: { eval: 30 } })), []);
  assert.deepEqual(ids(judgeFacts({ ...same, before: { eval: 300 }, after: { eval: 320 } })), ['mejor_jugada']);
  assert.deepEqual(ids(judgeFacts({ ...same, before: { eval: -300 }, after: { eval: -290 } })), ['mejor_defensa']);
  const f = judgeFacts({ color: 'w', uci: 'e1d2', bestUci: 'a1a8', bestSan: 'Ra8#', before: { mate: 1 }, after: { eval: 900 } });
  assert.deepEqual(ids(f), ['mate_perdido']); assert.equal(f[0].slots.n, 1);
});

// motor real (minimax v2 en proceso) para el juez
class InProc extends Engine { async go(l) { return search(this.fen, { depth: l.depth ?? 5, time: l.time ?? 500 }); } }
registerEngine('juez-inproc', { name: 'Minimax (prueba)', levels: [{ id: '1', name: 'rápido', limits: { depth: 3, time: 200 } }, { id: '2', name: 'bueno', limits: { depth: 5, time: 500 } }, { id: '3', name: 'experto', limits: { depth: 6, time: 700 } }], create: async () => new InProc() });
registerEngine('random', { name: 'Aleatorio', levels: [{ id: '0', name: 'Azar', limits: {} }], create: async () => new InProc() });
const engines = { listEngines, getEngineInfo, createEngine };
const dictData = JSON.parse(readFileSync(new URL('../library/explicaciones-es.json', import.meta.url)));
const dict = new Dictionary(dictData);
const judge = new Judge({ engines, umbrales: dict.umbrales });
judge.setConfig({ engineId: 'juez-inproc' });
const ex = new Explainer({ library: null, dictionary: dict });

await t('juez: elige el nivel más alto por defecto, excluye al aleatorio y nombra al juez', () => {
  assert.equal(judge.config.levelId, '3');
  assert.ok(!judge.options().some((o) => o.id === 'random'));
  assert.match(judge.name, /Minimax \(prueba\)/);
  judge.setConfig({ levelId: '1' }); assert.equal(judge.weak, true);
  judge.setConfig({ levelId: '3' }); assert.equal(judge.weak, false);
});

await t('real: regalar la dama es error grave y se sugiere la mejor jugada', async () => {
  const fen = '4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1';
  const r = await ex.judgePly(judge, fen, ['e1f1'], 0);
  assert.ok(r.hechos.includes('error_grave'), JSON.stringify(r));
  assert.match(r.texto, /Era mejor Rxd5/); assert.match(r.texto, /según Minimax/);
});

await t('real: tomar la dama es la mejor jugada; no tomar un mate en 1 lo delata', async () => {
  const r1 = await ex.judgePly(judge, '4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1', ['d2d5'], 0);
  assert.ok(r1.hechos.includes('mejor_jugada'), JSON.stringify(r1));
  const r2 = await ex.judgePly(judge, '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', ['e1d2'], 0);
  assert.ok(r2.hechos.includes('mate_perdido') && /mate en 1/.test(r2.texto), JSON.stringify(r2));
});

await t('amenaza de mate (juez simulado): sondea con el turno devuelto al que movió', async () => {
  const llamadas = [];
  const fake = {
    umbrales: dict.umbrales, shortName: 'Juez falso', name: 'Juez falso', weak: false,
    async evaluate(fen) {
      llamadas.push(fen);
      if (fen.includes(' b ')) return { eval: 400, mate: null, move: 'a8b8' };   // tras la jugada
      if (fen.endsWith(' 1 1')) return { eval: 9000, mate: 1, move: 'c2c8' };     // sonda con turno blanco: mate en 1
      return { eval: 50, mate: null, move: 'b2c2' };                              // antes de la jugada
    },
  };
  const r = await ex.judgePly(fake, 'k7/8/8/8/8/8/1R6/4K3 w - - 0 1', ['b2c2'], 0);
  assert.ok(r && r.hechos[0] === 'amenaza_mate' && /mate en 1/.test(r.texto), JSON.stringify(r));
  assert.ok(llamadas.some((f) => f.split(' ')[1] === 'w' && f.endsWith(' 1 1')));
});

console.log(`\n${n} pruebas del juez OK`);
process.exit(0);
