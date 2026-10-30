import { Chess } from '../core/chess.js';

const UCI_RE = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i;
const SAN_RE = /^([NBRQK])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=?([QRBN]))?[+#]?[!?]*$/;
const PIEZA = { p: 'peón', n: 'caballo', b: 'alfil', r: 'torre', q: 'dama', k: 'rey' };

/** "12. Nf3" → "Nf3"; separa en fichas y limpia puntuación. */
function fichas(text) {
  return String(text)
    .replace(/\d+\s*\.(\.\.)?/g, ' ')
    .split(/[\s,;:()"'`*\[\]{}→«»]+/)
    .map((t) => t.replace(/[.!?]+$/, ''))
    .filter(Boolean);
}

function normaliza(tok) {
  if (/^0-0-0$/.test(tok)) return 'O-O-O';
  if (/^0-0$/.test(tok)) return 'O-O';
  return tok;
}

/** Intenta una ficha como jugada legal. Devuelve { from, to, promotion, san } o null. */
function probar(tok, fen) {
  const chess = new Chess(fen);
  try {
    const u = UCI_RE.exec(tok);
    const mv = u
      ? chess.move({ from: u[1].toLowerCase(), to: u[2].toLowerCase(), promotion: u[3]?.toLowerCase() })
      : chess.move(tok);
    return { from: mv.from, to: mv.to, promotion: mv.promotion, san: mv.san };
  } catch { return null; }
}

/**
 * Marcador explícito de la respuesta: la ÚLTIMA aparición de "Jugada: <jugada>" (o "Move: …"),
 * con o sin negritas. Devuelve la ficha escrita tras el marcador, o null si no hay marcador.
 */
export function extraerMarcador(text) {
  const re = /\b(?:jugada|move)\b[*_`]*[^\S\n]*(?:final[*_`]*[^\S\n]*)?[:=]/gi;
  let ultimo = null;
  for (let m; (m = re.exec(String(text)));) ultimo = m;
  if (!ultimo) return null;
  const resto = String(text).slice(ultimo.index + ultimo[0].length).split('\n')[0];
  return fichas(resto)[0] ?? null;
}

/**
 * Busca la jugada de una respuesta en texto libre. Acepta SAN y UCI, "0-0" y números de jugada.
 *  1. Si hay marcador ("Jugada: Nf3") manda el marcador: lo demás (razonamientos, jugadas descartadas) se ignora,
 *     y si la jugada del marcador es ilegal NO se busca otra en el texto.
 *  2. Sin marcador: primera ficha que sea jugada LEGAL (comportamiento clásico).
 * No modifica la partida. Devuelve { from, to, promotion, san, via } o null.
 */
export function findMoveInText(text, fen) {
  const marcada = extraerMarcador(text);
  if (marcada) {
    const r = probar(normaliza(marcada), fen);
    return r ? { ...r, via: 'marcador' } : null;
  }
  for (const tok of fichas(text)) {
    const r = probar(normaliza(tok), fen);
    if (r) return { ...r, via: 'texto' };
  }
  return null;
}

const nombreCasilla = (sq) => 'abcdefgh'[sq & 15] + (8 - (sq >> 4));
const coord = (s) => ({ f: s.charCodeAt(0) - 97, r: Number(s[1]) - 1 });

/** ¿Llega la pieza `tipo` de a a b en un tablero vacío? (geometría, sin mirar bloqueos) */
function geometria(tipo, a, b) {
  const df = Math.abs(a.f - b.f), dr = Math.abs(a.r - b.r);
  switch (tipo) {
    case 'n': return (df === 1 && dr === 2) || (df === 2 && dr === 1);
    case 'k': return df <= 1 && dr <= 1 && df + dr > 0;
    case 'b': return df === dr && df > 0;
    case 'r': return (df === 0) !== (dr === 0);
    case 'q': return (df === dr && df > 0) || ((df === 0) !== (dr === 0));
    default: return false;
  }
}

/**
 * Explica por qué una respuesta no trae una jugada legal. Se usa SOLO para mostrar el motivo
 * (no sugiere jugadas ni lista las legales). Devuelve un texto en español.
 */
export function explainRejection(text, fen) {
  const tok = normaliza(extraerMarcador(text) ?? fichas(text).find((t) => UCI_RE.test(t) || SAN_RE.test(normaliza(t))) ?? '');
  if (!tok) return 'No encontré nada que parezca una jugada (usa SAN, ej. Nf3, o UCI, ej. g1f3).';

  const c = new Chess(fen);
  const turno = c.turn();
  const propias = []; // { sq, tipo }
  for (const fila of c.board()) for (const p of fila) if (p && p.color === turno) propias.push({ sq: p.square, tipo: p.type });
  const ocupante = (sq) => c.get(sq);

  // --- enroque ---
  if (/^O-O(-O)?$/.test(tok)) {
    const lado = tok === 'O-O' ? 'k' : 'q';
    if (!c.getCastlingRights(turno)[lado]) return `${tok}: ya no tienes derecho a ese enroque (el rey o esa torre ya se movieron).`;
    if (c.isCheck()) return `${tok}: no se puede enrocar estando en jaque.`;
    return `${tok}: hay piezas entre el rey y la torre, o el rey cruzaría o caería en una casilla atacada.`;
  }

  // --- origen, destino y tipo de pieza ---
  let tipo, dest, origen = null, filtroF = null, filtroR = null, captura = false;
  const u = UCI_RE.exec(tok);
  if (u) {
    origen = u[1].toLowerCase();
    dest = u[2].toLowerCase();
    const p = ocupante(origen);
    if (!p) return `${tok}: no hay ninguna pieza en ${origen}.`;
    if (p.color !== turno) return `${tok}: la pieza en ${origen} es del rival; mueves ${turno === 'w' ? 'blancas' : 'negras'}.`;
    tipo = p.type;
  } else {
    const m = SAN_RE.exec(tok);
    if (!m) return `No reconozco «${tok}» como jugada (usa SAN, ej. Nf3, o UCI, ej. g1f3).`;
    tipo = (m[1] ?? 'P').toLowerCase();
    filtroF = m[2] ?? null;
    filtroR = m[3] ?? null;
    captura = m[4] === 'x';
    dest = m[5];
  }

  const objetivo = ocupante(dest);
  if (objetivo && objetivo.color === turno) return `${tok}: la casilla ${dest} está ocupada por tu propio ${PIEZA[objetivo.type]}.`;
  if (captura && !objetivo && !(tipo === 'p' && c.fen().split(' ')[3] === dest)) return `${tok}: no hay ninguna pieza rival que capturar en ${dest}.`;

  const cand = propias.filter((p) => p.tipo === tipo && (!origen || p.sq === origen)
    && (!filtroF || p.sq[0] === filtroF) && (!filtroR || p.sq[1] === filtroR));
  if (!cand.length) return `${tok}: no tienes ${tipo === 'p' ? 'ningún peón' : `ningún ${PIEZA[tipo]}`} que cumpla eso en el tablero.`;

  // ¿hay jugada pseudolegal (se mueve bien) que solo falla por dejar al rey en jaque?
  const pseudo = c._moves({ legal: false }).map((m) => ({ from: nombreCasilla(m.from), to: nombreCasilla(m.to) }));
  const pseudoOk = cand.some((p) => pseudo.some((m) => m.from === p.sq && m.to === dest));
  if (pseudoOk) {
    if (c.isCheck()) return `${tok}: tu rey está en jaque y esa jugada no lo resuelve (hay que capturar al atacante, interponer una pieza o mover el rey).`;
    if (tipo === 'k') return `${tok}: el rey no puede ir a una casilla atacada (¿queda junto al rey rival?).`;
    return `${tok}: dejaría a tu rey en jaque (la pieza está clavada).`;
  }

  // la pieza no llega: geometría o bloqueo
  const p0 = cand[0];
  if (tipo === 'p') return `${tok}: ese peón no puede ir a ${dest}. Avanza recto (1 casilla, o 2 desde su fila inicial) si el camino está libre, y captura en diagonal solo si hay una pieza rival.`;
  const b = coord(dest);
  const alcanzable = cand.find((p) => geometria(tipo, coord(p.sq), b));
  if (!alcanzable) return `${tok}: un ${PIEZA[tipo]} no se mueve así (de ${p0.sq} a ${dest}).`;
  if (tipo !== 'n') { // piezas deslizantes: buscar quién bloquea
    const { f: af, r: ar } = coord(alcanzable.sq);
    const sf = Math.sign(b.f - af), sr = Math.sign(b.r - ar);
    for (let f = af + sf, r = ar + sr; f !== b.f || r !== b.r; f += sf, r += sr) {
      const sq = 'abcdefgh'[f] + (r + 1);
      const o = ocupante(sq);
      if (o) return `${tok}: el camino del ${PIEZA[tipo]} (${alcanzable.sq}→${dest}) está bloqueado por ${o.color === turno ? 'tu' : 'un'} ${PIEZA[o.type]} en ${sq}.`;
    }
  }
  return `${tok}: esa jugada no es legal en esta posición.`;
}
