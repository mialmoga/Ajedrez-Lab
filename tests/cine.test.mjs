// Pruebas puntuales del ritmo del modo cine (la parte pura).
import assert from 'node:assert/strict';
import { duracionJugada } from '../src/ui/cine.js';
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ✓', name); };

t('jugada normal: base; captura, jaque, mate y errores alargan', () => {
  const base = duracionJugada({ san: 'e4', subtitulos: false });
  assert.equal(base, 1.8);
  assert.ok(duracionJugada({ san: 'exd5', captura: true, subtitulos: false }) > base);
  assert.ok(duracionJugada({ san: 'Qh5+', subtitulos: false }) > base);
  assert.ok(duracionJugada({ san: 'Qxf7#', captura: true, subtitulos: false }) > duracionJugada({ san: 'Qxf7+', captura: true, subtitulos: false }));
  assert.ok(duracionJugada({ san: 'a3', clase: 'error', subtitulos: false }) > base);
  assert.equal(duracionJugada({ san: 'a3', clase: 'buena', subtitulos: false }), base);
});
t('subtítulos: más texto, más tiempo, con tope', () => {
  const corto = duracionJugada({ san: 'e4', caracteres: 20 }), largo = duracionJugada({ san: 'e4', caracteres: 100 }), enorme = duracionJugada({ san: 'e4', caracteres: 5000 });
  assert.ok(largo > corto);
  assert.equal(enorme, 1.8 + 3);
});
t('velocidad: 2× dura la mitad; una velocidad rara se ignora', () => {
  assert.equal(duracionJugada({ san: 'e4', subtitulos: false, velocidad: 2 }), 0.9);
  assert.equal(duracionJugada({ san: 'e4', subtitulos: false, velocidad: 0.5 }), 3.6);
  assert.equal(duracionJugada({ san: 'e4', subtitulos: false, velocidad: 7 }), 1.8);
});
console.log(`cine: ${n} pruebas ok`);
