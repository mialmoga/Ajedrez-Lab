/**
 * Intercambio por PNG: la posición se dibuja con texto legible (FEN, turno, jugadas) y el estado
 * completo va además incrustado en los metadatos del archivo. Así se puede jugar contra una IA
 * "sin API": se le pasa el PNG, responde con una jugada, y se pega aquí.
 *
 * Ojo: muchos chats recomprimen la imagen y borran los metadatos; por eso el FEN impreso en la
 * imagen es el respaldo. Al cargar un PNG sin metadatos, se pide pegar ese FEN.
 */
import { insertTextChunk, readTextChunks } from './png-chunks.js';
import { FONT_SANS, FONT_MONO, ensureFonts } from '../ui/fonts.js';

const KEY = 'ajedrez-lab';
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const FILES = 'abcdefgh';

/** Estado serializable de la partida (lo que va en los metadatos). */
export function gameState(game) {
  return {
    formato: 'ajedrez-lab/estado@1',
    fen: game.fen,
    turno: game.turn,
    inicio: game.startFen,
    jugadas: game.moves.map((m) => m.san),
    uci: game.uciHistory,
  };
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxWidth && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Dibuja la posición y devuelve un Blob PNG con el estado incrustado.
 * @param {import('../core/game.js').Game} game
 */
export async function exportPositionPNG(game, { orientation = 'w', theme = {}, sq = 72, note = '' } = {}) {
  await ensureFonts(); // la fuente embebida debe estar lista antes de dibujar
  const light = theme.light ?? '#f0d9b5';
  const dark = theme.dark ?? '#b58863';
  const margin = 34, boardPx = sq * 8, W = boardPx + margin * 2;
  const textTop = margin * 2 + boardPx;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = textTop + 230;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // casillas
  const board = game.board();
  const last = game.lastMove;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const file = orientation === 'w' ? f : 7 - f;
      const row = orientation === 'w' ? r : 7 - r; // row 0 = rango 8
      const name = FILES[file] + (8 - row);
      const isLight = (file + row) % 2 === 0;
      ctx.fillStyle = isLight ? light : dark;
      ctx.fillRect(margin + f * sq, margin + r * sq, sq, sq);
      if (last && (name === last.from || name === last.to)) {
        ctx.fillStyle = 'rgba(255,230,0,0.38)';
        ctx.fillRect(margin + f * sq, margin + r * sq, sq, sq);
      }
      const p = board[row][file];
      if (p) {
        ctx.font = `${Math.round(sq * 0.82)}px ${FONT_SANS}, "DejaVu Sans", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const g = GLYPH[p.type] + '︎';
        const cx = margin + f * sq + sq / 2, cy = margin + r * sq + sq / 2 + sq * 0.04;
        ctx.lineWidth = 3;
        ctx.strokeStyle = p.color === 'w' ? '#111' : '#f5f5f5';
        ctx.strokeText(g, cx, cy);
        ctx.fillStyle = p.color === 'w' ? '#ffffff' : '#111111';
        ctx.fillText(g, cx, cy);
      }
    }
  }

  // coordenadas
  ctx.fillStyle = '#111';
  ctx.font = `bold 22px ${FONT_SANS}, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 8; i++) {
    const file = orientation === 'w' ? i : 7 - i;
    const rank = orientation === 'w' ? 8 - i : i + 1;
    ctx.fillText(FILES[file], margin + i * sq + sq / 2, margin + boardPx + margin / 2);
    ctx.fillText(FILES[file], margin + i * sq + sq / 2, margin / 2);
    ctx.fillText(String(rank), margin / 2, margin + i * sq + sq / 2);
    ctx.fillText(String(rank), margin + boardPx + margin / 2, margin + i * sq + sq / 2);
  }

  // texto
  const st = game.status();
  const turnText = st.over
    ? `Partida terminada: ${st.reason}`
    : `Turno: ${game.turn === 'w' ? 'BLANCAS' : 'NEGRAS'}${game.inCheck ? ' (en jaque)' : ''}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#111';
  let y = textTop;
  ctx.font = `bold 24px ${FONT_SANS}, sans-serif`;
  ctx.fillText(turnText, margin, y);
  y += 32;
  ctx.font = `16px ${FONT_MONO}, monospace`;
  for (const line of wrapText(ctx, `FEN: ${game.fen}`, W - margin * 2)) { ctx.fillText(line, margin, y); y += 20; }
  y += 4;
  const moveText = game.moveText(14) || '(posición inicial)';
  ctx.font = `17px ${FONT_SANS}, sans-serif`;
  for (const line of wrapText(ctx, `Últimas jugadas: ${moveText}`, W - margin * 2)) { ctx.fillText(line, margin, y); y += 22; }
  y += 6;
  ctx.font = `16px ${FONT_SANS}, sans-serif`;
  ctx.fillStyle = '#333';
  const ask = note || (game.status().over ? 'La partida terminó: no hay jugada que responder.' : 'Responde con tu jugada en notación SAN (ej. Nf3) o UCI (ej. g1f3). Termina con una línea: «Jugada: <tu jugada>».');
  for (const line of wrapText(ctx, ask, W - margin * 2)) { ctx.fillText(line, margin, y); y += 20; }

  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // JSON en ASCII puro (tEXt es Latin-1)
  const json = JSON.stringify(gameState(game)).replace(/[\u0080-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  return new Blob([insertTextChunk(bytes, KEY, json)], { type: 'image/png' });
}

/** Lee el estado incrustado en un PNG exportado por esta herramienta; null si no lo trae. */
export async function readPNGState(fileOrBlob) {
  const bytes = new Uint8Array(await fileOrBlob.arrayBuffer());
  const texts = readTextChunks(bytes);
  if (!texts[KEY]) return null;
  try {
    return JSON.parse(texts[KEY]);
  } catch {
    return null;
  }
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
