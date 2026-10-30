import { h } from './dom.js';
import { exportPositionPNG, readPNGState, downloadBlob } from '../exchange/png.js';
import { findMoveInText, explainRejection } from '../exchange/parse-move.js';

/** Panel de intercambio: PNG de la posición, cargar PNG/FEN, pegar la jugada de una IA externa. */
export function createExchangePanel(root, ctx) {
  const { game, boardCtl, getTheme, rechazos } = ctx;
  const msg = h('div', { class: 'muted', role: 'status' });
  const say = (t, bad = false) => { msg.textContent = t; msg.className = bad ? 'warn' : 'muted'; };
  const contador = h('div', { class: 'muted small', title: 'Respuestas sin jugada legal en esta partida; se reinicia con cada partida nueva' });
  const detalle = h('div', { class: 'muted small' });
  function renderRechazos() {
    if (!rechazos) return;
    contador.textContent = `Rechazos en esta partida: ${rechazos.n}`;
    detalle.replaceChildren(...rechazos.items.slice(-3).map((r) => h('div', {}, `✗ ${r.motivo}`)));
  }

  const png = () => exportPositionPNG(game, { orientation: boardCtl.orientation, theme: getTheme() });

  const moveInput = h('input', { type: 'text', placeholder: 'Jugada de la IA: Nf3, e2e4, "Mi jugada: Nf3"…' });
  function playText() {
    const found = findMoveInText(moveInput.value, game.fen);
    if (!found) {
      const motivo = explainRejection(moveInput.value, game.fen);
      rechazos?.add(moveInput.value, motivo);
      renderRechazos();
      return say(`Rechazada: ${motivo}`, true);
    }
    game.play({ from: found.from, to: found.to, promotion: found.promotion });
    moveInput.value = '';
    say(`Jugada aplicada: ${found.san}${found.via === 'marcador' ? ' (marcador «Jugada:»)' : ''}`);
  }
  moveInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') playText(); });

  const fenInput = h('input', { type: 'text', placeholder: 'Pegar FEN…' });
  function loadFen() {
    try { game.reset(fenInput.value.trim()); fenInput.value = ''; say('Posición cargada desde el FEN.'); }
    catch { say('FEN inválido.', true); }
  }

  const fileInput = h('input', { type: 'file', accept: 'image/png', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const st = await readPNGState(file);
      if (!st) return say('Ese PNG no trae metadatos (¿el chat los borró?). Pega el FEN impreso en la imagen.', true);
      const list = st.uci?.length ? st.uci : st.jugadas;
      const n = game.loadMoves(list ?? [], st.inicio);
      if (n < (list?.length ?? 0) || game.fen.split(' ')[0] !== st.fen.split(' ')[0]) { game.reset(st.fen); say('Posición cargada desde el FEN del PNG.'); }
      else say(`PNG cargado: ${n} jugadas.`);
    } catch (err) {
      say(`No se pudo leer el PNG: ${err.message}`, true);
    }
  });

  root.append(
    h('div', { class: 'btn-row' },
      h('button', { onClick: async () => { downloadBlob(await png(), `ajedrez-${String(game.ply).padStart(3, '0')}.png`); say('PNG descargado.'); } }, 'Descargar PNG'),
      h('button', { onClick: async () => {
        try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': await png() })]); say('PNG copiado: pégalo en el chat de la IA.'); }
        catch { say('El navegador no permitió copiar la imagen; usa Descargar.', true); }
      } }, 'Copiar PNG'),
      h('button', { onClick: () => fileInput.click() }, 'Cargar PNG…'),
      h('button', { onClick: async () => { await navigator.clipboard?.writeText(game.fen); say('FEN copiado.'); } }, 'Copiar FEN'),
      fileInput),
    h('div', { class: 'row' }, moveInput, h('button', { onClick: playText }, 'Aplicar jugada')),
    h('div', { class: 'row' }, fenInput, h('button', { onClick: loadFen }, 'Cargar')),
    msg, contador, detalle,
    h('p', { class: 'muted small' }, 'Ciclo sin API: Descargar/Copiar PNG → pásalo a la IA → pega su respuesta arriba. Si la respuesta trae «Jugada: <jugada>», manda esa línea; si no, se toma la primera jugada legal del texto. Para IA vs IA, repite con el PNG de cada turno.'));
  renderRechazos();
  const off = game.on('change', renderRechazos);
  return { destroy: () => off() };
}
