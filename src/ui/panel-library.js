import { h } from './dom.js';
import { analyze } from '../library/detector.js';
import { loadLibraryFromFiles } from '../library/library.js';

/** Panel de librería: carga de JSON, detección de apertura, predicción y explicaciones. */
export function createLibraryPanel(root, ctx) {
  const { game, match, library } = ctx;
  let showNext = true;
  let studyId = '';

  const fileInput = h('input', { type: 'file', accept: '.json,application/json', multiple: true, hidden: true });
  fileInput.addEventListener('change', async () => {
    await loadLibraryFromFiles(library, [...fileInput.files]);
    fileInput.value = '';
    render();
  });
  const loadBtn = h('button', { onClick: () => fileInput.click() }, 'Cargar JSON…');
  const clearBtn = h('button', { onClick: () => { library.clear(); studyId = ''; render(); } }, 'Vaciar');
  const summary = h('div', { class: 'muted' });
  const warnings = h('details', { class: 'warnings' });

  const nextToggle = h('input', { type: 'checkbox', checked: true });
  nextToggle.addEventListener('change', () => { showNext = nextToggle.checked; render(); });
  const bookToggle = h('input', { type: 'checkbox' });
  bookToggle.addEventListener('change', () => { match.useBook = bookToggle.checked; });

  const detection = h('div', { class: 'detection' });
  const studySelect = h('select', { 'aria-label': 'Estudiar una línea' });
  studySelect.addEventListener('change', () => { studyId = studySelect.value; renderStudy(); });
  const study = h('div', { class: 'study' });

  root.append(
    h('div', { class: 'btn-row' }, loadBtn, clearBtn, fileInput),
    summary, warnings,
    h('label', { class: 'row' }, nextToggle, ' Mostrar la jugada siguiente de la librería'),
    h('label', { class: 'row' }, bookToggle, ' El motor usa la librería como libro de aperturas'),
    detection,
    h('h4', {}, 'Estudiar una línea'), studySelect, study);

  function renderStudy() {
    study.replaceChildren();
    const line = library.lines.find((l) => l.id === studyId);
    if (!line) return;
    if (line.description) study.append(h('p', { class: 'muted' }, line.description));
    const ol = h('div', { class: 'study-moves' });
    line.moves.forEach((m, i) => {
      const num = line.startFen.includes(' b ') && i === 0 ? '…' : '';
      ol.append(h('button', {
        class: 'study-move',
        title: m.nota,
        onClick: () => game.loadMoves(line.moves.slice(0, i + 1).map((x) => x.uci), line.startFen),
      }, num, m.color === 'w' ? `${Math.floor(i / 2) + 1}. ` : '', m.san));
    });
    study.append(ol, h('p', { class: 'muted' }, 'Pulsa una jugada para llevar el tablero hasta ahí; su explicación aparece arriba.'));
  }

  function render() {
    const nLines = library.lines.length;
    summary.textContent = nLines
      ? `${nLines} líneas cargadas (${library.sources.map((s) => s.file).join(', ')})`
      : 'Sin librería cargada. Carga un JSON (formato en docs/FORMATO-JSON.md).';
    warnings.replaceChildren();
    warnings.hidden = !library.warnings.length; // un <details> vacío se pinta como "Detalles"
    if (library.warnings.length) {
      warnings.append(h('summary', {}, `⚠ ${library.warnings.length} aviso(s)`), ...library.warnings.map((w) => h('div', { class: 'warn' }, w)));
    }
    studySelect.replaceChildren(
      h('option', { value: '' }, '— elige —'),
      ...library.lines.map((l) => h('option', { value: l.id }, `${l.name}${l.eco ? ` (${l.eco})` : ''}`)));
    studySelect.value = studyId;

    detection.replaceChildren();
    if (!nLines) return;
    const r = analyze(library, game);

    if (r.inBook) {
      const lines = r.alive.filter((a) => !a.finished || r.alive.length <= 3);
      detection.append(h('div', {}, h('b', {}, `En librería · ${r.alive.length} línea(s) posibles`)));
      detection.append(h('ul', { class: 'alive' }, lines.slice(0, 6).map((a) =>
        h('li', {},
          a.line.name, a.line.eco ? ` (${a.line.eco})` : '',
          a.exact ? '' : h('span', { class: 'tag' }, 'transposición'),
          a.finished ? h('span', { class: 'tag' }, 'línea completa') : ''))));
      if (r.alive.length > 6) detection.append(h('div', { class: 'muted' }, `…y ${r.alive.length - 6} más`));
      if (r.nextMoves.length) {
        detection.append(h('div', { class: 'predict' },
          h('b', {}, 'Siguiente probable'),
          r.nextMoves.slice(0, 4).map((n, idx) => h('div', { class: 'pred-row' },
            h('div', { class: 'pred-head' },
              h('span', { class: 'san' }, showNext ? n.san : `Opción ${idx + 1}`),
              h('span', { class: 'muted' }, `${n.pct}%`)),
            h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: { width: `${n.pct}%` } })),
            showNext && n.notes[0] ? h('div', { class: 'note-sm' }, n.notes[0]) : null,
            showNext ? h('div', { class: 'muted small' }, n.lines.map((l) => l.name).join(' · ')) : null))));
      }
    } else if (game.ply > 0) {
      detection.append(h('div', { class: 'warn' }, `Fuera de la librería desde la jugada ${r.leftAtPly + 1}.`));
      if (r.expected.length && showNext) {
        detection.append(h('div', { class: 'muted' }, 'La librería esperaba: ',
          r.expected.slice(0, 3).map((e) => `${e.san} (${e.pct}%)`).join(', ')));
      }
    }
  }

  const off = [game.on('change', render)];
  render();
  return { destroy: () => off.forEach((f) => f()), refresh: render };
}
