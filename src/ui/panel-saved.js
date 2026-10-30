import { h } from './dom.js';
import { descargarPartida } from './panel-moves.js';

const fecha = (iso) => { try { return new Date(iso).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

/** Partidas guardadas automáticamente: las últimas terminadas o abandonadas, para reabrirlas en revisión. */
export function createSavedPanel(root, { autosave, game, match, review, analisisCtl }) {
  const note = h('div', { class: 'muted small', role: 'status' });
  const list = h('div', { class: 'saved-list' });
  const clearBtn = h('button', { onClick: () => { if (confirm('¿Borrar todas las partidas guardadas?')) autosave.clear(); } }, 'Borrar todas');
  root.append(h('p', { class: 'muted small' }, 'La partida actual se guarda sola (también al pausar). Aquí quedan las últimas 10 terminadas o abandonadas.'), note, list, h('div', { class: 'btn-row' }, clearBtn));

  function open(e) {
    match.setRunning(false);
    game.loadMoves(e.jugadas, e.inicio);
    const conAnalisis = analisisCtl?.cargarSiCoincide(e.analisis);
    review.enter(0);
    notify(`Abierta en revisión: ${e.blancas} vs ${e.negras}${conAnalisis ? ' (con su análisis)' : ''}. Usa ◀ ▶ para recorrerla.`);
  }

  function render() {
    list.replaceChildren();
    const items = autosave.list();
    clearBtn.disabled = !items.length;
    if (!items.length) { list.append(h('span', { class: 'muted' }, 'Aún no hay partidas guardadas.')); return; }
    for (const e of items) {
      list.append(h('div', { class: 'saved-row' },
        h('div', { class: 'saved-info' },
          h('b', {}, `${e.blancas} vs ${e.negras}`),
          h('span', { class: 'muted small' }, ` ${e.resultado === '*' ? 'inconclusa' : e.resultado} · ${e.jugadas.length} jugadas${e.razon ? ` · ${e.razon}` : ''} · ${fecha(e.guardada)}`)),
        h('div', { class: 'btn-row' },
          h('button', { onClick: () => open(e) }, 'Revisar'),
          h('button', { title: 'Descargar PGN', onClick: () => descargarPartida(e, 'pgn') }, 'PGN'),
          h('button', { title: 'Descargar JSON', onClick: () => descargarPartida(e, 'json') }, 'JSON'),
          h('button', { class: 'mini', title: 'Quitar de la lista', onClick: () => autosave.remove(e.id) }, '✕'))));
    }
  }
  function notify(text, bad = false) { note.textContent = text; note.className = bad ? 'warn small' : 'muted small'; }
  autosave.on('list', render);
  autosave.on('error', (e) => notify(`⚠ ${e.message}`, true));
  render();
  return { notify, refresh: render };
}
