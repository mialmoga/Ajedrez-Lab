import { h, fmtEval, evalFraction } from './dom.js';
import { reyIcon } from './icons.js';
import { createFeaturesEditor } from './features-editor.js';
import { levelOptions } from './level-options.js';

/** Panel de partida: jugadores (humano/motor + nivel), controles y estado del motor. */
export function createGamePanel(root, ctx) {
  const { game, match, engines, boardCtl, modo } = ctx;
  const engineList = engines.listEngines();

  function playerRow(color) {
    const label = color === 'w' ? 'Blancas' : 'Negras';
    const kind = h('select', { 'aria-label': `Jugador ${label}` },
      h('option', { value: 'human' }, 'Humano'),
      engineList.map((e) => h('option', { value: e.id }, e.name)));
    const level = h('select', { 'aria-label': `Nivel ${label}` });
    const depth = h('input', { type: 'number', min: 1, max: 20, value: 5, title: 'Profundidad máxima' });
    const time = h('input', { type: 'number', min: 100, max: 60000, step: 100, value: 2000, title: 'Tiempo máximo (ms)' });
    const custom = h('span', { class: 'custom' }, 'prof ', depth, ' tiempo ', time, ' ms');

    let featState = engines.getMinimax2Defaults?.() ?? null;
    const feats = h('div', { class: 'feat-wrap' });
    function drawFeats() {
      feats.replaceChildren();
      if (kind.value === 'minimax2' && featState) feats.append(createFeaturesEditor({ features: featState, onChange: (f) => { featState = f; apply(); } }));
    }
    function fillLevels(engineId) {
      level.replaceChildren(
        ...levelOptions(engines.getEngineInfo(engineId)?.levels ?? []),
        h('option', { value: 'custom' }, 'Personalizado…'));
    }
    function apply() {
      if (kind.value === 'human') {
        level.hidden = true; custom.hidden = true;
        match.setPlayer(color, { kind: 'human' });
        return;
      }
      level.hidden = false;
      custom.hidden = level.value !== 'custom';
      match.setPlayer(color, {
        kind: 'engine',
        engineId: kind.value,
        levelId: level.value,
        features: kind.value === 'minimax2' ? featState : null,
        custom: level.value === 'custom' ? { depth: +depth.value, time: +time.value, noise: 0 } : null,
      });
    }
    kind.addEventListener('change', () => { if (kind.value !== 'human') fillLevels(kind.value); drawFeats(); apply(); });
    for (const el of [level, depth, time]) el.addEventListener('change', apply);

    const p = match.players[color];
    kind.value = p.kind === 'human' ? 'human' : p.engineId;
    if (p.kind === 'engine') fillLevels(p.engineId); else fillLevels(engineList[0]?.id);
    level.value = p.levelId ?? level.options[0]?.value;
    level.hidden = p.kind === 'human';
    custom.hidden = true;
    drawFeats();
    return h('div', { class: 'player-row' }, h('b', {}, reyIcon(color), ` ${label}`), kind, level, custom, feats);
  }

  // modo de la partida: Prueba (sin ayudas) o Práctica (con 💡 y marcas); bloqueado desde la primera jugada
  const modoSel = h('select', { 'aria-label': 'Modo de la partida' },
    h('option', { value: 'prueba' }, 'Prueba · sin ayudas'),
    h('option', { value: 'practica' }, 'Práctica · con ayudas'));
  const modoNote = h('span', { class: 'muted small' });
  modoSel.addEventListener('change', () => { if (!modo.set(modoSel.value)) modoSel.value = modo.value; });
  function refreshModo() {
    if (!modo) return;
    modoSel.value = modo.value;
    modoSel.disabled = modo.locked;
    modoNote.textContent = modo.locked ? '🔒 fijado mientras dure la partida; «Nueva partida» lo reabre' : 'se elige antes de la primera jugada';
  }

  const status = h('div', { class: 'status' });
  const info = h('div', { class: 'engine-info muted' });
  const evalFill = h('div', { class: 'eval-fill' });
  const evalBar = h('div', { class: 'eval-bar', title: 'Evaluación (blancas arriba)' }, evalFill);

  const pauseBtn = h('button', { onClick: () => match.setRunning(!match.running) }, 'Pausar');
  const delay = h('input', { type: 'range', min: 0, max: 2500, step: 100, value: match.moveDelay });
  delay.addEventListener('input', () => { match.moveDelay = +delay.value; delayLabel.textContent = `${delay.value} ms`; });
  const delayLabel = h('span', { class: 'muted' }, `${match.moveDelay} ms`);

  function undo() {
    game.undo();
    // contra el motor: deshacer también su respuesta para volver a tu turno
    const humanPlays = ['w', 'b'].some((c) => match.players[c].kind === 'human');
    if (humanPlays && match.isEngineTurn() && game.ply > 0) game.undo();
  }

  root.append(
    h('div', { class: 'players' }, playerRow('w'), playerRow('b')),
    ...(modo ? [h('div', { class: 'row modo-row' }, h('b', {}, 'Modo '), modoSel, modoNote)] : []),
    h('div', { class: 'btn-row' },
      h('button', { onClick: () => game.reset() }, 'Nueva partida'),
      h('button', { onClick: undo }, 'Deshacer'),
      h('button', { onClick: () => boardCtl.flip() }, 'Voltear'),
      pauseBtn),
    h('label', { class: 'row' }, 'Pausa entre jugadas del motor ', delay, delayLabel),
    h('div', { class: 'eval-wrap' }, evalBar, h('div', {}, status, info)));

  function refreshStatus() {
    const st = game.status();
    if (st.over) {
      status.textContent = st.winner ? `Jaque mate — ganan ${st.winner === 'w' ? 'las blancas' : 'las negras'}` : `Tablas — ${st.reason}`;
      return;
    }
    const side = game.turn === 'w' ? 'Blancas' : 'Negras';
    const p = match.players[game.turn];
    const who = p.kind === 'human' ? 'humano' : engines.getEngineInfo(p.engineId)?.name;
    status.textContent = match.thinking
      ? `${side} (${who}) pensando…`
      : `Turno: ${side} (${who})${game.inCheck ? ' — jaque' : ''}${!match.running && match.isEngineTurn() ? ' — en pausa' : ''}`;
  }

  const off = [
    game.on('change', () => { refreshStatus(); if (game.ply === 0) { info.textContent = ''; evalFill.style.height = '50%'; } }),
    match.on('thinking', refreshStatus),
    match.on('state', ({ running }) => { pauseBtn.textContent = running ? 'Pausar' : 'Reanudar'; refreshStatus(); }),
    match.on('info', ({ color, info: i }) => {
      const nodes = i.nodes > 1000 ? `${Math.round(i.nodes / 1000)}k` : i.nodes;
      info.replaceChildren(reyIcon(color), ` prof ${i.depth} · ${fmtEval(i)} · ${nodes} nodos · ${i.pv?.slice(0, 5).join(' ') ?? ''}`);
      evalFill.style.height = `${evalFraction(i) * 100}%`;
    }),
    match.on('engine-move', ({ book }) => { if (book) info.textContent = 'Jugada de la librería (libro de aperturas)'; }),
    match.on('error', ({ message }) => { info.textContent = `⚠ ${message}`; }),
  ];
  if (modo) off.push(modo.on('change', refreshModo));
  refreshModo();
  refreshStatus();
  evalFill.style.height = '50%';
  return { destroy: () => off.forEach((f) => f()) };
}
