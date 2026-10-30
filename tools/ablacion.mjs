#!/usr/bin/env node
// Atajo de la ablación original: equivale a `node tools/pruebas.mjs --suite v1-fuerte …` (mismo archivo de resultados).
if (!process.argv.includes('--suite')) process.argv.splice(2, 0, '--suite', 'v1-fuerte');
await import('./pruebas.mjs');
