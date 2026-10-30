import { Chess, DEFAULT_POSITION } from '../core/chess.js';

/**
 * Partidas sueltas: exportar e importar (JSON propio y PGN básico).
 *
 * Formato JSON  'ajedrez-lab/partida@1':
 *   { formato, blancas, negras, resultado, razon, apertura, inicio, fecha, evento, jugadas:[uci], evals?:[cp] }
 *
 * PGN: se leen las cabeceras y las jugadas. Se IGNORAN comentarios {…} y ;…, variantes (…),
 * NAGs ($1) y símbolos !? — en esta versión no se conservan.
 */

export const FORMATO_PARTIDA = 'ajedrez-lab/partida@1';
const RESULTADOS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

/** Convierte una lista UCI en SAN (valida legalidad). Devuelve { san, hasta } con `hasta` = nº de jugadas válidas. */
export function uciToSan(uciList, inicio = DEFAULT_POSITION) {
  const c = new Chess(inicio);
  const san = [];
  for (const u of uciList) {
    try {
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      san.push(m.san);
    } catch { break; }
  }
  return { san, hasta: san.length, final: c };
}

/** Resultado PGN a partir del estado del tablero. */
export function resultadoDe(chess) {
  if (chess.isCheckmate()) return chess.turn() === 'w' ? '0-1' : '1-0';
  if (chess.isDraw() || chess.isStalemate()) return '1/2-1/2';
  return '*';
}

/** Arma el objeto de partida exportable. `data.jugadas` en UCI. */
export function crearPartida(data) {
  const inicio = data.inicio && data.inicio !== DEFAULT_POSITION ? data.inicio : undefined;
  const { hasta, final } = uciToSan(data.jugadas, inicio ?? DEFAULT_POSITION);
  const resultado = RESULTADOS.has(data.resultado) ? data.resultado : resultadoDe(final);
  const out = {
    formato: FORMATO_PARTIDA,
    blancas: data.blancas || 'Blancas',
    negras: data.negras || 'Negras',
    resultado,
    ...(data.razon ? { razon: data.razon } : {}),
    ...(data.apertura ? { apertura: data.apertura } : {}),
    ...(inicio ? { inicio } : {}),
    fecha: data.fecha ?? new Date().toISOString(),
    evento: data.evento || 'Ajedrez Lab',
    jugadas: data.jugadas.slice(0, hasta),
  };
  if (data.evals?.some((e) => e != null)) out.evals = data.evals.slice(0, hasta);
  if (data.modo === 'prueba' || data.modo === 'practica') out.modo = data.modo; // cómo se jugó: 'practica' = con ayudas
  const an = data.analisis; // análisis del juez: solo si corresponde exactamente a estas jugadas
  if (an && an.version === 1 && Array.isArray(an.pos) && an.pos.length === out.jugadas.length + 1 && an.jugadas?.join(' ') === out.jugadas.join(' ')) out.analisis = an;
  if (Number.isInteger(data.rechazos) && data.rechazos > 0) out.rechazos = data.rechazos; // respuestas de IA sin jugada legal (PNG)
  return out;
}

const pgnTag = (k, v) => `[${k} "${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;

/** PGN de una partida (objeto de crearPartida). */
export function toPGN(p) {
  const fecha = (p.fecha ?? '').slice(0, 10).replace(/-/g, '.') || '????.??.??';
  const tags = [
    pgnTag('Event', p.evento ?? 'Ajedrez Lab'), pgnTag('Site', 'Ajedrez Lab'), pgnTag('Date', fecha),
    pgnTag('Round', '-'), pgnTag('White', p.blancas), pgnTag('Black', p.negras), pgnTag('Result', p.resultado),
  ];
  if (p.apertura) tags.push(pgnTag('Opening', typeof p.apertura === 'string' ? p.apertura : p.apertura.nombre));
  if (p.razon) tags.push(pgnTag('Termination', p.razon));
  const inicio = p.inicio ?? DEFAULT_POSITION;
  if (p.inicio) tags.push(pgnTag('SetUp', '1'), pgnTag('FEN', p.inicio));

  const { san } = uciToSan(p.jugadas, inicio);
  const blackFirst = inicio.split(' ')[1] === 'b';
  const startNum = Number(inicio.split(' ')[5]) || 1;
  const parts = [];
  san.forEach((s, i) => {
    const white = blackFirst ? i % 2 === 1 : i % 2 === 0;
    const num = startNum + Math.floor((i + (blackFirst ? 1 : 0)) / 2);
    if (white) parts.push(`${num}. ${s}`);
    else parts.push(i === 0 ? `${num}... ${s}` : s);
  });
  parts.push(p.resultado);
  // saltos de línea a ~80 columnas
  const lines = [];
  let cur = '';
  for (const w of parts.join(' ').split(' ')) {
    if (cur && cur.length + 1 + w.length > 80) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return `${tags.join('\n')}\n\n${lines.join('\n')}\n`;
}

/** Quita comentarios, variantes, NAGs y números de jugada. Devuelve la lista de fichas de jugada. */
function tokensDeJugadas(texto) {
  let t = texto.replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
  let depth = 0, sin = '';
  for (const ch of t) { // variantes anidadas
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (!depth) sin += ch;
  }
  return sin
    .replace(/\$\d+/g, ' ')
    .replace(/\d+\s*\.(\.\.)?/g, ' ') // 12.  12...
    .replace(/[…]/g, ' ')
    .split(/\s+/)
    .map((x) => x.replace(/[!?]+$/g, '').replace(/^0-0-0$/, 'O-O-O').replace(/^0-0$/, 'O-O'))
    .filter(Boolean);
}

/** Lee el primer juego de un PGN → { headers, san:[...], resultado } (sin validar legalidad). */
export function parsePGN(texto) {
  const lines = texto.replace(/\r/g, '').split('\n');
  const headers = {};
  let i = 0;
  for (; i < lines.length; i++) { // bloque de cabeceras al inicio
    const l = lines[i].trim();
    if (!l) continue;
    const m = /^\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]$/.exec(l);
    if (!m) break;
    headers[m[1]] = m[2].replace(/\\(["\\])/g, '$1');
  }
  let rest = lines.slice(i);
  const next = rest.findIndex((l, k) => k > 0 && /^\[Event\s/.test(l.trim())); // segundo juego: se ignora
  if (next > 0) rest = rest.slice(0, next);
  const cuerpo = rest.join('\n');
  // cortar en el resultado final del primer juego
  const toks = tokensDeJugadas(cuerpo);
  const san = [];
  let resultado = headers.Result && RESULTADOS.has(headers.Result) ? headers.Result : '*';
  for (const tk of toks) {
    if (RESULTADOS.has(tk)) { resultado = tk; break; }
    if (/^[a-hKQRBNO][\w=+#x-]*$/.test(tk)) san.push(tk);
  }
  return { headers, san, resultado };
}

/** SAN → UCI validando cada jugada. Devuelve { uci, error? } (error = qué jugada falló). */
export function sanToUci(sanList, inicio = DEFAULT_POSITION) {
  const c = new Chess(inicio);
  const uci = [];
  for (let i = 0; i < sanList.length; i++) {
    let m;
    try { m = c.move(sanList[i]); } catch { m = null; }
    if (!m) return { uci, error: `Jugada ilegal o ilegible en la posición ${i + 1}: "${sanList[i]}"` };
    uci.push(m.from + m.to + (m.promotion ?? ''));
  }
  return { uci };
}

/**
 * Lee un archivo de texto (JSON de partida o PGN) y devuelve una partida normalizada:
 * { blancas, negras, resultado, razon, apertura, inicio, jugadas:[uci], evals?, aviso? }. Lanza Error si no sirve.
 */
export function leerPartida(texto) {
  const t = texto.trim();
  if (!t) throw new Error('El archivo está vacío.');
  if (t.startsWith('{')) {
    let o;
    try { o = JSON.parse(t); } catch { throw new Error('JSON ilegible.'); }
    if (o.formato !== FORMATO_PARTIDA) throw new Error(`Formato no reconocido (${o.formato ?? 'sin campo "formato"'}). ¿Es un torneo o una liga? Ábrelo en su pestaña.`);
    if (!Array.isArray(o.jugadas)) throw new Error('El JSON no trae "jugadas".');
    const inicio = o.inicio ?? DEFAULT_POSITION;
    const uci = validarUci(o.jugadas, inicio);
    const aviso = uci.length < o.jugadas.length ? `Solo ${uci.length} de ${o.jugadas.length} jugadas eran legales; el resto se descartó.` : undefined;
    return { ...o, inicio: o.inicio, jugadas: uci, ...(aviso ? { aviso } : {}) };
  }
  const { headers, san, resultado } = parsePGN(t);
  if (!san.length && !headers.FEN) throw new Error('No encontré jugadas en el PGN.');
  const inicio = headers.SetUp === '1' || headers.FEN ? (headers.FEN ?? DEFAULT_POSITION) : DEFAULT_POSITION;
  try { new Chess(inicio); } catch { throw new Error('El FEN de la cabecera es inválido.'); }
  const { uci, error } = sanToUci(san, inicio);
  if (!uci.length && error) throw new Error(error);
  return {
    blancas: headers.White || 'Blancas',
    negras: headers.Black || 'Negras',
    resultado,
    ...(headers.Termination ? { razon: headers.Termination } : {}),
    ...(headers.Opening ? { apertura: { nombre: headers.Opening } } : {}),
    ...(headers.Event ? { evento: headers.Event } : {}),
    inicio: inicio === DEFAULT_POSITION ? undefined : inicio,
    jugadas: uci,
    ...(error ? { aviso: `${error}. Se cargó hasta la jugada ${uci.length}.` } : {}),
  };
}

function validarUci(list, inicio) {
  const c = new Chess(inicio);
  const out = [];
  for (const u of list) {
    try {
      const m = c.move({ from: String(u).slice(0, 2), to: String(u).slice(2, 4), promotion: String(u)[4] });
      out.push(m.from + m.to + (m.promotion ?? ''));
    } catch { break; }
  }
  return out;
}

/** Nombre de archivo cómodo: blancas-vs-negras */
export function nombreArchivo(p, ext) {
  const slug = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'x';
  return `partida-${slug(p.blancas)}-vs-${slug(p.negras)}.${ext}`;
}
