/**
 * Lógica pura de la autopsia (tools/autopsia.mjs): pérdida de una jugada, causa del error, fase y tipo de jugada.
 */
export const MATE_CP = 10000;
export const UMBRAL_ERROR = 120; // cp perdidos para contar una jugada como error (el mismo del narrador)
export const TOPE_PERDIDA = 3000;

/** Valor en cp de un score UCI { cp } | { mate } (del bando que mueve). El mate pesa ±(10000 − distancia). */
export function valorCp(score) {
  if (!score) return null;
  if (score.mate != null) return Math.sign(score.mate || 1) * (MATE_CP - Math.abs(score.mate));
  return score.cp;
}

/**
 * Centipeones que pierde quien movió: `antes` = score de la posición previa (de quien mueve) y `despues` = score de la
 * posición resultante (del rival, que es quien mueve ahora). Nunca negativo; con tope para que un mate no domine los promedios.
 */
export function perdida(antes, despues) {
  const a = valorCp(antes), d = valorCp(despues);
  if (a == null || d == null) return null;
  return Math.min(TOPE_PERDIDA, Math.max(0, a + d));
}

/**
 * Causa de un error a partir de las veces que se le dio más tiempo al v2 y si arregló la jugada:
 *   sondeos = [{ factor, perdida }] en orden creciente de tiempo.
 *   horizonte-corto  → ya con poco más de tiempo encontró algo bueno: faltaba un poco de profundidad
 *   horizonte-largo  → solo con mucho más tiempo: la trampa estaba lejos
 *   evaluacion       → ni con mucho tiempo: ve el problema pero lo juzga mal (o la poda/orden lo descarta)
 */
export function causaDelError(sondeos, umbral = UMBRAL_ERROR) {
  if (!sondeos?.length) return { causa: 'sin-sondeo', factor: null };
  const i = sondeos.findIndex((s) => s.perdida != null && s.perdida < umbral);
  if (i < 0) return { causa: 'evaluacion', factor: null };
  return { causa: i === 0 ? 'horizonte-corto' : 'horizonte-largo', factor: sondeos[i].factor };
}

/** Fase de la partida: 'apertura' (primeras 20 jugadas), 'final' (≤ 6 piezas que no son peones ni reyes) o 'medio'. */
export function fase(ply, fenPosicion) {
  const piezas = (fenPosicion.split(' ')[0].match(/[nbrqNBRQ]/g) ?? []).length;
  if (piezas <= 6) return 'final';
  return ply < 20 ? 'apertura' : 'medio';
}

/** Tipo de una jugada en SAN: 'jaque' | 'captura' | 'tranquila' (los mates cuentan como jaque). */
export function tipoDeJugada(san) {
  if (/[+#]/.test(san)) return 'jaque';
  return san.includes('x') ? 'captura' : 'tranquila';
}

/** Resumen de una lista de errores [{ causa, fase, tipoV2, tipoMejor, perdida }] → conteos por causa, fase y tipo. */
export function resumirErrores(errores) {
  const cuenta = (f) => errores.reduce((o, e) => { const k = f(e); o[k] = (o[k] ?? 0) + 1; return o; }, {});
  return {
    total: errores.length,
    porCausa: cuenta((e) => e.causa),
    porFase: cuenta((e) => e.fase),
    // «se perdió una táctica»: la mejor era captura o jaque y v2 jugó una tranquila
    tacticaPerdida: errores.filter((e) => e.tipoMejor !== 'tranquila' && e.tipoV2 === 'tranquila').length,
    perdidaMedia: errores.length ? errores.reduce((a, e) => a + e.perdida, 0) / errores.length : 0,
  };
}
