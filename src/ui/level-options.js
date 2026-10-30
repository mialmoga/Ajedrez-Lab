import { h } from './dom.js';

/**
 * Opciones de un desplegable de niveles. Si los niveles traen `group`, se agrupan con <optgroup>
 * (p. ej. Stockfish: "Elo limitado" y "Profundidad limitada"); los que no, van sueltos.
 * `extra` = opciones ya construidas que van al final (p. ej. "Personalizado…").
 */
export function levelOptions(levels, extra = []) {
  const out = [];
  const groups = new Map();
  for (const l of levels) {
    const opt = h('option', { value: l.id }, l.name);
    if (!l.group) { out.push(opt); continue; }
    if (!groups.has(l.group)) { const g = h('optgroup', { label: l.group }); groups.set(l.group, g); out.push(g); }
    groups.get(l.group).append(opt);
  }
  return [...out, ...extra];
}
