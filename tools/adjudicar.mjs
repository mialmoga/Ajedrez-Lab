/**
 * Adjudicación de partidas que llegan al tope de jugadas (parte pura de tools/pruebas.mjs).
 *
 * Una partida que se corta en el tope no es necesariamente tablas: si un bando va ganando con claridad, se le da la
 * victoria según la evaluación de Stockfish de la posición final. Se cuenta aparte («adjudicada») para no mezclarla con
 * un mate real.
 */
export const UMBRAL_DEFECTO = 300; // centipeones
export const PROFUNDIDAD_ADJ = 12;

/** Lee un «info … score cp N | mate N» de UCI → { cp } | { mate } (del bando que mueve) o null. Ignora cotas. */
export function parsearScore(linea) {
  if (!linea.startsWith('info') || /lowerbound|upperbound/.test(linea)) return null;
  const m = /score (cp|mate) (-?\d+)/.exec(linea);
  return m ? { [m[1]]: Number(m[2]) } : null;
}

/** Pasa un score del bando que mueve al punto de vista del v2: devuelve centipeones (el mate pesa ±100000 − distancia). */
export function cpParaV2(score, turno, v2Blancas) {
  if (!score) return null;
  const cp = score.mate != null ? Math.sign(score.mate || 1) * (100000 - Math.abs(score.mate)) : score.cp;
  const blancas = turno === 'w' ? cp : -cp; // punto de vista de las blancas
  return v2Blancas ? blancas : -blancas;
}

/** Resultado de adjudicar: { puntos (del v2), fin, cp }. Sin evaluación o ventaja pequeña → tablas (como antes). */
export function adjudicar(cpV2, umbral = UMBRAL_DEFECTO) {
  if (cpV2 == null) return { puntos: 0.5, fin: 'tope de jugadas', cp: null };
  if (cpV2 >= umbral) return { puntos: 1, fin: 'adjudicada (gana v2)', cp: cpV2 };
  if (cpV2 <= -umbral) return { puntos: 0, fin: 'adjudicada (pierde v2)', cp: cpV2 };
  return { puntos: 0.5, fin: 'tope de jugadas', cp: cpV2 };
}
