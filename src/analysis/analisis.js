/**
 * Análisis de una partida completa con el juez (estilo «revisión de partida»).
 *
 *  - `analizarPartida(...)`  recorre la partida, pide al juez la evaluación y la mejor jugada de cada posición
 *    (asíncrono, con progreso y cancelación) y devuelve un objeto serializable «analisis».
 *  - `resumir(analisis)`    (puro) clasifica cada jugada, cuenta por bando, calcula la precisión y los momentos clave.
 *
 * Formato del análisis (JSON, versión 1):
 *   { version:1, juez:'Stockfish 19 …', inicio?:fen, jugadas:[uci],
 *     pos:[{e,m,b}], // N+1 posiciones: e = cp (blancas) | null, m = mate (+ blancas) | null, b = mejor jugada UCI | null
 *     lib:[bool], sac:[bool] }  // N jugadas: ¿de la librería de aperturas? ¿ofrece una pieza?
 *
 * Clases (ids): libro, brillante, mejor, buena, imprecision, error, error_grave.
 * Los umbrales son los del narrador (verdict.js), para que no se contradigan.
 */
import { Chess } from '../core/chess.js';
import { povScore, UMBRALES_DEFECTO } from './verdict.js';
import { sacrificio } from './detectors/sacrificio.js';

export const CLASES = {
  libro: { etiqueta: 'Libro', simbolo: '📖', color: '#8a8f98' },
  brillante: { etiqueta: 'Brillante', simbolo: '!!', color: '#1bbfb0' },
  mejor: { etiqueta: 'Mejor', simbolo: '★', color: '#3aa655' },
  buena: { etiqueta: 'Buena', simbolo: '✓', color: '#8bbf4a' },
  imprecision: { etiqueta: 'Imprecisión', simbolo: '?!', color: '#e0b020' },
  error: { etiqueta: 'Error', simbolo: '?', color: '#e8832a' },
  error_grave: { etiqueta: 'Error grave', simbolo: '??', color: '#d83a3a' },
};
export const ORDEN_CLASES = Object.keys(CLASES);

const IGUAL_A_MEJOR = 15; // cp: perder tan poco respecto a la mejor jugada cuenta como «mejor»
const DECIDIDA = 500; // cp: si antes y después sigues claramente ganando (o perdiendo), no se castiga
const MATE_PERDIDO_PERDIDA = 1000; // pérdidas mayores (mates por medio) nunca se perdonan
const mateParaQuien = (info, color) => (info?.mate != null && (color === 'w' ? info.mate > 0 : info.mate < 0) ? Math.abs(info.mate) : null);

/**
 * Clase de una jugada (pura). `before`/`after` = {eval, mate} de blancas; devuelve { clase, perdida } o null sin datos.
 * perdida = centipeones perdidos para quien movió (≥ 0).
 */
export function clasificar({ before, after, color, uci, bestUci, libro = false, sacrifica = false, umbrales = {} }) {
  const U = { ...UMBRALES_DEFECTO, ...umbrales };
  const sb = povScore(before, color), sa = povScore(after, color);
  if (sb == null || sa == null) return null;
  const perdida = Math.max(0, sb - sa);
  const esMejor = !!bestUci && uci === bestUci;

  const mateAntes = mateParaQuien(before, color);
  if (mateAntes != null && mateAntes <= U.mateMax && mateParaQuien(after, color) == null && !esMejor) return { clase: 'error_grave', perdida };
  if (libro && perdida < U.imprecision) return { clase: 'libro', perdida };
  if (esMejor || perdida <= IGUAL_A_MEJOR) {
    const brillante = sacrifica && sa >= -50 && sb <= 600 && perdida <= IGUAL_A_MEJOR;
    return { clase: brillante ? 'brillante' : 'mejor', perdida };
  }
  if (perdida < U.imprecision) return { clase: 'buena', perdida };
  const decidida = perdida < MATE_PERDIDO_PERDIDA && ((sb >= DECIDIDA && sa >= DECIDIDA) || (sb <= -DECIDIDA && sa <= -DECIDIDA));
  if (decidida) return { clase: 'buena', perdida }; // la partida ya estaba decidida: no cambia nada
  return { clase: perdida >= U.errorGrave ? 'error_grave' : perdida >= U.error ? 'error' : 'imprecision', perdida };
}

/**
 * Texto breve de una jugada clasificada (p. ej. «pierde ~1.7 · era mejor Qd3»). `rc` = elemento de resumir().plies,
 * `fenAntes` = posición antes de la jugada (para escribir la mejor en SAN). '' si no hay nada que añadir.
 */
export function detalleDeClase(rc, fenAntes) {
  if (!rc?.clase) return '';
  if (['imprecision', 'error', 'error_grave'].includes(rc.clase)) {
    let mejor = rc.mejor;
    try { if (mejor) mejor = new Chess(fenAntes).move({ from: mejor.slice(0, 2), to: mejor.slice(2, 4), promotion: mejor[4] })?.san ?? mejor; } catch { /* se queda el UCI */ }
    return ` · pierde ~${(rc.perdida / 100).toFixed(1)}${mejor ? ` · era mejor ${mejor}` : ''}`;
  }
  if (rc.clase === 'brillante') return ' · ofrece una pieza y la posición lo aguanta';
  if (rc.clase === 'mejor') return ' · coincide con la del juez';
  return '';
}

/** Probabilidad de ganar (0..100) a partir de centipeones del punto de vista de quien mueve (curva de Lichess). */
export const probGanar = (cp) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-3000, Math.min(3000, cp)))) - 1);

/** Precisión de una jugada (0..100) según la caída de probabilidad de ganar (fórmula pública de Lichess). */
export function precisionJugada(sb, sa) {
  const caida = probGanar(sb) - probGanar(sa);
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * caida) - 3.1669));
}

/** Resumen puro de un análisis → { plies, contadores, precision, clave, completo }. */
export function resumir(analisis, { umbrales = {}, clave = 5 } = {}) {
  const { jugadas, pos, lib = [], sac = [] } = analisis;
  const plies = [];
  const contadores = { w: Object.fromEntries(ORDEN_CLASES.map((c) => [c, 0])), b: Object.fromEntries(ORDEN_CLASES.map((c) => [c, 0])) };
  const acc = { w: [], b: [] };
  const blackFirst = (analisis.inicio ?? '').split(' ')[1] === 'b';
  let conDato = 0;
  for (let i = 0; i < jugadas.length; i++) {
    const color = (i % 2 === 0) !== blackFirst ? 'w' : 'b';
    const a = pos[i], d = pos[i + 1];
    const r = a && d ? clasificar({
      before: { eval: a.e, mate: a.m }, after: { eval: d.e, mate: d.m }, color, uci: jugadas[i], bestUci: a.b,
      libro: !!lib[i], sacrifica: !!sac[i], umbrales,
    }) : null;
    const ply = { i, color, uci: jugadas[i], clase: r?.clase ?? null, perdida: r?.perdida ?? null, mejor: r && a.b && a.b !== jugadas[i] ? a.b : null };
    plies.push(ply);
    if (r) {
      conDato++;
      contadores[color][r.clase]++;
      acc[color].push(precisionJugada(povScore({ eval: a.e, mate: a.m }, color), povScore({ eval: d.e, mate: d.m }, color)));
    }
  }
  const media = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const momentos = plies.filter((p) => p.clase === 'error' || p.clase === 'error_grave' || p.clase === 'imprecision')
    .sort((x, y) => y.perdida - x.perdida).slice(0, clave).sort((x, y) => x.i - y.i);
  return { plies, contadores, precision: { w: media(acc.w), b: media(acc.b) }, clave: momentos, completo: conDato === jugadas.length };
}

/**
 * Analiza una partida con el juez. Devuelve el objeto «analisis».
 * @param {{judge:object, library?:object, inicio?:string, jugadas:string[], onProgress?:(hecho:number,total:number)=>void, signal?:AbortSignal}} p
 * Lanza un Error con name 'AbortError' si se cancela.
 */
export async function analizarPartida({ judge, library = null, inicio, jugadas, onProgress, signal }) {
  const c = new Chess(inicio ?? undefined);
  const total = jugadas.length + 1;
  const pos = [], lib = [], sac = [];
  const abort = () => { if (signal?.aborted) { const e = new Error('Análisis cancelado'); e.name = 'AbortError'; throw e; } };

  const evaluar = async (chess) => {
    if (chess.isCheckmate()) return { e: null, m: chess.turn() === 'w' ? -1 : 1, b: null, terminal: true }; // gana quien acaba de mover
    if (chess.isDraw() || chess.isStalemate()) return { e: 0, m: null, b: null, terminal: true };
    const r = await judge.evaluate(chess.fen());
    return r ? { e: r.mate != null ? null : r.eval ?? null, m: r.mate ?? null, b: r.move ?? null } : { e: null, m: null, b: null };
  };

  abort();
  pos.push(await evaluar(c));
  onProgress?.(1, total);
  for (let i = 0; i < jugadas.length; i++) {
    abort();
    const u = jugadas[i];
    let mv = null;
    try { mv = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch { /* ilegal */ }
    if (!mv) throw new Error(`Jugada ilegal en la posición ${i + 1}: ${u}`);
    lib.push(enLibro(library, c.fen(), u));
    sac.push(!!sacrificio.detect({ after: c, move: mv, color: mv.color }));
    pos.push(await evaluar(c));
    onProgress?.(i + 2, total);
  }
  abort();
  return { version: 1, juez: judge.name, ...(inicio ? { inicio } : {}), jugadas: [...jugadas], pos, lib, sac };
}

/** ¿La jugada que lleva a `fenDespues` es la siguiente de alguna línea de la librería? */
function enLibro(library, fenDespues, uci) {
  for (const { line, i } of library?.positionsFor(fenDespues) ?? []) if (i > 0 && line.moves[i - 1]?.uci === uci) return true;
  return false;
}
