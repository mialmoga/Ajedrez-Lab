/**
 * Diccionario de frases: convierte un "hecho" ({id, slots}) en texto en español usando plantillas.
 * Formato y huecos: library/explicaciones-es.json.
 */
const PIEZA = { p: ['el', 'peón'], n: ['el', 'caballo'], b: ['el', 'alfil'], r: ['la', 'torre'], q: ['la', 'dama'], k: ['el', 'rey'] };
const SLOTS_PIEZA = new Set(['pieza', 'capturada', 'objetivo', 'objetivo2', 'atacante', 'protegida', 'clavada', 'detras', 'nueva']);
const COLOR = { w: 'las blancas', b: 'las negras' };

export const FORMAT = 'ajedrez-lab/explicaciones@1';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pieceText = (t) => (PIEZA[t] ? `${PIEZA[t][0]} ${PIEZA[t][1]}` : String(t));
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

export class Dictionary {
  constructor(data = {}) {
    this.plantillas = data.plantillas ?? data.templates ?? {};
    this.umbrales = data.umbrales ?? {};
  }

  has(id) { return Array.isArray(this.plantillas[id]) && this.plantillas[id].length > 0; }

  /** Texto de un hecho o null si no hay plantilla. `seed` varía la frase elegida entre variantes. */
  render(hecho, { seed = 0, rival = 'b' } = {}) {
    const list = this.plantillas[hecho.id];
    if (!Array.isArray(list) || !list.length) return null;
    const tpl = list[(seed + hash(hecho.id)) % list.length];
    return tpl.replace(/\{(\w+)\}/g, (all, key) => {
      const lower = key.charAt(0).toLowerCase() + key.slice(1);
      if (lower === 'rival') return COLOR[rival];
      const v = hecho.slots?.[lower];
      if (v == null) return all;
      if (SLOTS_PIEZA.has(lower)) return key === lower ? pieceText(v) : cap(pieceText(v));
      return String(v);
    });
  }
}

export async function loadDictionary(url = 'library/explicaciones-es.json') {
  try {
    const res = await fetch(url);
    if (res.ok) return new Dictionary(await res.json());
  } catch { /* sin diccionario: el explicador queda en silencio */ }
  return new Dictionary();
}
