import { exportButtons } from './panel-moves.js';
import { crearPartida } from '../exchange/partida.js';
import { Chess } from '../core/chess.js';
import { createBoard2D } from './board2d.js';
import { createEvalChart } from './eval-chart.js';
import { h } from './dom.js';

const fmtCp = (e) => (e == null ? '–' : `${e > 0 ? '+' : ''}${(e / 100).toFixed(2)}`);
const RESULT_TEXT = { '1-0': 'ganan blancas', '0-1': 'ganan negras', '1/2-1/2': 'tablas' };

/**
 * Visor de partidas: tablero 2D + ◀ ▶ + lista de jugadas + gráfica de evaluación.
 * Registro que acepta: { key, blancas, negras, jugadas:[uci], evals:[], resultado?, razon?, apertura?, vivo? }
 *   - show(record): carga una partida (empieza en la jugada 0; las "vivas" siguen la última jugada)
 *   - update(record): añade jugadas nuevas de una partida en vivo (misma `key`)
 */
export function createReplayViewer(container, { theme, onOpenMain, explainer, judge }) {
  const root = h('div', { class: 'replay', tabindex: 0 });
  const title = h('div', { class: 'rp-title' }, 'Visor de partidas');
  const sub = h('div', { class: 'muted small' }, 'Elige una partida en el cuadro del torneo.');
  const boardHost = h('div', { class: 'rp-board' });
  const evalText = h('span', { class: 'muted small' });
  const plyText = h('span', { class: 'muted small' });
  const btn = (label, title_, fn) => h('button', { title: title_, onClick: fn }, label);
  const playBtn = btn('▶', 'Reproducir', () => togglePlay());
  const speed = h('select', { 'aria-label': 'Velocidad' },
    h('option', { value: 1200 }, 'lento'), h('option', { value: 700, selected: true }, 'normal'), h('option', { value: 300 }, 'rápido'));
  speed.value = '700';
  speed.addEventListener('change', () => { if (timer) { stopPlay(); togglePlay(); } });
  const controls = h('div', { class: 'rp-controls' },
    btn('⏮', 'Inicio', () => goto(0)), btn('◀', 'Anterior', () => goto(cursor - 1)), playBtn,
    btn('▶▶', 'Siguiente', () => goto(cursor + 1)), btn('⏭', 'Final', () => goto(positions.length - 1)), speed,
    plyText, evalText);
  const chart = createEvalChart({ onSeek: (p) => goto(p) });
  const explain = h('div', { class: 'explain rp-explain' });
  const moves = h('div', { class: 'moves rp-moves' });
  const openBtn = h('button', { onClick: () => rec && onOpenMain?.(rec, cursor) }, 'Abrir en el tablero principal (3D)');
  const note = h('span', { class: 'muted small', role: 'status' });
  const expBtns = exportButtons(() => rec && crearPartida({
    jugadas: rec.jugadas, blancas: rec.blancas, negras: rec.negras, resultado: rec.vivo ? '*' : rec.resultado,
    razon: rec.razon, apertura: rec.apertura, evals: rec.evals, evento: rec.evento,
  }), (t, bad) => { note.textContent = t; note.className = bad ? 'warn small' : 'muted small'; });
  root.append(title, sub, boardHost, controls, explain, chart.el, moves, h('div', { class: 'btn-row' }, openBtn, ...expBtns), note);
  container.append(root);

  const view = createBoard2D(boardHost, { theme });
  let rec = null;
  let positions = [];
  let sans = [];
  let chess = null;
  let cursor = 0;
  let timer = null;
  let judgeToken = 0;

  function snapshot(mv) {
    const board = chess.board();
    let checkSquare = null;
    if (chess.isCheck()) {
      for (const row of board) for (const p of row) if (p && p.type === 'k' && p.color === chess.turn()) checkSquare = p.square;
    }
    return { board, lastMove: mv ? { from: mv.from, to: mv.to } : null, checkSquare };
  }
  function rebuild(jugadas) {
    chess = new Chess();
    positions = [snapshot(null)];
    sans = [];
    extend(jugadas);
  }
  function extend(jugadas) {
    for (let i = positions.length - 1; i < jugadas.length; i++) {
      const u = jugadas[i];
      const mv = chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      sans.push(mv.san);
      positions.push(snapshot(mv));
    }
  }

  function render() {
    if (!rec) return;
    const pos = positions[cursor];
    view.setState({ ...pos, selected: null, targets: [], orientation: 'w' });
    title.textContent = `⚪ ${rec.blancas}  vs  ⚫ ${rec.negras}`;
    const parts = [];
    if (rec.apertura?.nombre) parts.push(`Apertura: ${rec.apertura.nombre}`);
    parts.push(rec.vivo ? '● en juego' : `${rec.resultado} · ${RESULT_TEXT[rec.resultado] ?? ''}${rec.razon ? ` (${rec.razon})` : ''}`);
    sub.textContent = parts.join(' · ');
    plyText.textContent = `jugada ${cursor}/${positions.length - 1}`;
    evalText.textContent = cursor > 0 ? `eval ${fmtCp(rec.evals?.[cursor - 1])}` : '';
    chart.set(rec.evals, cursor);
    explain.replaceChildren();
    if (cursor > 0 && explainer) {
      let r = null;
      try { r = explainer.explainPly(rec.inicio ?? undefined, rec.jugadas, cursor - 1); } catch { /* sin explicación */ }
      explain.append(h('b', {}, sans[cursor - 1]), ...(r ? [h('span', { class: 'tag' }, r.fuente), h('div', { class: 'note' }, r.texto)] : [h('div', { class: 'muted small' }, ' —')]));
      if (judge) {
        // veredicto del juez bajo demanda (no compite por CPU con las partidas en curso)
        const my = ++judgeToken, k = cursor - 1, jug = rec.jugadas, ini = rec.inicio ?? undefined;
        const out = h('div', {});
        const btn = h('button', { class: 'mini', onClick: async () => {
          btn.disabled = true; btn.textContent = '⏳ analizando…';
          try {
            const v = await explainer.judgePly(judge, ini, jug, k);
            if (my !== judgeToken) return;
            btn.remove();
            out.append(...(v ? [h('span', { class: 'tag' }, `juez: ${judge.shortName}`), h('div', { class: 'note judge' }, v.texto)] : [h('div', { class: 'muted small' }, 'El juez no ve nada que señalar.')]));
          } catch { btn.textContent = 'Analizar con el juez'; btn.disabled = false; }
        } }, `Analizar con el juez (${judge.shortName})`);
        explain.append(btn, out);
      }
    }
    const bookPlies = rec.apertura?.jugadas?.length ?? 0;
    moves.replaceChildren();
    sans.forEach((san, i) => {
      if (i % 2 === 0) moves.append(h('span', { class: 'no' }, `${i / 2 + 1}.`));
      moves.append(h('span', { class: `mv go${i < bookPlies ? ' book' : ''}${i + 1 === cursor ? ' last' : ''}`, 'data-ply': i + 1, onClick: () => goto(i + 1) }, san));
    });
    moves.querySelector('.last')?.scrollIntoView?.({ block: 'nearest' });
  }

  function goto(p) {
    cursor = Math.max(0, Math.min(positions.length - 1, p));
    render();
  }
  function stopPlay() { clearInterval(timer); timer = null; playBtn.textContent = '▶'; }
  function togglePlay() {
    if (timer) return stopPlay();
    if (cursor >= positions.length - 1) goto(0);
    playBtn.textContent = '⏸';
    timer = setInterval(() => { if (cursor >= positions.length - 1) stopPlay(); else goto(cursor + 1); }, +speed.value);
  }

  root.addEventListener('keydown', (e) => {
    const k = { ArrowLeft: () => goto(cursor - 1), ArrowRight: () => goto(cursor + 1), Home: () => goto(0), End: () => goto(positions.length - 1), ' ': togglePlay }[e.key];
    if (k) { e.preventDefault(); k(); }
  });

  function clear() {
    stopPlay();
    rec = null;
    rebuild([]);
    cursor = 0;
    view.setState({ ...positions[0], selected: null, targets: [], orientation: 'w' });
    title.textContent = 'Visor de partidas';
    sub.textContent = 'Elige una partida en el cuadro del torneo.';
    plyText.textContent = '';
    evalText.textContent = '';
    chart.set([], 0);
    explain.replaceChildren();
    moves.replaceChildren();
  }
  clear();

  return {
    el: root,
    clear,
    current: () => rec,
    show(record) {
      stopPlay();
      rec = record;
      rebuild(record.jugadas);
      cursor = record.vivo ? positions.length - 1 : 0;
      render();
    },
    update(record) {
      if (!rec || rec.key !== record.key) return;
      const atEnd = cursor === positions.length - 1;
      rec = record;
      extend(record.jugadas);
      if (atEnd) cursor = positions.length - 1;
      render();
    },
    setTheme(t) { view.setTheme(t); },
    destroy() { stopPlay(); root.remove(); },
  };
}
