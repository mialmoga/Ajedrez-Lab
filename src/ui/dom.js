/** Mini helper para crear elementos: h('div', { class: 'x', onClick: fn }, hijos...) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (/^on[A-Z]/.test(k) && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const clear = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };

/** Formato de evaluación: +0.35, -1.20, M3, -M2 */
export function fmtEval(info) {
  if (!info) return '–';
  if (info.mate != null) return `${info.mate > 0 ? '' : '-'}M${Math.abs(info.mate)}`;
  if (info.eval == null) return '–';
  const v = info.eval / 100;
  return (v > 0 ? '+' : '') + v.toFixed(2);
}

/** Posición 0..1 de la barra de evaluación (0.5 = igualdad). */
export function evalFraction(info) {
  if (!info) return 0.5;
  if (info.mate != null) return info.mate > 0 ? 1 : 0;
  if (info.eval == null) return 0.5;
  return 0.5 + 0.5 * Math.tanh(info.eval / 400);
}
