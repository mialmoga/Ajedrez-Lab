/**
 * Iconos vectoriales con colores fijos (no dependen de la tipografía ni del tema del navegador).
 * `reyIcon('w'|'b')`: rey blanco (relleno blanco, borde oscuro) o negro (relleno oscuro, borde claro), como las piezas del tablero.
 */
const COL = { w: { fill: '#ffffff', stroke: '#141414' }, b: { fill: '#141414', stroke: '#f2f2f2' } };

export function reyIcon(color, { title } = {}) {
  const c = COL[color] ?? COL.w;
  const el = document.createElement('span');
  el.className = 'rey-icon';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', title ?? (color === 'w' ? 'Blancas' : 'Negras'));
  el.innerHTML = `<svg viewBox="0 0 24 24" width="1.15em" height="1.15em" aria-hidden="true">
    <g fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.3" stroke-linejoin="round">
      <path d="M10.6 1.8h2.8v2h2.2v2.6h-2.2v1.7h-2.8V6.4H8.4V3.8h2.2z"/>
      <path d="M12 8.6c-3.4 0-5.6 2.4-5.9 5.4-.2 2 .5 3.7 1.6 5.3h8.6c1.1-1.6 1.8-3.3 1.6-5.3-.3-3-2.5-5.4-5.9-5.4z"/>
      <rect x="5.2" y="19.3" width="13.6" height="3" rx="1.2"/>
    </g></svg>`;
  return el;
}
