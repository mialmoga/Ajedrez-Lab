/**
 * Temas: colores de la interfaz (variables CSS), del tablero 2D y del 3D.
 * Para añadir uno, copia un bloque y cambia los colores: aparece solo en el selector.
 */
export const THEMES = {
  clasico: {
    name: 'Clásico',
    css: { '--bg': '#1b1713', '--panel': '#26201a', '--panel2': '#2f2820', '--text': '#efe6d6', '--muted': '#a89a85', '--accent': '#e0a458', '--border': '#43392d' },
    light: '#f0d9b5', dark: '#b58863', frame2d: '#3a2a1c', coords: '#d9c7a6',
    lastMove: 'rgba(246,224,94,.45)', selected: 'rgba(246,224,94,.7)',
    b3d: { light: 0xe9d6ad, dark: 0x9a6a43, frame: 0x4b2f1d, white: 0xf3ead7, black: 0x2b2521, bg: 0x1b1713 },
  },
  pizarra: {
    name: 'Pizarra',
    css: { '--bg': '#10151b', '--panel': '#18202a', '--panel2': '#1f2935', '--text': '#e4ecf4', '--muted': '#8da0b3', '--accent': '#5aa9e6', '--border': '#2c3a49' },
    light: '#c9d3dc', dark: '#5e7387', frame2d: '#222d38', coords: '#9fb2c4',
    lastMove: 'rgba(90,169,230,.40)', selected: 'rgba(90,169,230,.65)',
    b3d: { light: 0xc9d3dc, dark: 0x5e7387, frame: 0x222d38, white: 0xf4f7fa, black: 0x1d242c, bg: 0x10151b },
  },
  neon: {
    name: 'Neón',
    css: { '--bg': '#0c0a14', '--panel': '#151222', '--panel2': '#1d1930', '--text': '#eae6ff', '--muted': '#8f88b8', '--accent': '#ff4fd8', '--border': '#2f2a4f' },
    light: '#3a3563', dark: '#1d1a38', frame2d: '#0c0a14', coords: '#8f88b8',
    lastMove: 'rgba(255,79,216,.35)', selected: 'rgba(125,249,255,.5)',
    b3d: { light: 0x3a3563, dark: 0x1d1a38, frame: 0x0c0a14, white: 0x7df9ff, black: 0xff4fd8, bg: 0x0c0a14 },
  },
};

export function applyTheme(id) {
  const t = THEMES[id] ?? THEMES.clasico;
  for (const [k, v] of Object.entries(t.css)) document.documentElement.style.setProperty(k, v);
  return t;
}
