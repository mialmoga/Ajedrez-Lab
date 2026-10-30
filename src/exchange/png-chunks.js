/**
 * Utilidades puras para incrustar/leer texto en PNG (chunks tEXt). Sin dependencias del navegador.
 * Sirve para guardar el estado de la partida DENTRO del archivo de imagen.
 */
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

let CRC_TABLE = null;
function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const latin1 = (s) => Uint8Array.from(s, (ch) => ch.charCodeAt(0) & 0xff);
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

function assertPng(bytes) {
  if (SIGNATURE.some((b, i) => bytes[i] !== b)) throw new Error('No es un PNG válido');
}

/** Itera los chunks: { type, start, length } (start = inicio del chunk completo). */
function* chunks(bytes) {
  let off = 8;
  while (off + 12 <= bytes.length) {
    const len = ((bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3]) >>> 0;
    const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
    yield { type, start: off, length: len };
    off += 12 + len;
  }
}

/** Devuelve un PNG nuevo con un chunk tEXt (keyword + texto Latin-1) antes de IEND. */
export function insertTextChunk(png, keyword, text) {
  assertPng(png);
  const iend = [...chunks(png)].find((c) => c.type === 'IEND');
  if (!iend) throw new Error('PNG sin IEND');
  const body = new Uint8Array([...latin1(keyword), 0, ...latin1(text)]);
  const type = latin1('tEXt');
  const crcInput = new Uint8Array(type.length + body.length);
  crcInput.set(type);
  crcInput.set(body, type.length);
  const chunk = new Uint8Array([...u32(body.length), ...type, ...body, ...u32(crc32(crcInput))]);
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, iend.start));
  out.set(chunk, iend.start);
  out.set(png.subarray(iend.start), iend.start + chunk.length);
  return out;
}

/** Lee todos los tEXt: { keyword: texto }. */
export function readTextChunks(png) {
  assertPng(png);
  const out = {};
  for (const c of chunks(png)) {
    if (c.type !== 'tEXt') continue;
    const data = png.subarray(c.start + 8, c.start + 8 + c.length);
    const nul = data.indexOf(0);
    if (nul < 0) continue;
    out[String.fromCharCode(...data.subarray(0, nul))] = String.fromCharCode(...data.subarray(nul + 1));
  }
  return out;
}
