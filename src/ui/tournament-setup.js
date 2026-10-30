import { h } from './dom.js';
import { levelOptions } from './level-options.js';
import { createFeaturesEditor } from './features-editor.js';
import { randomName } from '../tournament/names.js';
import { DEFAULT_CONFIG as TORNEO_CONFIG } from '../tournament/tournament.js';
import { DEFAULT_CONFIG as LIGA_CONFIG } from '../league/league.js';

/**
 * Editor de participantes (nombre, motor, nivel) y de la configuración del torneo.
 * El orden de la lista es el orden de SEMILLAS (1 = mejor semilla: recibe byes y no se cruza pronto con la 2).
 */
export function createTournamentSetup(root, { engines, mode = 'torneo' }) {
  const liga = mode === 'liga';
  const DEFAULT_CONFIG = liga ? LIGA_CONFIG : TORNEO_CONFIG;
  const MAX = liga ? 12 : 16;
  const engineList = engines.listEngines();
  let rows = [];
  let locked = false;

  const list = h('div', { class: 'ts-list' });
  const countText = h('span', { class: 'muted small' });
  const nameInput = h('input', { type: 'text', value: liga ? 'Liga de motores' : 'Torneo de motores', 'aria-label': 'Nombre del torneo' });

  const cfgEls = {
    juegosPorCruce: h('select', {}, h('option', { value: 2 }, '2 (una pareja)'), h('option', { value: 4 }, '4 (dos parejas)')),
    maxParesDesempate: h('input', { type: 'number', min: 0, max: 6 }),
    maxJugadas: h('input', { type: 'number', min: 20, max: 600, step: 10 }),
    concurrencia: h('input', { type: 'number', min: 1, max: 12 }),
    usarLibreria: h('input', { type: 'checkbox' }),
    adjudicar: h('input', { type: 'checkbox' }),
  };
  function setConfig(cfg) {
    const c = { ...DEFAULT_CONFIG, ...cfg };
    cfgEls.juegosPorCruce.value = String(c.juegosPorCruce);
    cfgEls.maxParesDesempate.value = c.maxParesDesempate;
    cfgEls.maxJugadas.value = c.maxJugadas;
    cfgEls.concurrencia.value = c.concurrencia;
    cfgEls.usarLibreria.checked = !!c.usarLibreria;
    cfgEls.adjudicar.checked = !!c.adjudicar;
  }
  function getConfig() {
    const n = (el, d) => (Number.isFinite(+el.value) && el.value !== '' ? +el.value : d);
    return {
      ...(liga ? {} : { juegosPorCruce: n(cfgEls.juegosPorCruce, 2), maxParesDesempate: n(cfgEls.maxParesDesempate, 3) }),
      maxJugadas: n(cfgEls.maxJugadas, 250),
      concurrencia: n(cfgEls.concurrencia, 3),
      usarLibreria: cfgEls.usarLibreria.checked,
      adjudicar: cfgEls.adjudicar.checked,
    };
  }
  setConfig();

  const defaultRow = (nombre, motor = 'minimax', nivel = '3') => ({ nombre, motor, nivel, limites: null, opciones: null });

  function render() {
    list.replaceChildren();
    rows.forEach((row, i) => {
      const levels = engines.getEngineInfo(row.motor)?.levels ?? [];
      const engineSel = h('select', { 'aria-label': 'Motor' }, engineList.map((e) => h('option', { value: e.id }, e.name)));
      engineSel.value = row.motor;
      const levelSel = h('select', { 'aria-label': 'Nivel' },
        ...levelOptions(levels, [h('option', { value: 'custom' }, 'Personalizado…')]));
      levelSel.value = row.limites ? 'custom' : (row.nivel ?? levels[0]?.id);
      const depth = h('input', { type: 'number', min: 1, max: 20, value: row.limites?.depth ?? 5, title: 'Profundidad máxima' });
      const time = h('input', { type: 'number', min: 100, max: 60000, step: 100, value: row.limites?.time ?? 2000, title: 'Tiempo máximo (ms)' });
      const custom = h('span', { class: 'custom', hidden: !row.limites }, 'prof ', depth, ' ', time, ' ms');
      const name = h('input', { type: 'text', value: row.nombre, 'aria-label': `Nombre del participante ${i + 1}`, maxlength: 24 });

      name.addEventListener('input', () => { row.nombre = name.value; });
      engineSel.addEventListener('change', () => {
        row.motor = engineSel.value;
        row.nivel = engines.getEngineInfo(row.motor)?.levels[0]?.id ?? null;
        row.limites = null;
        row.opciones = row.motor === 'minimax2' ? (engines.getMinimax2Defaults?.() ?? null) : null;
        render();
      });
      const applyLevel = () => {
        if (levelSel.value === 'custom') { row.nivel = null; row.limites = { depth: +depth.value, time: +time.value, noise: 0 }; }
        else { row.nivel = levelSel.value; row.limites = null; }
        custom.hidden = !row.limites;
      };
      for (const el of [levelSel, depth, time]) el.addEventListener('change', applyLevel);

      const mini = (label, title, fn, disabled) => h('button', { class: 'mini', title, onClick: fn, disabled: disabled || locked }, label);
      list.append(h('div', { class: 'ts-row' },
        h('span', { class: 'seed' }, `#${i + 1}`), name, engineSel, levelSel, custom,
        mini('🎲', 'Nombre al azar', () => { row.nombre = randomName(rows.map((r) => r.nombre)); render(); }),
        mini('↑', 'Subir semilla', () => { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; render(); }, i === 0),
        mini('↓', 'Bajar semilla', () => { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; render(); }, i === rows.length - 1),
        mini('✕', 'Quitar', () => { rows.splice(i, 1); render(); }, rows.length <= 2)));
      if (row.motor === 'minimax2') {
        row.opciones ??= engines.getMinimax2Defaults?.() ?? null;
        list.lastChild.append(createFeaturesEditor({ features: row.opciones, disabled: locked, onChange: (f) => { row.opciones = f; } }));
      }
      for (const el of list.lastChild.querySelectorAll('input,select')) el.disabled = locked;
    });
    const k = rows.length;
    countText.textContent = liga
      ? `${k} participante(s) · ${k * (k - 1) / 2} cruces (${k * (k - 1)} partidas)`
      : `${k} participante(s) · cuadro de ${k <= 2 ? 2 : k <= 4 ? 4 : k <= 8 ? 8 : 16}`;
    addBtn.disabled = locked || rows.length >= MAX;
    exampleBtn.disabled = locked;
    for (const el of [nameInput, ...Object.values(cfgEls)]) el.disabled = locked;
  }

  const addBtn = h('button', { onClick: () => { rows.push(defaultRow(randomName(rows.map((r) => r.nombre)))); render(); } }, '+ Añadir participante');
  const exampleBtn = h('button', { onClick: () => {
    const names = [];
    const mk = (motor, nivel, limites = null) => { const n = randomName(names); names.push(n); return { nombre: n, motor, nivel, limites }; };
    const sf = engines.getEngineInfo('stockfish') ? ['1', '2', '3'] : [];
    rows = liga
      ? [mk('minimax', '5'), mk('minimax', '4'), mk('minimax', '3'), mk('minimax', '2'), ...sf.map((n) => mk('stockfish', n))]
      : [mk('minimax', '5'), mk('minimax', '4'), mk('minimax', '3'), mk('minimax', '2'), mk('minimax', '1'), mk('minimax', null, { depth: 3, time: 400, noise: 0 }), mk('random', '0'), mk('minimax', '3')];
    render();
  } }, liga ? 'Rellenar ejemplo' : 'Rellenar ejemplo (8)');

  rows = [defaultRow(randomName([]), 'random', '0'), defaultRow(randomName(['x']), 'minimax', '1'), defaultRow('Maestro Tortuga', 'minimax', '2'), defaultRow('Dragón Rojo', 'minimax', '3')];

  root.append(
    h('label', { class: 'row' }, 'Nombre ', nameInput),
    h('div', { class: 'muted small' }, liga ? 'Todos juegan contra todos. Para el Elo estimado incluye al menos un Stockfish con nivel por Elo (referencia).' : 'El orden es la semilla: #1 recibe los byes y no se cruza con #2 hasta la final.'),
    list,
    h('div', { class: 'btn-row' }, addBtn, exampleBtn, countText),
    h('h4', {}, 'Reglas'),
    h('div', { class: 'ts-cfg' },
      liga ? null : h('label', {}, 'Partidas por cruce ', cfgEls.juegosPorCruce),
      liga ? null : h('label', {}, 'Parejas de desempate (máx.) ', cfgEls.maxParesDesempate),
      h('label', {}, 'Tope de jugadas por partida ', cfgEls.maxJugadas),
      h('label', {}, 'Partidas simultáneas ', cfgEls.concurrencia),
      h('label', {}, cfgEls.usarLibreria, ' Aperturas de la librería'),
      h('label', {}, cfgEls.adjudicar, ' Adjudicar ventajas decisivas')),
    h('p', { class: 'muted small' }, liga ? 'Cada cruce son 2 partidas con colores cambiados y la misma apertura. El desempate de la tabla es: enfrentamiento directo, luego victorias, luego semilla.' : 'Cada cruce se juega por parejas de partidas con colores cambiados y la misma apertura. Si siguen empatados se juegan parejas extra; agotadas, avanza la mejor semilla.'));
  render();

  return {
    getName: () => nameInput.value.trim() || (liga ? 'Liga' : 'Torneo'),
    getParticipants: () => rows.map((r) => ({ nombre: r.nombre.trim() || 'Sin nombre', motor: r.motor, nivel: r.limites ? null : r.nivel, limites: r.limites, opciones: r.motor === 'minimax2' ? r.opciones : null })),
    getConfig,
    set({ nombre, participantes, config }) {
      if (nombre != null) nameInput.value = nombre;
      if (participantes) rows = participantes.map((p) => ({ nombre: p.nombre, motor: p.motor, nivel: p.nivel, limites: p.limites ?? null, opciones: p.opciones ?? null }));
      if (config) setConfig(config);
      render();
    },
    setLocked(v) { locked = v; render(); },
  };
}
