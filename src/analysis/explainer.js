/**
 * Explicador completo: la nota de la librería manda; si no hay, explica con reglas + diccionario.
 *   explainer.explainPly(startFen, ucis, k)  → { texto, fuente: 'librería'|'reglas', hechos? } | null
 * (k = índice 0-based de la jugada dentro de `ucis`).
 */
import { Chess } from '../core/chess.js';
import { explainMove } from './explain.js';
import { judgeFacts } from './verdict.js';

export class Explainer {
  /** @param {{library: import('../library/library.js').Library, dictionary: import('./dictionary.js').Dictionary}} deps */
  constructor({ library, dictionary }) {
    this.library = library;
    this.dictionary = dictionary;
    this._cache = new Map();
  }

  setDictionary(d) { this.dictionary = d; this._cache.clear(); }

  libraryNote(fenAfter, uci) {
    for (const { line, i } of this.library?.positionsFor(fenAfter) ?? []) {
      const prev = i > 0 ? line.moves[i - 1] : null;
      if (prev?.uci === uci && prev.nota) return prev.nota;
    }
    return null;
  }

  explainPly(startFen, ucis, k) {
    const c = new Chess(startFen);
    let prev = null, fenBefore = c.fen();
    for (let i = 0; i <= k; i++) {
      fenBefore = c.fen();
      const u = ucis[i];
      const mv = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      if (!mv) return null;
      if (i === k) break;
      prev = mv;
    }
    const uci = ucis[k];
    const key = `${fenBefore}|${uci}|${prev?.to ?? ''}${prev?.captured ?? ''}|${k}`;
    if (this._cache.has(key)) return this._cache.get(key);
    const nota = this.libraryNote(c.fen(), uci);
    let res = nota ? { texto: nota, fuente: 'librería' } : explainMove({ fenBefore, uci, ply: k, prev, dictionary: this.dictionary });
    if (this._cache.size > 2000) this._cache.clear();
    this._cache.set(key, res);
    return res;
  }

  /**
   * Veredicto del juez para la jugada k (asíncrono). Devuelve { texto, hechos, juez } o null.
   * - `judge`: instancia de Judge. Compara la evaluación antes y después y, si procede, sondea amenazas de mate.
   */
  async judgePly(judge, startFen, ucis, k) {
    if (!judge || !this.dictionary) return null;
    const c = new Chess(startFen);
    for (let i = 0; i < k; i++) { const u = ucis[i]; c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); }
    const fenBefore = c.fen();
    const u = ucis[k];
    const mv = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    if (!mv) return null;
    const fenAfter = c.fen();
    if (c.isGameOver()) return null;
    const color = mv.color;

    const [before, after] = [await judge.evaluate(fenBefore), await judge.evaluate(fenAfter)];
    if (!before || !after) return null;
    let bestSan = null;
    if (before.move) {
      try { const t = new Chess(fenBefore); bestSan = t.move({ from: before.move.slice(0, 2), to: before.move.slice(2, 4), promotion: before.move[4] })?.san ?? null; } catch { /* jugada del juez no válida */ }
    }
    const facts = judgeFacts({ before, after, color, uci: u, bestUci: before.move, bestSan, umbrales: judge.umbrales });

    // amenaza de mate: si el rival "pasara", ¿el que movió tendría mate corto?
    if (!facts.some((f) => f.id === 'mate_perdido') && !c.isCheck()) {
      const sa = color === 'w' ? after.eval : -after.eval;
      if ((after.mate != null && (color === 'w' ? after.mate > 0 : after.mate < 0)) || sa >= 150) {
        const parts = fenAfter.split(' ');
        parts[1] = color; parts[3] = '-';
        const probe = await judge.evaluate(parts.join(' '));
        const n = probe?.mate != null && (color === 'w' ? probe.mate > 0 : probe.mate < 0) ? Math.abs(probe.mate) : null;
        if (n != null && n <= judge.umbrales.amenazaMateMax) facts.unshift({ id: 'amenaza_mate', slots: { n } });
      }
    }
    if (!facts.length) return null;
    const textos = facts.map((f) => this.dictionary.render({ id: f.id, slots: { ...f.slots, juez: judge.shortName } }, { seed: k })).filter(Boolean);
    return textos.length ? { texto: textos.join(' '), hechos: facts.map((f) => f.id), juez: judge.name, debil: judge.weak } : null;
  }
}
