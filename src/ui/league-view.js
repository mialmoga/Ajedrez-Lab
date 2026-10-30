import { h } from './dom.js';
import { League } from '../league/league.js';
import { LeagueStore } from '../tournament/storage.js';
import { standings, crossTable } from '../league/standings.js';
import { fmtPoints } from '../tournament/bracket.js';
import { createTournamentSetup } from './tournament-setup.js';
import { createReplayViewer } from './replay-viewer.js';
import { downloadBlob } from '../exchange/png.js';
import { createWakeLock } from './wake-lock.js';

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'liga';
const RES_ICON = { '1-0': '1–0', '0-1': '0–1', '1/2-1/2': '½–½' };

/**
 * Vista de Liga (todos contra todos): participantes, tabla con Elo estimado, matriz de resultados,
 * detalle de cruce y visor de partidas. ctx = { engines, library, explainer, getTheme, openInMain }
 */
export function createLeagueView(root, ctx) {
  const { engines, library } = ctx;
  let L = null;
  let selected = null;
  let saveTimer = null;
  let renderTimer = null;

  const status = h('span', { class: 'tv-status' });
  const runBtn = h('button', { class: 'primary', onClick: () => toggleRun() }, 'Iniciar');
  const createBtn = h('button', { onClick: () => createLeague() }, 'Crear liga');
  const newBtn = h('button', { onClick: () => reset() }, 'Nueva');
  const exportBtn = h('button', { onClick: () => exportJson() }, 'Exportar JSON');
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  fileInput.addEventListener('change', async () => { const f = fileInput.files[0]; fileInput.value = ''; if (f) importJson(await f.text(), f.name); });
  const importBtn = h('button', { onClick: () => fileInput.click() }, 'Importar JSON…');
  const savedSel = h('select', { 'aria-label': 'Ligas guardadas' });
  const openSavedBtn = h('button', { onClick: () => { if (savedSel.value) open(savedSel.value); } }, 'Abrir');
  const delSavedBtn = h('button', { onClick: () => {
    if (!savedSel.value || !confirm('¿Borrar esta liga guardada en el navegador?')) return;
    LeagueStore.remove(savedSel.value);
    if (L?.data.id === savedSel.value) reset();
    refreshSaved();
  } }, 'Borrar');
  const msg = h('div', { class: 'muted small', role: 'status' });
  const warn = h('div', { class: 'muted small' }, '💾 El guardado automático vive en la memoria del navegador: si borras los datos del sitio se pierde. Usa Exportar JSON para conservar la liga.');

  const setupBox = h('div', { class: 'tv-col tv-setup' });
  const setup = createTournamentSetup(setupBox, { engines, mode: 'liga' });
  const tableBox = h('div', { class: 'lg-table' });
  const detail = h('div', { class: 'tv-detail' });
  const viewerBox = h('div', { class: 'tv-viewer' });
  const viewer = createReplayViewer(viewerBox, { theme: ctx.getTheme(), onOpenMain: (rec, ply) => ctx.openInMain(rec, ply), explainer: ctx.explainer, judge: ctx.judge });

  root.append(
    h('div', { class: 'tv-top' }, createBtn, runBtn, newBtn, exportBtn, importBtn, fileInput, savedSel, openSavedBtn, delSavedBtn, status),
    msg, warn,
    h('div', { class: 'tv-body' },
      h('div', { class: 'tv-col' }, h('h3', {}, 'Participantes y reglas'), setupBox),
      h('div', { class: 'tv-col tv-mid' }, h('h3', {}, 'Tabla y resultados'), tableBox, detail),
      h('div', { class: 'tv-col' }, h('h3', {}, 'Visor de partidas'), viewerBox)));

  const nameOf = (id) => L?.participant(id)?.nombre ?? '—';
  function say(text, bad = false) { msg.textContent = text; msg.className = bad ? 'warn small' : 'muted small'; }

  function refreshSaved() {
    const list = LeagueStore.list();
    savedSel.replaceChildren(h('option', { value: '' }, list.length ? '— ligas guardadas —' : '(sin ligas guardadas)'),
      ...list.map((x) => h('option', { value: x.id }, `${x.nombre} · ${x.estado} · ${new Date(x.actualizado).toLocaleString()}`)));
    if (L) savedSel.value = L.data.id;
  }

  function attach(newL) {
    if (L?.running) L.stop();
    L = newL;
    selected = null;
    L.on('update', scheduleRender);
    L.on('update', scheduleSave);
    L.on('progress', ({ key }) => { if (viewer.current()?.key === key) viewer.update(liveRecord(key)); });
    L.on('game-start', ({ key }) => { if (!viewer.current()) viewer.show(liveRecord(key)); });
    L.on('finished', () => say('🏁 ¡Liga terminada! Exporta el JSON si quieres conservarla.'));
    L.on('error', ({ message }) => say(`⚠ ${message}`, true));
    setup.set({ nombre: L.data.nombre, participantes: L.data.participantes, config: L.data.config });
    setup.setLocked(true);
    render();
  }

  function createLeague() {
    const parts = setup.getParticipants();
    const used = new Map();
    for (const p of parts) { const n = (used.get(p.nombre) ?? 0) + 1; used.set(p.nombre, n); if (n > 1) p.nombre = `${p.nombre} (${n})`; }
    try {
      attach(League.create({ engines, library }, { nombre: setup.getName(), participantes: parts, config: setup.getConfig() }));
      LeagueStore.save(L.toJSON());
      refreshSaved();
      say(L.anchors().size ? 'Liga creada. Pulsa Iniciar.' : 'Liga creada (sin Stockfish por Elo no habrá Elo estimado). Pulsa Iniciar.');
    } catch (err) { say(`⚠ ${err.message}`, true); }
  }
  function reset() {
    if (L?.running) L.stop();
    L = null; selected = null;
    setup.setLocked(false);
    viewer.clear();
    render();
    say('Edita los participantes y crea una liga nueva (la anterior queda guardada en el navegador).');
  }
  function toggleRun() {
    if (!L) return;
    if (L.running) { L.stop(); say('Pausando… las partidas en juego se reiniciarán al reanudar.'); return; }
    say(''); L.run();
  }
  function exportJson() {
    if (!L) return say('No hay liga que exportar.', true);
    downloadBlob(new Blob([JSON.stringify(L.toJSON(), null, 1)], { type: 'application/json' }), `liga-${slug(L.data.nombre)}.json`);
    say('Liga exportada. Impórtala cuando quieras para reproducirla o reanudarla.');
  }
  function importJson(text, name) {
    try { attach(League.fromJSON({ engines, library }, JSON.parse(text))); LeagueStore.save(L.toJSON()); refreshSaved(); say(`Liga "${L.data.nombre}" importada de ${name}.`); }
    catch (err) { say(`No se pudo importar ${name}: ${err.message}`, true); }
  }
  function open(id) {
    const data = LeagueStore.load(id);
    if (!data) return say('No se encontró esa liga.', true);
    try { attach(League.fromJSON({ engines, library }, data)); say(`Liga "${L.data.nombre}" abierta.`); }
    catch (err) { say(`⚠ ${err.message}`, true); }
  }

  function gameRecord(c, slot) {
    const g = c.pares[0]?.partidas[slot];
    if (!g) return null;
    return { key: `g:${c.id}:0:${slot}`, blancas: nameOf(g.blancas), negras: nameOf(g.negras), jugadas: g.jugadas, evals: g.evals, resultado: g.resultado, razon: g.razon, apertura: c.pares[0].apertura };
  }
  function liveRecord(key) {
    const l = L?.live.get(key);
    return l ? { key, vivo: true, blancas: nameOf(l.blancas), negras: nameOf(l.negras), jugadas: [...l.jugadas], evals: [...l.evals], apertura: l.apertura } : null;
  }

  const fmtElo = (e) => (!e ? '—' : e.ancla ? `${Math.round(e.elo)} (ref.)` : `~${Math.round(e.elo)} ± ${Math.round(e.err)}`);

  function renderTable() {
    tableBox.replaceChildren();
    if (!L) { tableBox.append(h('p', { class: 'muted pad' }, 'Crea una liga para ver la tabla.')); return; }
    const rows = standings(L.data.participantes, L.matches);
    const elo = L.eloEstimates();
    const par = L.data.participantes;
    const order = rows.map((r) => r.id);
    const ct = crossTable(par, L.matches);

    tableBox.append(h('table', { class: 'lg' },
      h('thead', {}, h('tr', {}, ['#', 'Participante', 'PJ', 'G', 'T', 'D', 'Pts', 'Elo estimado'].map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.map((r) => h('tr', {},
        h('td', {}, r.pos), h('td', { class: 'lg-name' }, nameOf(r.id)), h('td', {}, r.pj), h('td', {}, r.g), h('td', {}, r.t), h('td', {}, r.d),
        h('td', { class: 'lg-pts' }, fmtPoints(r.pts)), h('td', { class: 'muted' }, fmtElo(elo?.get(r.id))))))));
    if (!elo) tableBox.append(h('p', { class: 'muted small' }, 'Sin Elo estimado: añade al menos un Stockfish con nivel por Elo como referencia.'));
    else tableBox.append(h('p', { class: 'muted small' }, 'Elo estimado por máxima verosimilitud anclado en los niveles de Stockfish; el margen (±) es al 95 % y es amplio con pocas partidas. Valor de referencia, no un Elo oficial.'));

    // matriz de resultados (puntos de la fila contra la columna)
    const cruceDe = (a, b) => L.matches.find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a));
    tableBox.append(h('h4', {}, 'Matriz (puntos de la fila contra la columna)'),
      h('table', { class: 'lg lg-matrix' },
        h('thead', {}, h('tr', {}, h('th', {}), order.map((id) => h('th', { title: nameOf(id) }, nameOf(id).slice(0, 7))))),
        h('tbody', {}, order.map((a) => h('tr', {}, h('th', { class: 'lg-name' }, nameOf(a)),
          order.map((b) => {
            if (a === b) return h('td', { class: 'lg-self' }, '·');
            const c = cruceDe(a, b);
            const v = ct[a][b];
            return h('td', { class: `lg-cell${c?.id === selected ? ' sel' : ''}${c?.estado === 'en curso' ? ' live' : ''}`, onClick: () => { selected = c.id; renderDetail(); renderTable(); } }, v == null ? '' : fmtPoints(v));
          }))))));
  }

  function renderDetail() {
    detail.replaceChildren();
    const c = L?.matches.find((x) => x.id === selected);
    if (!c) { detail.append(h('p', { class: 'muted' }, 'Haz clic en una celda de la matriz para ver las partidas de ese cruce.')); return; }
    detail.append(h('h4', {}, `${nameOf(c.a)} vs ${nameOf(c.b)}`));
    const pair = c.pares[0];
    if (pair) detail.append(h('p', { class: 'muted small' }, `Apertura: ${pair.apertura.nombre} (${pair.apertura.jugadas.length} jugadas)`));
    const rows = h('div', { class: 'tv-games' });
    for (const slot of [0, 1]) {
      const [w, b] = slot === 0 ? [c.a, c.b] : [c.b, c.a];
      const label = h('span', {}, `⚪ ${nameOf(w)} vs ⚫ ${nameOf(b)}`);
      const g = pair?.partidas[slot];
      const lv = L.live.get(`${c.id}:0:${slot}`);
      if (g) rows.append(h('button', { class: 'tv-game', onClick: () => viewer.show(gameRecord(c, slot)) }, label, h('span', { class: 'tv-res' }, `${RES_ICON[g.resultado]} · ${g.razon} · ${g.jugadas.length} jug.`)));
      else if (lv) rows.append(h('button', { class: 'tv-game live', onClick: () => viewer.show(liveRecord(`${c.id}:0:${slot}`)) }, label, h('span', { class: 'tv-res' }, `● en juego · jugada ${lv.jugadas.length}`)));
      else rows.append(h('div', { class: 'tv-game pending' }, label, h('span', { class: 'tv-res muted' }, 'pendiente')));
    }
    detail.append(rows);
  }

  const wake = createWakeLock();
  function render() {
    renderTable();
    renderDetail();
    const running = !!L?.running;
    wake.set(running);
    const done = L?.matches.filter((c) => c.estado === 'terminado').length ?? 0;
    createBtn.disabled = !!L;
    runBtn.disabled = !L || L.data.estado === 'terminado';
    runBtn.textContent = running ? 'Pausar' : (L?.data.estado === 'pausado' || L?.matches.some((c) => c.pares.length)) ? 'Reanudar' : 'Iniciar';
    exportBtn.disabled = !L;
    if (!L) status.textContent = '';
    else if (L.data.estado === 'terminado') status.textContent = '🏁 Liga terminada';
    else status.textContent = `${running ? 'En curso' : L.data.estado === 'pausado' ? 'En pausa' : 'Listo'} · ${done}/${L.matches.length} cruces`;
  }
  function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(render, 120); }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!L) return;
      if (!LeagueStore.save(L.toJSON())) say('⚠ No cupo en el almacenamiento del navegador: usa Exportar JSON para no perder la liga.', true);
      refreshSaved();
    }, 600);
  }

  refreshSaved();
  const lastId = LeagueStore.lastId();
  if (lastId && LeagueStore.load(lastId)) open(lastId); else render();

  return {
    onShow() { render(); },
    setTheme(th) { viewer.setTheme(th); },
    destroy() { if (L?.running) L.stop(); wake.set(false); viewer.destroy(); },
  };
}
