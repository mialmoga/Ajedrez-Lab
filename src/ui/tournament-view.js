import { h } from './dom.js';
import { Tournament } from '../tournament/tournament.js';
import { TournamentStore } from '../tournament/storage.js';
import { BYE, fmtPoints } from '../tournament/bracket.js';
import { createTournamentSetup } from './tournament-setup.js';
import { createBracketView } from './bracket-view.js';
import { createReplayViewer } from './replay-viewer.js';
import { downloadBlob } from '../exchange/png.js';
import { createWakeLock } from './wake-lock.js';

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'torneo';
const BY_TEXT = { puntos: 'por puntos', desempate: 'en desempate', semilla: 'por semilla (empate persistente)', bye: 'pasa por BYE' };
const RES_ICON = { '1-0': '1–0', '0-1': '0–1', '1/2-1/2': '½–½' };

/**
 * Vista de Torneo: editor de participantes, cuadro de eliminatoria, detalle de cruces y visor de partidas.
 * ctx = { engines, library, getTheme, openInMain(record, ply) }
 */
export function createTournamentView(root, ctx) {
  const { engines, library } = ctx;
  let t = null;
  let selectedMatch = null;
  let saveTimer = null;
  let renderTimer = null;

  // --- barra superior ---
  const status = h('span', { class: 'tv-status' });
  const runBtn = h('button', { class: 'primary', onClick: () => toggleRun() }, 'Iniciar');
  const createBtn = h('button', { onClick: () => createTournament() }, 'Crear torneo');
  const newBtn = h('button', { onClick: () => reset() }, 'Nuevo');
  const exportBtn = h('button', { onClick: () => exportJson() }, 'Exportar JSON');
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    fileInput.value = '';
    if (f) importJson(await f.text(), f.name);
  });
  const importBtn = h('button', { onClick: () => fileInput.click() }, 'Importar JSON…');
  const savedSel = h('select', { 'aria-label': 'Torneos guardados' });
  const openSavedBtn = h('button', { onClick: () => { if (savedSel.value) open(savedSel.value); } }, 'Abrir');
  const delSavedBtn = h('button', { onClick: () => {
    if (!savedSel.value || !confirm('¿Borrar este torneo guardado en el navegador?')) return;
    TournamentStore.remove(savedSel.value);
    if (t?.data.id === savedSel.value) reset();
    refreshSaved();
  } }, 'Borrar');
  const msg = h('div', { class: 'muted small', role: 'status' });

  // --- columnas ---
  const setupBox = h('div', { class: 'tv-col tv-setup' });
  const setup = createTournamentSetup(setupBox, { engines });
  const bracketBox = h('div', { class: 'tv-bracket' });
  const detail = h('div', { class: 'tv-detail' });
  const viewerBox = h('div', { class: 'tv-viewer' });

  const bracket = createBracketView(bracketBox, { onSelect: (id) => { selectedMatch = id; renderDetail(); } });
  const viewer = createReplayViewer(viewerBox, { theme: ctx.getTheme(), onOpenMain: (rec, ply) => ctx.openInMain(rec, ply), explainer: ctx.explainer, judge: ctx.judge });

  root.append(
    h('div', { class: 'tv-top' }, createBtn, runBtn, newBtn, exportBtn, importBtn, fileInput, savedSel, openSavedBtn, delSavedBtn, status),
    msg,
    h('div', { class: 'tv-body' },
      h('div', { class: 'tv-col' }, h('h3', {}, 'Participantes y reglas'), setupBox),
      h('div', { class: 'tv-col tv-mid' }, h('h3', {}, 'Cuadro'), bracketBox, detail),
      h('div', { class: 'tv-col' }, h('h3', {}, 'Visor de partidas'), viewerBox)));

  // --- helpers ---
  const nameOf = (id) => (id === BYE ? 'BYE' : t?.participant(id)?.nombre ?? '—');
  function say(text, bad = false) { msg.textContent = text; msg.className = bad ? 'warn small' : 'muted small'; }

  function refreshSaved() {
    const list = TournamentStore.list();
    savedSel.replaceChildren(h('option', { value: '' }, list.length ? '— torneos guardados —' : '(sin torneos guardados)'),
      ...list.map((x) => h('option', { value: x.id }, `${x.nombre} · ${x.estado} · ${new Date(x.actualizado).toLocaleString()}`)));
    if (t) savedSel.value = t.data.id;
  }

  function attach(newT) {
    if (t?.running) t.stop();
    t = newT;
    selectedMatch = null;
    for (const ev of ['update']) t.on(ev, scheduleRender);
    t.on('update', scheduleSave);
    t.on('progress', ({ key }) => {
      const cur = viewer.current();
      if (cur?.key === key) viewer.update(liveRecord(key));
    });
    t.on('game-start', ({ key }) => { if (!viewer.current()) viewer.show(liveRecord(key)); });
    t.on('finished', ({ campeon }) => say(`🏆 ¡${nameOf(campeon)} es el campeón!`));
    t.on('error', ({ message }) => say(`⚠ ${message}`, true));
    setup.set({ nombre: t.data.nombre, participantes: t.data.participantes, config: t.data.config });
    setup.setLocked(true);
    render();
  }

  function createTournament() {
    const parts = setup.getParticipants();
    const used = new Map();
    for (const p of parts) {
      const n = (used.get(p.nombre) ?? 0) + 1;
      used.set(p.nombre, n);
      if (n > 1) p.nombre = `${p.nombre} (${n})`;
    }
    try {
      attach(Tournament.create({ engines, library }, { nombre: setup.getName(), participantes: parts, config: setup.getConfig() }));
      TournamentStore.save(t.toJSON());
      refreshSaved();
      say('Torneo creado. Pulsa Iniciar para empezar.');
    } catch (err) {
      say(`⚠ ${err.message}`, true);
    }
  }

  function reset() {
    if (t?.running) t.stop();
    t = null;
    selectedMatch = null;
    setup.setLocked(false);
    viewer.clear();
    render();
    say('Edita los participantes y crea un torneo nuevo (el anterior queda guardado en el navegador).');
  }

  function toggleRun() {
    if (!t) return;
    if (t.running) { t.stop(); say('Pausando… las partidas en juego se reiniciarán al reanudar.'); return; }
    say('');
    t.run();
  }

  function exportJson() {
    if (!t) return say('No hay torneo que exportar.', true);
    downloadBlob(new Blob([JSON.stringify(t.toJSON(), null, 1)], { type: 'application/json' }), `torneo-${slug(t.data.nombre)}.json`);
    say('Torneo exportado. Impórtalo cuando quieras para reproducirlo o reanudarlo.');
  }

  function importJson(text, name) {
    try {
      attach(Tournament.fromJSON({ engines, library }, JSON.parse(text)));
      TournamentStore.save(t.toJSON());
      refreshSaved();
      say(`Torneo "${t.data.nombre}" importado de ${name}.`);
    } catch (err) {
      say(`No se pudo importar ${name}: ${err.message}`, true);
    }
  }

  function open(id) {
    const data = TournamentStore.load(id);
    if (!data) return say('No se encontró ese torneo.', true);
    try { attach(Tournament.fromJSON({ engines, library }, data)); say(`Torneo "${t.data.nombre}" abierto.`); }
    catch (err) { say(`⚠ ${err.message}`, true); }
  }

  // --- registros para el visor ---
  function gameRecord(m, pairIdx, slot) {
    const pair = m.pares[pairIdx];
    const g = pair?.partidas[slot];
    if (!g) return null;
    return { key: `g:${m.id}:${pairIdx}:${slot}`, blancas: nameOf(g.blancas), negras: nameOf(g.negras), jugadas: g.jugadas, evals: g.evals, resultado: g.resultado, razon: g.razon, apertura: pair.apertura };
  }
  function liveRecord(key) {
    const l = t?.live.get(key);
    if (!l) return null;
    return { key, vivo: true, blancas: nameOf(l.blancas), negras: nameOf(l.negras), jugadas: [...l.jugadas], evals: [...l.evals], apertura: l.apertura };
  }

  // --- detalle del cruce seleccionado ---
  function renderDetail() {
    detail.replaceChildren();
    const m = t?.matches.find((x) => x.id === selectedMatch);
    if (!m) { detail.append(h('p', { class: 'muted' }, 'Haz clic en un cruce del cuadro para ver sus partidas.')); return; }
    const head = `${nameOf(m.a)} vs ${nameOf(m.b)}`;
    detail.append(h('h4', {}, head));
    if (m.bye) return detail.append(h('p', { class: 'muted' }, `${nameOf(m.ganador)} pasa de ronda sin jugar (BYE).`));
    const score = m.pares.length ? ` · marcador ${fmtPoints(m.puntos.a)}–${fmtPoints(m.puntos.b)}` : '';
    detail.append(h('p', { class: 'muted' }, m.estado === 'terminado' ? `Ganó ${nameOf(m.ganador)} ${BY_TEXT[m.decidido] ?? ''}${score}` : `${m.estado}${score}`));

    const rows = h('div', { class: 'tv-games' });
    m.pares.forEach((pair, pi) => {
      for (const slot of [0, 1]) {
        const g = pair.partidas[slot];
        const liveKey = `${m.id}:${pi}:${slot}`;
        const lv = t.live.get(liveKey);
        const [w, b] = slot === 0 ? [m.a, m.b] : [m.b, m.a];
        const label = h('span', {}, `Pareja ${pi + 1} · `, `⚪ ${nameOf(w)} vs ⚫ ${nameOf(b)}`);
        if (g) {
          rows.append(h('button', { class: 'tv-game', onClick: () => viewer.show(gameRecord(m, pi, slot)) },
            label, h('span', { class: 'tv-res' }, `${RES_ICON[g.resultado]} · ${g.razon} · ${g.jugadas.length} jug.`)));
        } else if (lv) {
          rows.append(h('button', { class: 'tv-game live', onClick: () => viewer.show(liveRecord(liveKey)) },
            label, h('span', { class: 'tv-res' }, `● en juego · jugada ${lv.jugadas.length}`)));
        } else {
          rows.append(h('div', { class: 'tv-game pending' }, label, h('span', { class: 'tv-res muted' }, 'pendiente')));
        }
      }
      rows.append(h('div', { class: 'muted small tv-open' }, `Apertura de la pareja ${pi + 1}: ${pair.apertura.nombre} (${pair.apertura.jugadas.length} jugadas)`));
    });
    detail.append(rows);
  }

  // --- render general ---
  const wake = createWakeLock();
  function render() {
    bracket.render(t);
    if (selectedMatch) bracket.select(selectedMatch);
    renderDetail();
    const running = !!t?.running;
    wake.set(running);
    createBtn.disabled = !!t;
    runBtn.disabled = !t || t.data.estado === 'terminado';
    runBtn.textContent = running ? 'Pausar' : t?.data.estado === 'pausado' || t?.matches.some((m) => m.pares.length) ? 'Reanudar' : 'Iniciar';
    exportBtn.disabled = !t;
    if (!t) status.textContent = '';
    else if (t.data.estado === 'terminado') status.textContent = `🏆 Campeón: ${nameOf(t.data.campeon)}`;
    else if (running) status.textContent = `En curso · ${t.live.size} partida(s) en juego`;
    else status.textContent = t.data.estado === 'pausado' ? 'En pausa' : 'Listo para empezar';
  }
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 80);
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!t) return;
      if (!TournamentStore.save(t.toJSON())) say('⚠ No cupo en el almacenamiento del navegador: usa Exportar JSON para no perder el torneo.', true);
      refreshSaved();
    }, 600);
  }

  // --- arranque: reabrir el último torneo guardado (sin ejecutarlo) ---
  refreshSaved();
  const lastId = TournamentStore.lastId();
  if (lastId && TournamentStore.load(lastId)) open(lastId); else render();

  return {
    onShow() { render(); },
    setTheme(th) { viewer.setTheme(th); },
    destroy() { if (t?.running) t.stop(); wake.set(false); viewer.destroy(); bracket.destroy(); },
  };
}
