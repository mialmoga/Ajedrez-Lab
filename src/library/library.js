import { Chess, DEFAULT_POSITION } from '../core/chess.js';

/**
 * Librería de partidas/aperturas explicadas. Formato en docs/FORMATO-JSON.md.
 * Cada línea se REPRODUCE con chess.js al cargarla: lo ilegal se avisa y la línea se corta ahí.
 * Las posiciones se indexan por FEN (sin contadores), así se detectan transposiciones.
 */
export const FORMAT = 'ajedrez-lab/libreria@1';

const UCI_RE = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/;

/** Clave de posición: piezas + turno + enroques + al paso (sin reloj de medias jugadas). */
export function fenKey(fen) {
  return fen.split(' ').slice(0, 4).join(' ');
}

export class Library {
  constructor() {
    this.lines = [];
    this.warnings = [];
    this.sources = [];
    this._index = new Map();
  }

  clear() {
    this.lines = [];
    this.warnings = [];
    this.sources = [];
    this._index.clear();
  }

  /**
   * Añade el contenido de un JSON ya parseado.
   * Acepta { lineas: [...] }, { lines: [...] }, un array de líneas, o una sola línea.
   * @returns {{ added: number, warnings: string[] }}
   */
  addFromObject(obj, sourceName = 'sin nombre') {
    const warnings = [];
    let rawLines;
    if (Array.isArray(obj)) rawLines = obj;
    else if (Array.isArray(obj?.lineas)) rawLines = obj.lineas;
    else if (Array.isArray(obj?.lines)) rawLines = obj.lines;
    else if (Array.isArray(obj?.jugadas) || Array.isArray(obj?.moves)) rawLines = [obj];
    else {
      warnings.push(`${sourceName}: no se encontró "lineas" ni "jugadas"`);
      this.warnings.push(...warnings);
      return { added: 0, warnings };
    }
    const base = obj?.nombre ?? obj?.name ?? null;
    let added = 0;
    rawLines.forEach((raw, i) => {
      const line = normalizeLine(raw, i, sourceName, warnings, this.lines.length);
      if (!line) return;
      this.lines.push(line);
      this._indexLine(line);
      added++;
    });
    this.sources.push({ name: base ?? sourceName, file: sourceName, lines: added });
    this.warnings.push(...warnings);
    return { added, warnings };
  }

  _indexLine(line) {
    line.moves.forEach((_, i) => this._push(line.keys[i], line, i));
    this._push(line.keys[line.moves.length], line, line.moves.length);
  }

  _push(key, line, i) {
    if (!this._index.has(key)) this._index.set(key, []);
    this._index.get(key).push({ line, i });
  }

  /** Líneas que pasan por esta posición: [{ line, i }] (i = jugadas ya hechas en esa línea). */
  positionsFor(fen) {
    return this._index.get(fenKey(fen)) ?? [];
  }
}

function normalizeLine(raw, idx, source, warnings, globalIdx) {
  const name = raw.nombre ?? raw.name ?? `Línea ${globalIdx + 1}`;
  const list = raw.jugadas ?? raw.moves;
  if (!Array.isArray(list) || list.length === 0) {
    warnings.push(`${source} · ${name}: sin jugadas`);
    return null;
  }
  const startFen = raw.inicio ?? raw.fen ?? DEFAULT_POSITION;
  let chess;
  try {
    chess = new Chess(startFen);
  } catch {
    warnings.push(`${source} · ${name}: FEN de inicio inválido`);
    return null;
  }
  const keys = [fenKey(chess.fen())];
  const moves = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const text = typeof item === 'string' ? item : (item.san ?? item.uci ?? item.jugada ?? item.move);
    const nota = typeof item === 'string' ? '' : (item.nota ?? item.note ?? '');
    let mv = null;
    try {
      const m = typeof text === 'string' ? UCI_RE.exec(text) : null;
      mv = m ? chess.move({ from: m[1], to: m[2], promotion: m[3] }) : chess.move(String(text));
    } catch { /* ilegal */ }
    if (!mv) {
      warnings.push(`${source} · ${name}: la jugada ${i + 1} "${text}" es ilegal; la línea se corta ahí`);
      break;
    }
    moves.push({ san: mv.san, uci: mv.from + mv.to + (mv.promotion ?? ''), nota, color: mv.color });
    keys.push(fenKey(chess.fen()));
  }
  if (!moves.length) return null;
  return {
    id: raw.id ?? `${source}:${globalIdx}`,
    name,
    eco: raw.eco ?? '',
    description: raw.descripcion ?? raw.description ?? '',
    weight: Number(raw.peso ?? raw.weight ?? 1) || 1,
    startFen,
    moves,
    keys, // keys[i] = clave de posición tras i jugadas
    source,
  };
}

export async function loadLibraryFromFiles(library, files) {
  const results = [];
  for (const file of files) {
    try {
      results.push({ file: file.name, ...library.addFromObject(JSON.parse(await file.text()), file.name) });
    } catch (err) {
      const msg = `${file.name}: JSON inválido (${err.message})`;
      library.warnings.push(msg);
      results.push({ file: file.name, added: 0, warnings: [msg] });
    }
  }
  return results;
}

/** Carga library/index.json ({ "archivos": ["a.json", ...] }) y cada archivo listado. */
export async function loadDefaultLibrary(library, baseUrl = 'library/') {
  try {
    const res = await fetch(baseUrl + 'index.json');
    if (!res.ok) return;
    const index = await res.json();
    for (const f of index.archivos ?? index.files ?? []) {
      try {
        const r = await fetch(baseUrl + f);
        library.addFromObject(await r.json(), f);
      } catch (err) {
        library.warnings.push(`${f}: no se pudo cargar (${err.message})`);
      }
    }
  } catch { /* sin librería por defecto: no pasa nada */ }
}
