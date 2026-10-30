import { h } from './dom.js';
import { reyIcon } from './icons.js';
import { createEvalChart } from './eval-chart.js';
import { CLASES, ORDEN_CLASES } from '../analysis/analisis.js';

const fmtPct = (x) => (x == null ? '–' : `${x.toFixed(1)}%`);

/** Panel «Análisis de la partida»: lanzar el análisis con el juez, gráfica, contadores, precisión y momentos clave. */
export function createAnalysisPanel(root, ctx) {
  const { analisisCtl: ctl, game, review, match } = ctx;
  const msg = h('div', { class: 'muted small', role: 'status' });
  const btn = h('button', { onClick: () => ctl.analizar() }, '🔍 Analizar partida');
  const cancel = h('button', { onClick: () => ctl.cancelar() }, 'Cancelar');
  const fill = h('div', { class: 'bar-fill' });
  const bar = h('div', { class: 'bar', hidden: true }, fill);
  const chart = createEvalChart({ onSeek: (p) => review.goto(p) });
  const resultado = h('div', { class: 'analisis-res' });
  const nota = h('div', { class: 'muted small' }, 'El juez es el del panel «Explicación de la jugada». Las jugadas se clasifican con los mismos umbrales del narrador; la precisión usa la caída de probabilidad de ganar (fórmula pública de Lichess).');
  root.append(h('div', { class: 'row' }, btn, cancel), bar, msg, resultado, nota);

  const evalesDe = (a) => a.pos.slice(1).map((p) => (p.m != null ? (p.m > 0 ? 1500 : -1500) : p.e));

  function tabla(r) {
    const celda = (c, color) => h('td', {}, String(r.contadores[color][c] || '·'));
    return h('table', { class: 'analisis-tabla' },
      h('thead', {}, h('tr', {}, h('th', {}), h('th', {}, reyIcon('w'), ' Blancas'), h('th', {}, reyIcon('b'), ' Negras'))),
      h('tbody', {},
        h('tr', { class: 'prec' }, h('td', {}, 'Precisión'), h('td', {}, fmtPct(r.precision.w)), h('td', {}, fmtPct(r.precision.b))),
        ...ORDEN_CLASES.map((c) => h('tr', {}, h('td', {}, h('span', { class: 'cls-dot', style: { background: CLASES[c].color } }), ` ${CLASES[c].simbolo} ${CLASES[c].etiqueta}`), celda(c, 'w'), celda(c, 'b')))));
  }

  function nombreJugada(p) {
    const num = Math.floor((p.i + (game.moves[0]?.color === 'b' ? 1 : 0)) / 2) + 1;
    return `${num}${p.color === 'w' ? '.' : '…'} ${game.moves[p.i]?.san ?? p.uci}`;
  }

  function render() {
    const i = ctl.info();
    const motivo = ctl.motivoNo();
    btn.disabled = i.estado === 'running' || !!motivo;
    btn.title = motivo ?? 'Evalúa cada posición con el juez';
    cancel.hidden = i.estado !== 'running';
    bar.hidden = i.estado !== 'running';
    fill.style.width = i.total ? `${(100 * i.hecho) / i.total}%` : '0%';
    msg.textContent = i.estado === 'running' ? `Analizando… posición ${i.hecho} de ${i.total} (${ctl.judge.name})`
      : i.estado === 'error' ? `No se pudo analizar: ${i.error}`
      : ctl.analisis && !i.vigente ? 'La partida cambió desde el último análisis. Vuelve a analizar.'
      : motivo ?? (ctl.analisis ? `Análisis hecho con ${ctl.analisis.juez}${ctl.resumen?.completo ? '' : ' (faltan datos en algunas jugadas)'}.` : '');
    resultado.replaceChildren();
    if (ctl.analisis && i.vigente && ctl.resumen) {
      const r = ctl.resumen;
      chart.set(evalesDe(ctl.analisis), review.viewPly);
      resultado.append(chart.el, tabla(r));
      if (r.clave.length) {
        resultado.append(h('div', { class: 'muted small' }, 'Momentos clave'), h('div', { class: 'momentos' }, ...r.clave.map((p) => h('button', {
          class: 'momento', title: `Ir a la jugada · perdió ~${(p.perdida / 100).toFixed(1)}${p.mejor ? ` · mejor: ${p.mejor}` : ''}`, onClick: () => review.goto(p.i + 1),
        }, h('span', { class: 'cls-dot', style: { background: CLASES[p.clase].color } }), ` ${nombreJugada(p)} ${CLASES[p.clase].simbolo}`))));
      }
    }
  }
  const offs = [ctl.on('change', render), game.on('change', render), review.on('change', () => { if (ctl.vigente && ctl.analisis) chart.set(evalesDe(ctl.analisis), review.viewPly); }), match.on('state', render)];
  render();
  return { destroy: () => offs.forEach((f) => f()) };
}
