/**
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
export function search(fen, { depth = 4, time = 2000, noise = 0, onInfo = null } = {}) {
  const chess = new Chess(fen);
  assertInternals(chess);

  // --- estado de evaluación incremental (punto de vista de blancas) ---
  const S = { ev: 0, npm: 0, kw: -1, kb: -1 };
  for (let sq = 0; sq < 120; sq++) {
    if (sq & 0x88) continue;
    const p = chess._board[sq];
    if (!p) continue;
    if (p.type === 'k') { if (p.color === 'w') S.kw = sq; else S.kb = sq; continue; }
    S.ev += (p.color === 'w' ? 1 : -1) * PV[p.color][p.type][sq];
    if (p.type !== 'p') S.npm += VAL[p.type];
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
      if (m.promotion) S.npm += VAL[m.promotion];
    }
    if (m.captured && m.captured !== 'k') {
      const capSq = (m.flags & 8) ? (c === 'w' ? m.to + 16 : m.to - 16) : m.to;
      d += PV[o][m.captured][capSq];
      if (m.captured !== 'p') S.npm -= VAL[m.captured];
    }
    S.ev += c === 'w' ? d : -d;
  }

  function evaluate(turn) {
    const t = Math.min(1, S.npm / 3000); // 1 = medio juego, 0 = final
    let ev = S.ev;
    if (S.kw >= 0) ev += t * KM.w[S.kw] + (1 - t) * KE.w[S.kw];
    if (S.kb >= 0) ev -= t * KM.b[S.kb] + (1 - t) * KE.b[S.kb];
    return turn === 'w' ? ev : -ev;
  }

  // --- control de tiempo y tablas auxiliares ---
  const start = Date.now();
  const deadline = start + time;
  let nodes = 0, aborted = false, checkTime = false;
  const tt = new Map();
  const killers = Array.from({ length: 128 }, () => [null, null]);
  const history = new Int32Array(128 * 128);

  const sameMove = (a, b) => a && b && a.from === b.from && a.to === b.to && a.promotion === b.promotion;

  function orderMoves(moves, ttMove, ply) {
    for (const m of moves) {
      let s = 0;
      if (ttMove && sameMove(m, ttMove)) s = 1e9;
      else if (m.captured) s = 1e7 + VAL[m.captured] * 10 - VAL[m.piece];
      else if (sameMove(m, killers[ply][0])) s = 9e6;
      else if (sameMove(m, killers[ply][1])) s = 8e6;
      else s = history[m.from * 128 + m.to];
      if (m.promotion) s += 5e7 + VAL[m.promotion];
      m._s = s;
    }
    moves.sort((a, b) => b._s - a._s);
  }

  function tick() {
    if ((++nodes & 2047) === 0 && checkTime && Date.now() > deadline) aborted = true;
  }

  function quiesce(alpha, beta, ply, qd) {
    tick();
    if (aborted) return 0;
    const us = chess._turn;
    const stand = evaluate(us);
    if (qd >= 8 || ply >= 90) return stand;
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const moves = chess._moves({ legal: false }).filter((m) => m.captured || m.promotion);
    orderMoves(moves, null, Math.min(ply, 127));
    for (const m of moves) {
      const sev = S.ev, snpm = S.npm, skw = S.kw, skb = S.kb;
      chess._makeMove(m);
      if (chess._isKingAttacked(us)) { chess._undoMove(); continue; }
      updateEval(m);
      const score = -quiesce(-beta, -alpha, ply + 1, qd + 1);
      chess._undoMove();
      S.ev = sev; S.npm = snpm; S.kw = skw; S.kb = skb;
      if (aborted) return 0;
      if (score >= beta) return score;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function negamax(d, alpha, beta, ply) {
    tick();
    if (aborted) return 0;
    if (chess._halfMoves >= 100 || chess._getPositionCount(chess._hash) >= 2) return 0;
    const us = chess._turn;
    const inCheck = chess._isKingAttacked(us);
    if (inCheck && ply < 40) d++;
    if (d <= 0) return quiesce(alpha, beta, ply, 0);

    const alpha0 = alpha;
    const key = chess._hash;
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

    const moves = chess._moves({ legal: false });
    orderMoves(moves, ttMove, Math.min(ply, 127));
    let best = -INF, bestMove = null, legal = 0;
    for (const m of moves) {
      const sev = S.ev, snpm = S.npm, skw = S.kw, skb = S.kb;
      chess._makeMove(m);
      if (chess._isKingAttacked(us)) { chess._undoMove(); continue; }
      legal++;
      updateEval(m);
      let score;
      const quiet = !m.captured && !m.promotion;
      if (legal > 4 && d >= 3 && quiet && !inCheck) {
        // reducción de jugadas tardías; si sorprende, se repite a profundidad completa
        score = -negamax(d - 2, -alpha - 1, -alpha, ply + 1);
        if (score > alpha && !aborted) score = -negamax(d - 1, -beta, -alpha, ply + 1);
      } else {
        score = -negamax(d - 1, -beta, -alpha, ply + 1);
      }
      chess._undoMove();
      S.ev = sev; S.npm = snpm; S.kw = skw; S.kb = skb;
      if (aborted) return 0;
      if (score > best) { best = score; bestMove = m; }
      if (score > alpha) {
        alpha = score;
        if (alpha >= beta) {
          if (quiet) {
            const k = killers[Math.min(ply, 127)];
            if (!sameMove(k[0], m)) { k[1] = k[0]; k[0] = { from: m.from, to: m.to, promotion: m.promotion }; }
            history[m.from * 128 + m.to] += d * d;
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

  for (let d = 1; d <= maxDepth; d++) {
    checkTime = d > 1; // la profundidad 1 siempre termina: garantiza una jugada
    let alpha = -INF;
    const scored = [];
    for (const m of rootMoves) {
      const sev = S.ev, snpm = S.npm, skw = S.kw, skb = S.kb;
      chess._makeMove(m);
      updateEval(m);
      // Con ruido, cada jugada necesita puntuación exacta (ventana completa);
      // sin ruido basta la ventana estrecha (más rápido).
      const s = -negamax(d - 1, -INF, noise > 0 ? INF : -alpha, 1);
      chess._undoMove();
      S.ev = sev; S.npm = snpm; S.kw = skw; S.kb = skb;
      if (aborted) break;
      scored.push({ m, s });
      if (s > alpha) alpha = s;
    }
    if (aborted) break;

    let pick = scored[0];
    let pickVal = -INF;
    for (const x of scored) {
      const v = noise > 0 ? x.s + (Math.random() * 2 - 1) * noise : x.s;
      if (v > pickVal) { pickVal = v; pick = x; }
    }
    // Sin ruido: la jugada con mayor puntuación exacta (la ventana estrecha da cotas, no exactos).
    if (noise === 0) pick = scored.reduce((a, b) => (b.s > a.s ? b : a));
    best = { move: pick.m, score: pick.s, depth: d };

    // la mejor primero en la siguiente iteración
    rootMoves = [pick.m, ...rootMoves.filter((m) => m !== pick.m)];

    onInfo?.({ depth: d, eval: toWhite(pick.s), nodes, pv: extractPV(pick.m), mate: mateIn(pick.s, us0) });

    if (Math.abs(pick.s) > MATE - 100) break; // mate encontrado
    if (Date.now() > deadline) break;
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
