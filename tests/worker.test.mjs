// El worker del motor se prueba simulando la API de Web Worker (self.onmessage / postMessage).
import assert from 'node:assert/strict';
const out = [];
globalThis.self = { postMessage: (m) => out.push(m) };
await import('../src/engines/minimax/minimax-worker.js');
self.onmessage({ data: { id: 7, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', limits: { depth: 3, time: 1000 } } });
const infos = out.filter((m) => m.type === 'info'), res = out.find((m) => m.type === 'result');
assert.ok(infos.length >= 2 && infos.every((m) => m.id === 7));
assert.ok(res && res.id === 7 && /^[a-h][1-8][a-h][1-8]/.test(res.result.move));
self.onmessage({ data: { id: 8, fen: 'basura', limits: {} } });
assert.equal(out.at(-1).type, 'error');
console.log('  ✓ worker: info parcial, resultado y error con FEN inválido');
