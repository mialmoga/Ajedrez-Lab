/**
 * Explicador por reglas: dada una posición y una jugada, detecta HECHOS (detectors/) y los
 * convierte en texto con el diccionario. Si ningún detector aplica, no dice nada (mejor callar que inventar).
 */
import { Chess } from '../core/chess.js';
import { DETECTORS } from './detectors/index.js';
import { other } from './helpers.js';

const MAX_HECHOS = 2;

/** Hechos detectados, ordenados por prioridad. `prev` = jugada anterior (verbose) o null. */
export function detectFacts({ fenBefore, uci, ply = 0, prev = null }) {
  const before = new Chess(fenBefore);
  const after = new Chess(fenBefore);
  const move = after.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  if (!move) return { facts: [], move: null };
  const ctx = { before, after, move, color: move.color, opp: other(move.color), ply, prev };
  const facts = [];
  for (const d of DETECTORS) {
    let f = null;
    try { f = d.detect(ctx); } catch { /* un detector roto no debe tumbar la explicación */ }
    if (f) facts.push({ ...f, grupo: d.grupo });
  }
  facts.sort((a, b) => b.prioridad - a.prioridad);
  return { facts, move };
}

/** Elige hasta MAX_HECHOS hechos de grupos distintos con plantilla; el mate/ahogado va solo. */
export function pickFacts(facts, dictionary) {
  const usable = facts.filter((f) => dictionary.has(f.id));
  if (!usable.length) return [];
  if (usable[0].prioridad >= 95) return [usable[0]];
  const out = [usable[0]];
  for (const f of usable.slice(1)) {
    if (out.length >= MAX_HECHOS) break;
    if (f.prioridad >= 40 && !out.some((o) => o.grupo === f.grupo)) out.push(f);
  }
  return out;
}

export function explainMove({ fenBefore, uci, ply = 0, prev = null, dictionary }) {
  const { facts, move } = detectFacts({ fenBefore, uci, ply, prev });
  if (!move) return null;
  const picked = pickFacts(facts, dictionary);
  const texts = picked.map((f) => dictionary.render(f, { seed: ply, rival: other(move.color) })).filter(Boolean);
  return texts.length ? { texto: texts.join(' '), hechos: picked.map((f) => f.id), fuente: 'reglas' } : null;
}
