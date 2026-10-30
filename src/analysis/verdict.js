/**
 * Veredicto del juez (lógica pura): compara la evaluación antes y después de una jugada.
 * Todas las evaluaciones del juez van en centipeones desde las BLANCAS; `mate` > 0 = mate de blancas.
 */
export const UMBRALES_DEFECTO = {
  imprecision: 50, // cp perdidos para hablar de imprecisión
  error: 120,
  errorGrave: 300,
  mateMax: 6, // solo se habla de "mate perdido" si el mate era en ≤ N
  mejorMinVentaja: 150, // «mejor jugada» solo si la posición resultante es clara (|eval| ≥ N)
  amenazaMateMax: 3,
  juezTiempoMs: 350, // tope de tiempo por consulta al juez
};

const MATE_SCORE = 10000;

/** Puntuación comparable (cp, desde el punto de vista de `color`); los mates pesan muchísimo. */
export function povScore(info, color) {
  if (!info) return null;
  let s;
  if (info.mate != null) s = (info.mate > 0 ? 1 : -1) * (MATE_SCORE - Math.min(99, Math.abs(info.mate)) * 10);
  else if (info.eval != null) s = Math.max(-MATE_SCORE + 1000, Math.min(MATE_SCORE - 1000, info.eval));
  else return null;
  return color === 'w' ? s : -s;
}

const mateForMover = (info, color) => (info?.mate != null && (color === 'w' ? info.mate > 0 : info.mate < 0) ? Math.abs(info.mate) : null);

/**
 * @param {{before:object, after:object, color:'w'|'b', uci:string, bestUci:string|null, bestSan:string|null, umbrales?:object}} p
 *   before = evaluación de la posición ANTES de la jugada; after = DESPUÉS.
 * @returns {{id:string, slots:object}[]}  hechos listos para el diccionario (o [] si no hay nada que decir)
 */
export function judgeFacts({ before, after, color, uci, bestUci, bestSan, umbrales = {} }) {
  const U = { ...UMBRALES_DEFECTO, ...umbrales };
  const sb = povScore(before, color), sa = povScore(after, color);
  if (sb == null || sa == null) return [];
  const facts = [];
  const mejor = bestUci && bestUci !== uci ? bestSan : null;
  const mateAntes = mateForMover(before, color);
  const mateDespues = mateForMover(after, color);

  if (mateAntes != null && mateAntes <= U.mateMax && mateDespues == null && uci !== bestUci) {
    return [{ id: 'mate_perdido', slots: { n: mateAntes, mejor: bestSan ?? '?' } }];
  }
  if (uci === bestUci) {
    if (Math.abs(sa) >= U.mejorMinVentaja) facts.push({ id: sa > 0 ? 'mejor_jugada' : 'mejor_defensa', slots: {} });
    return facts;
  }
  const loss = sb - sa;
  // pérdidas enormes (mates por medio) se muestran como «más de 15» en vez de un número sin sentido
  const slots = { perdida: loss >= 1500 ? 'más de 15' : `~${(Math.max(0, loss) / 100).toFixed(1)}`, ...(mejor ? { mejor } : {}) };
  if (loss >= U.errorGrave) facts.push({ id: 'error_grave', slots });
  else if (loss >= U.error) facts.push({ id: 'error', slots });
  else if (loss >= U.imprecision) facts.push({ id: 'imprecision', slots });
  if (facts.length && mejor) facts.push({ id: 'mejor_era', slots });
  return facts;
}
