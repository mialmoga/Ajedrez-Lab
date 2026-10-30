import { h } from './dom.js';
import { downloadBlob } from '../exchange/png.js';
import { describirJugadores } from './jugadores.js';
import { crearPartida, toPGN, leerPartida, nombreArchivo } from '../exchange/partida.js';
import { CLASES } from '../analysis/analisis.js';

const MARCADAS = new Set(['brillante', 'imprecision', 'error', 'error_grave']); // las demás clases no ensucian la lista

/** Descarga una partida (objeto de crearPartida) como 'json' o 'pgn'. */
export function descargarPartida(partida, formato) {
  if (formato === 'pgn') downloadBlob(new Blob([toPGN(partida)], { type: 'application/x-chess-pgn' }), nombreArchivo(partida, 'pgn'));
  else downloadBlob(new Blob([JSON.stringify(partida, null, 1)], { type: 'application/json' }), nombreArchivo(partida, 'json'));
}

/** Botones "Exportar JSON / PGN" para una fuente de partida (`get()` devuelve el objeto o null). */
export function exportButtons(get, say = () => {}) {
  const go = (fmt) => () => { const p = get(); if (!p || !p.jugadas.length) return say('Aún no hay jugadas que exportar.', true); descargarPartida(p, fmt); say(`Partida exportada (${fmt.toUpperCase()}).`); };
  return [h('button', { onClick: go('json'), title: 'Partida completa en JSON de Ajedrez Lab' }, 'Exportar JSON'), h('button', { onClick: go('pgn'), title: 'PGN estándar, se abre en cualquier programa de ajedrez' }, 'Exportar PGN')];
}

/**
 * Lista de jugadas en pares (1. e4 e5): clicable, con navegación (⏮ ◀ ▶ ⏭), modo revisión,
 * y exportar / importar la partida.
 */
export function createMovesPanel(root, { game, match, engines, review, rechazos, modo, analisisCtl, cine }) {
  const list = h('div', { class: 'moves' });
  const banner = h('div', { class: 'review-banner', hidden: true });
  const msg = h('div', { class: 'muted small', role: 'status' });
  const say = (t, bad = false) => { msg.textContent = t; msg.className = bad ? 'warn small' : 'muted small'; };

  const nav = (label, title, fn) => h('button', { title, onClick: fn }, label);
  const navRow = h('div', { class: 'btn-row nav-row' },
    nav('⏮', 'Inicio (Inicio)', () => review.goto(0)),
    nav('◀', 'Jugada anterior (←)', () => review.goto(review.viewPly - 1)),
    nav('▶', 'Jugada siguiente (→)', () => review.goto(review.viewPly + 1)),
    nav('⏭', 'Final (Fin)', () => (review.active ? review.exit() : null)),
    ...(cine ? [h('button', { class: 'cine-abrir', title: 'Ver la partida como una película: pantalla completa, subtítulos y cámara', onClick: () => cine.abrir() }, '🎬 Cine')] : []));

  const backBtn = h('button', { onClick: () => review.exit() }, 'Volver a la actual');
  const contBtn = h('button', { onClick: () => {
    const quitar = game.ply - review.ply;
    if (quitar > 0 && !confirm(`Se descartan las ${quitar} jugadas posteriores y la partida sigue desde aquí, en pausa. ¿Continuar?`)) return;
    review.continueHere();
    modo?.forzar('practica'); // seguir desde un replay es para practicar: con ayudas
    say('Partida cortada, en modo Práctica: pulsa Reanudar para seguir.');
  } }, 'Continuar desde aquí');
  banner.append(h('span', { class: 'review-text' }), h('div', { class: 'btn-row' }, backBtn, contBtn));

  // --- partida actual → objeto exportable ---
  const current = () => crearPartida({
    jugadas: game.uciHistory, inicio: game.startFen, ...describirJugadores(match, engines),
    ...(game.status().over ? { razon: game.status().reason } : {}),
    ...(rechazos?.n ? { rechazos: rechazos.n } : {}),
    ...(modo && game.ply > 0 ? { modo: modo.value } : {}),
    ...(analisisCtl?.vigente ? { analisis: analisisCtl.analisis } : {}),
  });

  const fileInput = h('input', { type: 'file', accept: '.json,.pgn,.txt,application/json', hidden: true });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    fileInput.value = '';
    if (!f) return;
    try {
      const p = leerPartida(await f.text());
      if (game.ply > 0 && !confirm('Esto reemplaza la partida actual. ¿Continuar?')) return;
      match.setRunning(false);
      game.loadMoves(p.jugadas, p.inicio);
      const conAnalisis = analisisCtl?.cargarSiCoincide(p.analisis);
      review.enter(0);
      say(`Importada: ${p.blancas} vs ${p.negras} · ${p.jugadas.length} jugadas${p.resultado && p.resultado !== '*' ? ` · ${p.resultado}` : ''}. Usa ◀ ▶ para recorrerla.${conAnalisis ? ' Trae su análisis.' : ''}${p.aviso ? ` ⚠ ${p.aviso}` : ''}`, !!p.aviso);
    } catch (err) { say(`No se pudo importar: ${err.message}`, true); }
  });

  root.append(navRow, banner, list,
    h('div', { class: 'btn-row' }, ...exportButtons(current, say), h('button', { onClick: () => fileInput.click(), title: 'JSON de Ajedrez Lab o PGN (variantes y comentarios se ignoran)' }, 'Importar partida…'), fileInput),
    msg);

  function render() {
    list.replaceChildren();
    const viewPly = review.viewPly;
    navRow.children[0].disabled = navRow.children[1].disabled = viewPly <= 0;
    navRow.children[2].disabled = viewPly >= game.ply;
    navRow.children[3].disabled = !review.active;
    if (cine) navRow.querySelector('.cine-abrir').disabled = !game.ply;
    banner.hidden = !review.active;
    if (review.active) {
      banner.querySelector('.review-text').textContent = `👁 Revisando · jugada ${review.ply} de ${game.ply} (tablero de solo lectura)`;
      contBtn.disabled = false;
    }
    if (!game.moves.length) { list.append(h('span', { class: 'muted' }, 'Aún no hay jugadas.')); return; }
    const first = game.moves[0].color === 'b';
    const startNum = Number(game.startFen.split(' ')[5]) || 1;
    let current = null;
    game.moves.forEach((m, i) => {
      const moveNo = startNum + Math.floor((i + (first ? 1 : 0)) / 2);
      if (m.color === 'w') list.append(h('span', { class: 'no' }, `${moveNo}.`));
      else if (i === 0) list.append(h('span', { class: 'no' }, `${moveNo}…`));
      const here = i + 1 === viewPly;
      const rc = analisisCtl?.claseDe(i);
      const marca = rc && MARCADAS.has(rc.clase) ? CLASES[rc.clase] : null;
      const el = h('span', { class: `mv go${here ? ' last' : ''}`, title: marca ? `${marca.etiqueta}${rc.perdida >= 50 ? ` · pierde ~${(rc.perdida / 100).toFixed(1)}` : ''}` : 'Ver esta posición', onClick: () => review.goto(i + 1) },
        m.san, marca ? h('span', { class: 'cls-mark', style: { color: marca.color } }, marca.simbolo) : null);
      if (here) current = el;
      list.append(el);
    });
    if (review.active && current) current.scrollIntoView?.({ block: 'nearest' });
    else list.scrollTop = list.scrollHeight;
  }
  let firma = '';
  const offs = [game.on('change', render), review.on('change', render), ...(analisisCtl ? [analisisCtl.on('change', (e) => { const f = `${e.estado}|${e.vigente}`; if (f !== firma) { firma = f; render(); } })] : [])];
  render();
  return { destroy: () => offs.forEach((f) => f()) };
}
