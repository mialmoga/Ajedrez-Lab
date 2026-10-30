/**
 * Fuentes embebidas (vendor/fonts, DejaVu): el texto y las piezas del PNG, el tablero 2D y la
 * interfaz se ven IGUAL en cualquier máquina, y lo que lea una IA es lo que dibujamos nosotros.
 * Las @font-face están en styles.css; aquí solo se espera a que estén cargadas antes de dibujar.
 */
export const FONT_SANS = 'LabSans';
export const FONT_MONO = 'LabMono';

export async function ensureFonts() {
  if (!globalThis.document?.fonts?.load) return;
  try {
    await Promise.all([
      document.fonts.load(`16px ${FONT_SANS}`),
      document.fonts.load(`bold 16px ${FONT_SANS}`),
      document.fonts.load(`16px ${FONT_MONO}`),
      document.fonts.load(`16px ${FONT_SANS}`, '♔♚♟1234567890'),
    ]);
  } catch {
    /* sin carga: se usa el respaldo del sistema */
  }
}
