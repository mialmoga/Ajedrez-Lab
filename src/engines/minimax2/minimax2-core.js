/**
 * MINIMAX v2 — copia mejorada del núcleo v1 (que queda intacto como referencia).
 * Cada mejora se puede apagar/encender con `features` (ver DEFAULT_FEATURES y docs/MINIMAX2.md).
 * Con todas las funciones apagadas se comporta como el v1.
 *
 * Núcleo del motor propio: negamax + poda alfa-beta, profundización iterativa,
 * tabla de transposición, quiescence, ordenación de jugadas (MVV-LVA, killers, historial),
 * evaluación incremental (material + tablas de casillas).
 *
 * Es JS puro sin APIs del navegador: corre igual en un Web Worker o en Node (para pruebas).
 *
 * NOTA: por velocidad usa la API INTERNA de chess.js 1.4.0 (_moves, _makeMove, _undoMove,
 * _isKingAttacked). Por eso `vendor/chess` está fijado a esa versión.
 */
import { Chess } from '../../core/chess.js';

/** Funciones del v2 (true = activada). Se pueden sobrescribir por jugador: limits.features = { nullMove: false, ... } */
export const DEFAULT_FEATURES = {
  // --- evaluación ---
  parAlfiles: true, // bonus por tener los dos alfiles
  torresColumnas: true, // torres en columnas abiertas/semiabiertas y en la 7.ª
  estructuraPeones: true, // peones doblados y aislados
  peonesPasados: true, // bonus por peones pasados (crece al avanzar y en los finales)
  seguridadRey: true, // escudo de peones y piezas rivales cerca del rey
  movilidad: true, // movilidad de alfiles y torres
  finalArrinconar: true, // finales ganados (rival solo con peones): empuja su rey al borde y acerca el propio
  // --- búsqueda ---
  nullMove: true, // poda null-move
  lmrMejorado: true, // reducción de jugadas tardías según profundidad y orden
  aspiracion: true, // ventana de aspiración en la raíz
  contraataque: true, // heurística de contraataque en la ordenación
  podaQuiescence: true, // poda delta y de capturas malas en la quiescence + evaluación perezosa
  repeticiones: true, // detecta repeticiones (también con el historial de la partida)
  iteracionParcial: true, // si el tiempo se agota a mitad de una profundidad, usa la mejora ya hallada (solo sin ruido)
  gravedadHistorial: true, // frena el contador de la heurística de historial para que no invada otras bandas de ordenación
  tiempoDinamico: false, // se detiene antes si la mejor jugada es estable (ahorra tiempo; no aumenta la fuerza)
};

export const MATE = 100000;
const INF = 1e9;
const EXACT = 0, LOWER = 1, UPPER = 2;
const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const FILES = 'abcdefgh';

// Tablas de casillas (Simplified Evaluation Function). Índice 0 = a8, vista de las blancas.
const PST = {
  p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
  n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
  b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
  r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
  q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
};
const KING_MID = [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20];
const KING_END = [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50];

// Valores por casilla 0x88 (a8 = 0, h1 = 119). PV[color][tipo][casilla]
const PV = { w: {}, b: {} };
const KM = { w: new Int16Array(128), b: new Int16Array(128) };
const KE = { w: new Int16Array(128), b: new Int16Array(128) };
for (const t of 'pnbrq') { PV.w[t] = new Int16Array(128); PV.b[t] = new Int16Array(128); }
for (let row = 0; row < 8; row++) {
  for (let col = 0; col < 8; col++) {
    const sq = row * 16 + col, iw = row * 8 + col, ib = (7 - row) * 8 + col;
    for (const t of 'pnbrq') {
      PV.w[t][sq] = VAL[t] + PST[t][iw];
      PV.b[t][sq] = VAL[t] + PST[t][ib];
    }
    KM.w[sq] = KING_MID[iw]; KM.b[sq] = KING_MID[ib];
    KE.w[sq] = KING_END[iw]; KE.b[sq] = KING_END[ib];
  }
}

const sqName = (sq) => FILES[sq & 15] + (8 - (sq >> 4));
const moveUci = (m) => sqName(m.from) + sqName(m.to) + (m.promotion ?? '');

function assertInternals(chess) {
  for (const f of ['_moves', '_makeMove', '_undoMove', '_isKingAttacked', '_getPositionCount']) {
    if (typeof chess[f] !== 'function') {
      throw new Error(`El motor minimax necesita chess.js 1.4.0 (falta ${f}). Revisa vendor/chess.`);
    }
  }
}

/**
 * Busca la mejor jugada.
 * @param {string} fen
 * @param {import('../engine.js').SearchLimits & {onInfo?: Function}} limits
 * @returns {import('../engine.js').SearchResult | null}
 */
export function search(fen, { depth = 4, time = 2000, noise = 0, onInfo = null, features = null, historial = null } = {}) {
  const chess = new Chess(fen);
  assertInternals(chess);
  const F = { ...DEFAULT_FEATURES, ...(features ?? {}) };
  const EVAL_EXTRA = F.parAlfiles || F.torresColumnas || F.estructuraPeones || F.peonesPasados || F.seguridadRey || F.movilidad;

  // clave de turno de Zobrist (para la jugada nula), deducida comparando el hash con el turno invertido
  const flipTurn = (f) => { const p = f.split(' '); p[1] = p[1] === 'w' ? 'b' : 'w'; p[3] = '-'; return p.join(' '); };
  let SIDE = 0n;
  if (F.nullMove) {
    const f0 = fen.split(' '); f0[3] = '-';
    SIDE = new Chess(f0.join(' '))._hash ^ new Chess(flipTurn(fen))._hash;
  }

  // repeticiones: posiciones previas a la raíz (historial de la partida) y camino de la búsqueda
  const prior = new Map();
  if (F.repeticiones && historial) {
    for (const hf of historial) { const hh = new Chess(hf)._hash; prior.set(hh, (prior.get(hh) ?? 0) + 1); }
  }
  const pathHashes = [];

  // --- estado de evaluación incremental (punto de vista de blancas) ---
  const S = { ev: 0, npm: 0, nw: 0, nb: 0, kw: -1, kb: -1 };
  for (let sq = 0; sq < 120; sq++) {
    if (sq & 0x88) continue;
    const p = chess._board[sq];
    if (!p) continue;
    if (p.type === 'k') { if (p.color === 'w') S.kw = sq; else S.kb = sq; continue; }
    S.ev += (p.color === 'w' ? 1 : -1) * PV[p.color][p.type][sq];
    if (p.type !== 'p') { S.npm += VAL[p.type]; if (p.color === 'w') S.nw += VAL[p.type]; else S.nb += VAL[p.type]; }
  }

  function updateEval(m) {
    const c = m.color, o = c === 'w' ? 'b' : 'w';
    let d = 0;
    if (m.piece === 'k') {
      if (c === 'w') S.kw = m.to; else S.kb = m.to;
      if (m.flags & 32) d += PV[c].r[m.to - 1] - PV[c].r[m.to + 1]; // enroque corto
      else if (m.flags & 64) d += PV[c].r[m.to + 1] - PV[c].r[m.to - 2]; // enroque largo
    } else {
      const nt = m.promotion || m.piece;
      d += PV[c][nt][m.to] - PV[c][m.piece][m.from];
      if (m.promotion) { S.npm += VAL[m.promotion]; if (c === 'w') S.nw += VAL[m.promotion]; else S.nb += VAL[m.promotion]; }
    }
    if (m.captured && m.captured !== 'k') {
      const capSq = (m.flags & 8) ? (c === 'w' ? m.to + 16 : m.to - 16) : m.to;
      d += PV[o][m.captured][capSq];
      if (m.captured !== 'p') { S.npm -= VAL[m.captured]; if (o === 'w') S.nw -= VAL[m.captured]; else S.nb -= VAL[m.captured]; }
    }
    S.ev += c === 'w' ? d : -d;
  }

  function baseEval() {
    const t = Math.min(1, S.npm / 3000); // 1 = medio juego, 0 = final
    let ev = S.ev;
    if (S.kw >= 0) ev += t * KM.w[S.kw] + (1 - t) * KE.w[S.kw];
    if (S.kb >= 0) ev -= t * KM.b[S.kb] + (1 - t) * KE.b[S.kb];
    if (F.finalArrinconar && S.kw >= 0 && S.kb >= 0) ev += mopUp();
    return ev;
  }

  /**
   * "Arrinconar al rey": cuando un bando gana por mucho (>= 4 peones) y el rival no tiene piezas (solo rey y peones),
   * premia que el rey perdedor esté lejos del centro y que los reyes estén cerca. Sin esto, con poca profundidad
   * el motor no ve el mate en finales como rey y torre contra rey y mueve sin plan hasta la regla de 50 jugadas.
   * Devuelve centipeones desde el punto de vista de las blancas.
   */
  function mopUp() {
    let winner;
    if (S.nb === 0 && S.nw >= 500 && S.ev >= 400) winner = 'w';
    else if (S.nw === 0 && S.nb >= 500 && S.ev <= -400) winner = 'b';
    else return 0;
    const loserK = winner === 'w' ? S.kb : S.kw;
    const lf = loserK & 15, lr = loserK >> 4;
    const edge = Math.max(3 - lf, lf - 4) + Math.max(3 - lr, lr - 4); // 0 (centro) .. 6 (esquina)
    const wf = S.kw & 15, wr = S.kw >> 4, bf = S.kb & 15, br = S.kb >> 4;
    const close = 14 - (Math.abs(wf - bf) + Math.abs(wr - br)); // 13 (juntos) .. 0
    const bonus = 10 * edge + 4 * close;
    return winner === 'w' ? bonus : -bonus;
  }

  const BISHOP_DIRS = [15, 17, -15, -17], ROOK_DIRS = [16, -16, 1, -1];
  const PASSED = [0, 10, 20, 40, 70, 120];
  const SHIELD_NEAR = 12, SHIELD_FAR = 6;

  /** Términos extra del v2 (punto de vista de blancas), cada uno con su interruptor. */
  function extraEval() {
    const t = Math.min(1, S.npm / 3000);
    const board = chess._board;
    const pawnCnt = [new Int8Array(8), new Int8Array(8)]; // [0]=blancas [1]=negras
    const minRow = [new Int8Array(8).fill(99), new Int8Array(8).fill(99)]; // fila más baja (más cerca de la 8.ª) por columna
    const maxRow = [new Int8Array(8).fill(-1), new Int8Array(8).fill(-1)];
    const bishops = [0, 0];
    const pieces = []; // [sq, tipo, color(0/1)] de piezas no peón/rey
    for (let sq = 0; sq < 120; sq++) {
      if (sq & 0x88) continue;
      const p = board[sq];
      if (!p || p.type === 'k') continue;
      const c = p.color === 'w' ? 0 : 1;
      if (p.type === 'p') {
        const f = sq & 15, row = sq >> 4;
        pawnCnt[c][f]++;
        if (row < minRow[c][f]) minRow[c][f] = row;
        if (row > maxRow[c][f]) maxRow[c][f] = row;
      } else {
        pieces.push(sq, p.type, c);
        if (p.type === 'b') bishops[c]++;
      }
    }
    let ev = 0;
    const sgn = (c) => (c === 0 ? 1 : -1);

    if (F.parAlfiles) { if (bishops[0] >= 2) ev += 30; if (bishops[1] >= 2) ev -= 30; }

    if (F.estructuraPeones || F.peonesPasados) {
      for (let c = 0; c < 2; c++) {
        const o = 1 - c;
        for (let f = 0; f < 8; f++) {
          const n = pawnCnt[c][f];
          if (!n) continue;
          if (F.estructuraPeones) {
            if (n > 1) ev -= sgn(c) * 10 * (n - 1);
            const iso = (f === 0 || !pawnCnt[c][f - 1]) && (f === 7 || !pawnCnt[c][f + 1]);
            if (iso) ev -= sgn(c) * 12 * n;
          }
          if (F.peonesPasados) {
            // peón más avanzado de la columna: blancas = fila menor, negras = fila mayor
            const row = c === 0 ? minRow[c][f] : maxRow[c][f];
            let passed = true;
            for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1) && passed; ff++) {
              if (c === 0 ? minRow[o][ff] < row : maxRow[o][ff] > row) passed = false;
            }
            if (passed) {
              const adv = c === 0 ? 6 - row : row - 1; // 0..5
              if (adv > 0) ev += sgn(c) * Math.round(PASSED[Math.min(5, adv)] * (1 + (1 - t) * 0.6));
            }
          }
        }
      }
    }

    for (let i = 0; i < pieces.length; i += 3) {
      const sq = pieces[i], type = pieces[i + 1], c = pieces[i + 2];
      const f = sq & 15, row = sq >> 4;
      if (type === 'r') {
        if (F.torresColumnas) {
          if (!pawnCnt[c][f]) ev += sgn(c) * (pawnCnt[1 - c][f] ? 10 : 20);
          if (row === (c === 0 ? 1 : 6)) ev += sgn(c) * 12;
        }
        if (F.movilidad) ev += sgn(c) * 2 * (rayCount(sq, ROOK_DIRS) - 7);
      } else if (type === 'b' && F.movilidad) {
        ev += sgn(c) * 3 * (rayCount(sq, BISHOP_DIRS) - 6);
      }
    }

    if (F.seguridadRey && t > 0.25) {
      ev += kingSafety(0, S.kw, pawnCnt, minRow, maxRow, pieces) * t;
      ev -= kingSafety(1, S.kb, pawnCnt, minRow, maxRow, pieces) * t;
    }
    return ev;
  }

  function rayCount(sq, dirs) {
    let n = 0;
    for (const d of dirs) {
      let s = sq + d;
      while (!(s & 0x88)) {
        n++;
        if (chess._board[s]) break;
        s += d;
      }
    }
    return n;
  }

  /** Valor de seguridad del rey del color c (positivo = bien protegido). */
  function kingSafety(c, ksq, pawnCnt, minRow, maxRow, pieces) {
    if (ksq < 0) return 0;
    const kf = ksq & 15, kr = ksq >> 4;
    let score = 0;
    const home = c === 0 ? kr >= 6 : kr <= 1;
    if (home) {
      for (let f = Math.max(0, kf - 1); f <= Math.min(7, kf + 1); f++) {
        if (!pawnCnt[c][f]) { score -= 15; continue; }
        const r = c === 0 ? maxRow[c][f] : minRow[c][f]; // peón más retrasado (el que escuda)
        const dist = Math.abs(r - kr);
        score += dist === 1 ? SHIELD_NEAR : dist === 2 ? SHIELD_FAR : -4;
      }
    }
    let units = 0;
    for (let i = 0; i < pieces.length; i += 3) {
      if (pieces[i + 2] === c) continue;
      const sq = pieces[i];
      if (Math.max(Math.abs((sq & 15) - kf), Math.abs((sq >> 4) - kr)) > 3) continue;
      const ty = pieces[i + 1];
      units += ty === 'q' ? 5 : ty === 'r' ? 3 : 2;
    }
    score -= Math.min(units * units * 2, 120);
    return score;
  }

  function evaluate(turn, lazy) {
    let ev = baseEval();
    if (EVAL_EXTRA && !lazy) ev += extraEval();
    return turn === 'w' ? ev : -ev;
  }

  // --- control de tiempo y tablas auxiliares ---
  const start = Date.now();
  const deadline = start + time;
  let nodes = 0, aborted = false, checkTime = false;
  const tt = new Map();
  const killers = Array.from({ length: 128 }, () => [null, null]);
  const HISTORY_MAX = 5e6; // < 7e6 (contraataque): las jugadas tranquilas siempre ordenan por debajo
  const history = new Int32Array(128 * 128);
  const counter = new Int32Array(128 * 128).fill(-1); // contraataque: jugada que refutó a (from,to) previa
  const lmrTable = [];
  for (let d = 0; d < 64; d++) { lmrTable.push([]); for (let n = 0; n < 64; n++) lmrTable[d].push(d && n ? Math.floor(0.75 + Math.log(d) * Math.log(n) / 2.25) : 0); }

  const sameMove = (a, b) => a && b && a.from === b.from && a.to === b.to && a.promotion === b.promotion;

  function orderMoves(moves, ttMove, ply, prevKey = -1) {
    const cm = F.contraataque && prevKey >= 0 ? counter[prevKey] : -1;
    for (const m of moves) {
      let s = 0;
      if (ttMove && sameMove(m, ttMove)) s = 1e9;
      else if (m.captured) s = 1e7 + VAL[m.captured] * 10 - VAL[m.piece];
      else if (sameMove(m, killers[ply][0])) s = 9e6;
      else if (sameMove(m, killers[ply][1])) s = 8e6;
      else if (cm >= 0 && m.from * 128 + m.to === cm) s = 7e6;
      else s = history[m.from * 128 + m.to];
      if (m.promotion) s += 5e7 + VAL[m.promotion];
      m._s = s;
    }
    moves.sort((a, b) => b._s - a._s);
  }

  function tick() {
    if ((++nodes & 2047) === 0 && checkTime && Date.now() > deadline) aborted = true;
  }

  const LAZY = 200;
  function quiesce(alpha, beta, ply, qd) {
    tick();
    if (aborted) return 0;
    const us = chess._turn;
    let stand;
    if (F.podaQuiescence && EVAL_EXTRA) {
      // evaluación perezosa: los términos extra rara vez superan ±LAZY
      stand = evaluate(us, true);
      if (stand - LAZY >= beta) return stand;
      if (stand + LAZY > alpha) stand = evaluate(us, false);
    } else stand = evaluate(us, false);
    if (qd >= 8 || ply >= 90) return stand;
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const them = us === 'w' ? 'b' : 'w';
    const moves = chess._moves({ legal: false }).filter((m) => m.captured || m.promotion);
    orderMoves(moves, null, Math.min(ply, 127));
    for (const m of moves) {
      if (F.podaQuiescence && !m.promotion) {
        if (stand + VAL[m.captured] + 200 < alpha) continue; // poda delta
        if (VAL[m.captured] + 50 < VAL[m.piece] && chess._attacked(them, m.to)) continue; // captura mala (pieza grande por pequeña defendida)
      }
      const sev = S.ev, snpm = S.npm, snw = S.nw, snb = S.nb, skw = S.kw, skb = S.kb;
      chess._makeMove(m);
      if (chess._isKingAttacked(us)) { chess._undoMove(); continue; }
      updateEval(m);
      const score = -quiesce(-beta, -alpha, ply + 1, qd + 1);
      chess._undoMove();
      S.ev = sev; S.npm = snpm; S.nw = snw; S.nb = snb; S.kw = skw; S.kb = skb;
      if (aborted) return 0;
      if (score >= beta) return score;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function negamax(d, alpha, beta, ply, prevMove = null, nullOk = true) {
    tick();
    if (aborted) return 0;
    const key = chess._hash;
    if (chess._halfMoves >= 100) return 0;
    if (F.repeticiones) {
      if (prior.has(key)) return 0; // repite una posición ya vista antes de la raíz
      for (let i = pathHashes.length - 2; i >= 0; i -= 2) if (pathHashes[i] === key) return 0; // repite dentro de la búsqueda
    } else if (chess._getPositionCount(key) >= 2) return 0;
    const us = chess._turn;
    const inCheck = chess._isKingAttacked(us);
    if (inCheck && ply < 40) d++;
    if (d <= 0) return quiesce(alpha, beta, ply, 0);

    const alpha0 = alpha;
    const e = tt.get(key);
    let ttMove = null;
    if (e) {
      ttMove = e.move;
      if (e.depth >= d) {
        if (e.flag === EXACT) return e.score;
        if (e.flag === LOWER && e.score >= beta) return e.score;
        if (e.flag === UPPER && e.score <= alpha) return e.score;
      }
    }

    // jugada nula: si pasar turno ya basta para superar beta, el nodo se poda
    if (F.nullMove && nullOk && !inCheck && d >= 3 && beta < MATE - 1000 && (us === 'w' ? S.nw : S.nb) > 0 && evaluate(us, true) >= beta - 50) {
      const R = d >= 6 ? 3 : 2;
      const savedEp = chess._epSquare, savedHash = chess._hash;
      if (savedEp !== -1) chess._hash ^= chess._epKey();
      chess._epSquare = -1;
      chess._turn = us === 'w' ? 'b' : 'w';
      chess._hash ^= SIDE;
      pathHashes.push(key, null);
      const sc = -negamax(d - 1 - R, -beta, -beta + 1, ply + 1, null, false);
      pathHashes.pop(); pathHashes.pop();
      chess._turn = us; chess._epSquare = savedEp; chess._hash = savedHash;
      if (aborted) return 0;
      if (sc >= beta) return sc >= MATE - 1000 ? beta : sc;
    }

    const moves = chess._moves({ legal: false });
    const prevKey = prevMove ? prevMove.from * 128 + prevMove.to : -1;
    orderMoves(moves, ttMove, Math.min(ply, 127), prevKey);
    let best = -INF, bestMove = null, legal = 0;
    for (const m of moves) {
      const sev = S.ev, snpm = S.npm, snw = S.nw, snb = S.nb, skw = S.kw, skb = S.kb;
      chess._makeMove(m);
      if (chess._isKingAttacked(us)) { chess._undoMove(); continue; }
      legal++;
      updateEval(m);
      pathHashes.push(key, m);
      let score;
      const quiet = !m.captured && !m.promotion;
      if (legal > 4 && d >= 3 && quiet && !inCheck) {
        // reducción de jugadas tardías; si sorprende, se repite a profundidad completa
        const r = F.lmrMejorado ? Math.max(1, Math.min(d - 2, lmrTable[Math.min(d, 63)][Math.min(legal, 63)])) : 1;
        score = -negamax(d - 1 - r, -alpha - 1, -alpha, ply + 1, m);
        if (score > alpha && !aborted) score = -negamax(d - 1, -beta, -alpha, ply + 1, m);
      } else {
        score = -negamax(d - 1, -beta, -alpha, ply + 1, m);
      }
      pathHashes.pop(); pathHashes.pop();
      chess._undoMove();
      S.ev = sev; S.npm = snpm; S.nw = snw; S.nb = snb; S.kw = skw; S.kb = skb;
      if (aborted) return 0;
      if (score > best) { best = score; bestMove = m; }
      if (score > alpha) {
        alpha = score;
        if (alpha >= beta) {
          if (quiet) {
            const k = killers[Math.min(ply, 127)];
            if (!sameMove(k[0], m)) { k[1] = k[0]; k[0] = { from: m.from, to: m.to, promotion: m.promotion }; }
            // gravedad: el historial crece con d² pero se frena cerca de HISTORY_MAX, así nunca alcanza las bandas de killers/contraataque/capturas
            const hi = m.from * 128 + m.to, bonus = d * d;
            history[hi] += F.gravedadHistorial ? bonus - Math.trunc(history[hi] * bonus / HISTORY_MAX) : bonus;
            if (prevKey >= 0) counter[prevKey] = m.from * 128 + m.to;
          }
          break;
        }
      }
    }
    if (legal === 0) return inCheck ? -MATE + ply : 0;
    if (Math.abs(best) < MATE - 1000) {
      if (tt.size > 400000) tt.clear();
      tt.set(key, {
        depth: d,
        score: best,
        flag: best <= alpha0 ? UPPER : best >= beta ? LOWER : EXACT,
        move: bestMove && { from: bestMove.from, to: bestMove.to, promotion: bestMove.promotion },
      });
    }
    return best;
  }

  // --- raíz ---
  const us0 = chess._turn;
  let rootMoves = [];
  for (const m of chess._moves({ legal: false })) {
    chess._makeMove(m);
    const bad = chess._isKingAttacked(us0);
    chess._undoMove();
    if (!bad) rootMoves.push(m);
  }
  if (rootMoves.length === 0) return null;
  orderMoves(rootMoves, null, 0);

  const toWhite = (s) => (us0 === 'w' ? s : -s);
  let best = { move: rootMoves[0], score: 0, depth: 0 };
  const maxDepth = Math.max(1, depth);

  const rootHash = chess._hash;
  let prevBestUci = null, stable = 0, prevScore = 0, parcial = false;
  for (let d = 1; d <= maxDepth; d++) {
    checkTime = d > 1; // la profundidad 1 siempre termina: garantiza una jugada
    let scored = [];
    let partial = null; // mejor jugada con puntuación exacta de esta iteración (para usarla si el tiempo se acaba a medias)
    // ventana de aspiración: se busca con alpha cerca de la puntuación anterior; si todo cae por debajo, se repite abierta
    let lowBound = F.aspiracion && d >= 4 && noise === 0 ? prevScore - 60 : -INF;
    for (let attempt = 0; attempt < 2; attempt++) {
      let alpha = lowBound;
      scored = [];
      partial = null;
      for (const m of rootMoves) {
        const sev = S.ev, snpm = S.npm, snw = S.nw, snb = S.nb, skw = S.kw, skb = S.kb;
        chess._makeMove(m);
        updateEval(m);
        pathHashes.length = 0;
        pathHashes.push(rootHash, null); // la raíz es ancestro de todo el árbol
        // Con ruido, cada jugada necesita puntuación exacta (ventana completa);
        // sin ruido basta la ventana estrecha (más rápido).
        const sc = -negamax(d - 1, -INF, noise > 0 ? INF : -alpha, 1, m);
        chess._undoMove();
        S.ev = sev; S.npm = snpm; S.nw = snw; S.nb = snb; S.kw = skw; S.kb = skb;
        if (aborted) break;
        scored.push({ m, s: sc });
        if (sc > alpha) { alpha = sc; partial = { m, s: sc }; } // la ventana de la raíz es (alpha, ∞): si sube alpha, la puntuación es exacta
      }
      if (aborted) break;
      if (lowBound > -INF && alpha <= lowBound) { lowBound = -INF; continue; } // falló por abajo: repetir abierta
      break;
    }
    if (aborted) {
      // Iteración a medias: si ya se encontró (con puntuación exacta) una jugada mejor que la de la iteración anterior, se usa.
      // Con ruido no: ahí hace falta puntuar todas las jugadas para elegir.
      if (F.iteracionParcial && noise === 0 && partial && !sameMove(partial.m, best.move)) { best = { move: partial.m, score: partial.s, depth: best.depth }; parcial = true; }
      break;
    }

    let pick = scored[0];
    let pickVal = -INF;
    for (const x of scored) {
      const v = noise > 0 ? x.s + (Math.random() * 2 - 1) * noise : x.s;
      if (v > pickVal) { pickVal = v; pick = x; }
    }
    // Sin ruido: la jugada con mayor puntuación exacta (la ventana estrecha da cotas, no exactos).
    if (noise === 0) pick = scored.reduce((a, b) => (b.s > a.s ? b : a));
    best = { move: pick.m, score: pick.s, depth: d };
    prevScore = pick.s;

    // la mejor primero en la siguiente iteración
    rootMoves = [pick.m, ...rootMoves.filter((m) => m !== pick.m)];

    onInfo?.({ depth: d, eval: toWhite(pick.s), nodes, pv: extractPV(pick.m), mate: mateIn(pick.s, us0) });

    if (Math.abs(pick.s) > MATE - 100) break; // mate encontrado
    if (Date.now() > deadline) break;
    const u = moveUci(pick.m);
    stable = u === prevBestUci ? stable + 1 : 0;
    prevBestUci = u;
    if (F.tiempoDinamico && stable >= 2 && d >= 5 && Date.now() - start > time * 0.5) break;
  }

  function extractPV(first) {
    const pv = [moveUci(first)];
    let made = 0;
    chess._makeMove(first); made++;
    for (let i = 0; i < 7; i++) {
      const e = tt.get(chess._hash);
      if (!e?.move) break;
      const us = chess._turn;
      const m = chess._moves({ legal: false }).find((x) => sameMove(x, e.move));
      if (!m) break;
      chess._makeMove(m);
      if (chess._isKingAttacked(us)) { chess._undoMove(); break; }
      made++;
      pv.push(moveUci(m));
    }
    while (made--) chess._undoMove();
    return pv;
  }

  const elapsed = Date.now() - start;
  return {
    move: moveUci(best.move),
    eval: toWhite(best.score),
    mate: mateIn(best.score, us0),
    depth: best.depth,
    ...(parcial ? { parcial: true } : {}), // se jugó una mejora hallada en la iteración que no alcanzó a terminar
    nodes,
    nps: Math.round(nodes / Math.max(1, elapsed / 1000)),
    timeMs: elapsed,
    pv: best.depth ? extractPV(best.move) : [moveUci(best.move)],
  };
}

/** Mate en N jugadas (positivo = mate de blancas), o null. */
function mateIn(score, us) {
  if (Math.abs(score) < MATE - 100) return null;
  const n = Math.ceil((MATE - Math.abs(score)) / 2);
  const forUs = score > 0;
  return (forUs ? us === 'w' : us === 'b') ? n : -n;
}
