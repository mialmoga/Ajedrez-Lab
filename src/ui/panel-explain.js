import { h } from './dom.js';
import { levelOptions } from './level-options.js';
import { createAyudas } from './ayudas.js';
import { CLASES, detalleDeClase } from '../analysis/analisis.js';

const KEY = 'ajedrez-lab:juez';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
const save = (cfg) => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* sin almacenamiento */ } };

/** Restaura la configuración guardada del juez (llamar una vez al arrancar). */
export function restoreJudgeConfig(judge) {
  const c = load();
  judge.setConfig({ enabled: c.enabled ?? true, engineId: c.engineId && judge.options().some((o) => o.id === c.engineId) ? c.engineId : null, levelId: c.levelId ?? null });
}

/** Panel de explicación: qué hace la última jugada (librería > reglas) + veredicto del juez (motor) elegible. */
export function createExplainPanel(root, ctx) {
  const { game, explainer, judge, review } = ctx;
  const box = h('div', { class: 'explain' });

  // --- controles del juez ---
  const enabled = h('input', { type: 'checkbox' });
  const engineSel = h('select', { 'aria-label': 'Juez' });
  const levelSel = h('select', { 'aria-label': 'Nivel del juez' });
  const hint = h('div', { class: 'muted small' });
  const persist = () => save({ enabled: judge.config.enabled, engineId: judge.config.engineId, levelId: judge.config.levelId });

  function fillJudge() {
    const cfg = judge.config;
    enabled.checked = !!cfg.enabled;
    engineSel.replaceChildren(...judge.options().map((e) => h('option', { value: e.id }, e.name)));
    engineSel.value = cfg.engineId;
    const levels = ctx.engines.getEngineInfo(cfg.engineId)?.levels ?? [];
    levelSel.replaceChildren(...levelOptions(levels));
    levelSel.value = cfg.levelId;
    levelSel.hidden = levels.length < 2;
    for (const el of [engineSel, levelSel]) el.disabled = !cfg.enabled;
    hint.textContent = !cfg.enabled ? '' : judge.weak ? '⚠ Juez débil: sus veredictos son poco fiables (elige un nivel más alto).' : '';
  }
  enabled.addEventListener('change', () => { judge.setConfig({ enabled: enabled.checked }); persist(); fillJudge(); render(); });
  engineSel.addEventListener('change', () => { judge.setConfig({ engineId: engineSel.value, levelId: null }); persist(); fillJudge(); render(); });
  levelSel.addEventListener('change', () => { judge.setConfig({ levelId: levelSel.value }); persist(); fillJudge(); render(); });

  const ayudas = ctx.modo ? createAyudas(ctx) : null;
  root.append(box, ...(ayudas ? [ayudas.el] : []),
    h('div', { class: 'row judge-row' }, h('label', {}, enabled, ' Análisis con motor · juez '), engineSel, levelSel), hint,
    h('div', { class: 'muted small', title: 'Los veredictos del juez miden la ventaja en «peones»' }, 'Escala del juez: 1 punto de ventaja ≈ el valor de un peón (aunque ya no queden peones en el tablero).'));
  fillJudge();

  let token = 0;
  function render() {
    const my = ++token;
    box.replaceChildren();
    const vp = review ? review.viewPly : game.ply; // jugada mostrada (en revisión, la que miras)
    const last = vp > 0 ? game.moves[vp - 1] : null;
    if (!last) { box.append(h('span', { class: 'muted' }, 'Juega una jugada y aquí aparece qué hace.')); return; }
    const k = vp - 1;
    const num = Math.floor((k + (game.moves[0].color === 'b' ? 1 : 0)) / 2) + 1;
    const head = `${num}${last.color === 'w' ? '.' : '…'} ${last.san}`;
    let res = null;
    try { res = explainer.explainPly(game.startFen, game.uciHistory, k); } catch { /* posición rara: sin explicación */ }
    box.append(h('b', {}, head));
    const rc = ctx.analisisCtl?.claseDe(k); // clasificación del análisis de la partida (si se hizo)
    if (rc?.clase) {
      const c = CLASES[rc.clase];
      const det = detalleDeClase(rc, game.fens[k]);
      box.append(h('div', { class: 'clase-linea', style: { borderLeftColor: c.color } }, h('b', { style: { color: c.color } }, `${c.simbolo} ${c.etiqueta}`), det));
    }
    if (res) box.append(h('span', { class: 'tag' }, res.fuente), h('div', { class: 'note' }, res.texto));
    else box.append(h('div', { class: 'muted' }, 'Sin nada especial que señalar con las reglas.'));

    if (!judge.config.enabled) return;
    const pending = h('div', { class: 'muted small' }, '⏳ el juez está analizando…');
    box.append(pending);
    const ucis = game.uciHistory, start = game.startFen;
    explainer.judgePly(judge, start, ucis, k).then((v) => {
      if (my !== token) return; // la partida cambió mientras tanto
      pending.remove();
      if (v) box.append(h('span', { class: 'tag' }, `juez: ${judge.shortName}`), h('div', { class: 'note judge' }, v.texto));
    }).catch(() => { if (my === token) pending.remove(); });
  }
  let firma = '';
  const offs = [game.on('change', render), review?.on('change', render), ctx.analisisCtl?.on('change', (e) => { const f = `${e.estado}|${e.vigente}`; if (f !== firma) { firma = f; render(); } })].filter(Boolean);
  render();
  return { destroy: () => { offs.forEach((f) => f()); ayudas?.destroy(); judge.dispose(); }, refresh: render };
}
