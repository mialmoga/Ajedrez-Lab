import { h, fmtEval } from './dom.js';
import { Chess } from '../core/chess.js';

/**
 * Ayudas del modo Práctica (💡 Pista y «Marcar casillas»), pensadas para vivir dentro del panel
 * «Explicación de la jugada». Solo se muestran cuando `modo.ayuda`; si no, una nota discreta explica cómo activarlas.
 * Devuelve { el, destroy }.
 */
export function createAyudas({ game, review, judge, boardCtl, modo, analisisCtl }) {
  // ayudas: marcas de casillas (rojo = tu pieza en riesgo, verde = rival vulnerable, ámbar punteado = clavada)
  const marcasChk = h('input', { type: 'checkbox' });
  marcasChk.addEventListener('change', () => boardCtl.setMarcas(marcasChk.checked));
  const marcasRow = h('label', { class: 'row small', title: 'Rojo: tu pieza atacada sin defensa suficiente · Verde: pieza rival vulnerable · Ámbar punteado: pieza clavada' }, marcasChk, ' Marcar casillas ', h('span', { class: 'muted' }, '🔴 en riesgo · 🟢 vulnerable · 🟠 clavada'));
  // 💡: mejor jugada según el juez (flecha fuerte) y la respuesta que esperaría (flecha tenue)
  const hintMsg = h('div', { class: 'muted small', role: 'status' });
  const hintBtn = h('button', { title: 'Ver la jugada que haría el juez (Stockfish por defecto) y la respuesta esperada' }, '💡 Pista');
  let hintSeq = 0;
  const shownFen = () => (review?.active ? game.fens[review.ply] : game.chess.fen());
  const san = (fen, uci) => { try { return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })?.san ?? null; } catch { return null; } };
  hintBtn.addEventListener('click', async () => {
    if (!modo?.ayuda || !judge) return;
    const fen = shownFen(), my = ++hintSeq;
    if (new Chess(fen).isGameOver()) { hintMsg.textContent = 'La partida ya terminó.'; return; }
    hintBtn.disabled = true; hintMsg.textContent = `Pensando… (${judge.name})`;
    try {
      const best = await judge.evaluate(fen);
      if (my !== hintSeq || fen !== shownFen()) return; // la posición cambió mientras pensaba
      if (!best?.move) { hintMsg.textContent = 'El juez no devolvió una jugada.'; return; }
      const flechas = [{ from: best.move.slice(0, 2), to: best.move.slice(2, 4), tipo: 'mejor' }];
      let txt = `💡 ${judge.shortName} jugaría ${san(fen, best.move) ?? best.move} (${fmtEval(best)}).`;
      try { // respuesta esperada: mejor jugada del rival tras la sugerida
        const c = new Chess(fen); c.move({ from: best.move.slice(0, 2), to: best.move.slice(2, 4), promotion: best.move[4] });
        if (!c.isGameOver()) {
          const reply = await judge.evaluate(c.fen());
          if (my !== hintSeq || fen !== shownFen()) return;
          if (reply?.move) { flechas.push({ from: reply.move.slice(0, 2), to: reply.move.slice(2, 4), tipo: 'respuesta' }); txt += ` Respuesta esperada: ${san(c.fen(), reply.move) ?? reply.move}.`; }
        }
      } catch { /* sin respuesta: se muestra solo la mejor */ }
      boardCtl.setFlechas(flechas);
      hintMsg.textContent = txt;
    } catch (e) { hintMsg.textContent = `No pude consultar al juez: ${e.message ?? e}`; }
    finally { hintBtn.disabled = false; }
  });
  const nota = h('div', { class: 'muted small' }, 'Ayudas (💡 pista y marcas): elige el modo Práctica en el panel Partida antes de empezar.');
  const caja = h('div', { class: 'ayudas' }, h('div', { class: 'row' }, hintBtn, marcasRow), hintMsg);
  const el = h('div', {}, caja, nota);
  const limpiar = () => { hintSeq++; hintMsg.textContent = ''; };
  function refresh() {
    caja.style.display = modo.ayuda ? '' : 'none';
    nota.style.display = modo.ayuda ? 'none' : '';
    if (!modo.ayuda) { hintSeq++; hintMsg.textContent = ''; if (marcasChk.checked) { marcasChk.checked = false; boardCtl.setMarcas(false); } }
  }
  // Revisando una jugada floja del análisis: la jugada que debió hacerse, como flecha verde (si hay ayudas)
  function flechaDeError() {
    if (!modo.ayuda || !review?.active || !analisisCtl) return;
    const rc = analisisCtl.claseDe(review.viewPly - 1);
    if (rc?.mejor && ['imprecision', 'error', 'error_grave'].includes(rc.clase)) boardCtl.setFlechas([{ from: rc.mejor.slice(0, 2), to: rc.mejor.slice(2, 4), tipo: 'mejor' }]);
  }
  const offs = [game.on('change', limpiar), review?.on('change', () => { limpiar(); flechaDeError(); }), modo.on('change', refresh), analisisCtl?.on('change', (e) => { if (e.estado !== 'running') flechaDeError(); })].filter(Boolean);
  refresh();
  return { el, destroy: () => offs.forEach((f) => f()) };
}
