import { Chess } from '../core/chess.js';
import { chessStatus } from '../core/game.js';

const EVAL_CLIP = 1500; // cp: tope para guardar/graficar (los mates se guardan como ±1500)
const ADJUDICATE_CP = 900;
const ADJUDICATE_PLIES = 8;

const clip = (v) => Math.max(-EVAL_CLIP, Math.min(EVAL_CLIP, Math.round(v)));

function withTimeout(promise, ms, onTimeout) {
  let t;
  const timeout = new Promise((resolve) => { t = setTimeout(() => { onTimeout?.(); resolve('timeout'); }, ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

/**
 * Juega una partida completa SIN interfaz (motor contra motor).
 *
 * @param {object} o
 * @param {{engineId:string, limits:object}} o.white
 * @param {{engineId:string, limits:object}} o.black
 * @param {string[]} [o.opening]       jugadas UCI ya hechas (apertura de la pareja)
 * @param {number}   [o.maxPlies]      tope de jugadas; al llegar se adjudica por la última evaluación
 * @param {boolean}  [o.adjudicate]    adjudicar victoria si hay ventaja decisiva sostenida
 * @param {(id:string)=>Promise<import('../engines/engine.js').Engine>} o.createEngine
 * @param {AbortSignal} [o.signal]
 * @param {(info:{ply:number,move:string,san:string,eval:number|null})=>void} [o.onMove]
 * @returns {Promise<{aborted:true}|{resultado:string, razon:string, jugadas:string[], evals:(number|null)[], tiempoMs:number}>}
 */
export async function playGame({ white, black, opening = [], maxPlies = 250, adjudicate = true, createEngine, signal, onMove }) {
  const chess = new Chess();
  const jugadas = [];
  const evals = [];
  for (const u of opening) {
    chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    jugadas.push(u);
    evals.push(null);
  }
  const t0 = Date.now();
  const done = (resultado, razon) => ({ resultado, razon, jugadas, evals, tiempoMs: Date.now() - t0 });
  if (signal?.aborted) return { aborted: true };

  const engines = { w: await createEngine(white.engineId), b: await createEngine(black.engineId) };
  const stopAll = () => { engines.w.stop(); engines.b.stop(); };
  signal?.addEventListener('abort', stopAll);
  const specs = { w: white, b: black };
  let streak = { side: null, count: 0 };

  try {
    while (true) {
      if (signal?.aborted) return { aborted: true };
      const st = chessStatus(chess);
      if (st.over) return done(st.winner === 'w' ? '1-0' : st.winner === 'b' ? '0-1' : '1/2-1/2', st.reason);
      if (jugadas.length >= maxPlies) {
        const last = [...evals].reverse().find((e) => e != null) ?? 0;
        return done(last > 300 ? '1-0' : last < -300 ? '0-1' : '1/2-1/2', 'límite de jugadas');
      }

      const side = chess.turn();
      const spec = specs[side];
      await engines[side].setPosition(chess.fen(), chess.history({ verbose: true }).map((m) => m.before));
      const ms = (spec.limits?.time ?? 5000) + 10000;
      const res = await withTimeout(engines[side].go(spec.limits ?? {}), ms, () => engines[side].stop());
      if (signal?.aborted) return { aborted: true };
      if (res === 'timeout') return done(side === 'w' ? '0-1' : '1-0', 'tiempo agotado del motor');
      if (!res) return { aborted: true };

      let mv;
      try {
        mv = chess.move({ from: res.move.slice(0, 2), to: res.move.slice(2, 4), promotion: res.move[4] });
      } catch {
        return done(side === 'w' ? '0-1' : '1-0', 'jugada ilegal del motor');
      }
      const raw = res.mate != null ? (res.mate > 0 ? EVAL_CLIP : -EVAL_CLIP) : res.eval;
      const ev = raw == null ? null : clip(raw);
      jugadas.push(res.move);
      evals.push(ev);
      onMove?.({ ply: jugadas.length, move: res.move, san: mv.san, eval: ev });

      if (adjudicate && ev != null && Math.abs(ev) >= ADJUDICATE_CP) {
        const s = ev > 0 ? 'w' : 'b';
        streak = streak.side === s ? { side: s, count: streak.count + 1 } : { side: s, count: 1 };
        if (streak.count >= ADJUDICATE_PLIES) return done(s === 'w' ? '1-0' : '0-1', 'adjudicación');
      } else {
        streak = { side: null, count: 0 };
      }
    }
  } catch (err) {
    if (signal?.aborted) return { aborted: true };
    throw err;
  } finally {
    signal?.removeEventListener('abort', stopAll);
    engines.w.dispose();
    engines.b.dispose();
  }
}
