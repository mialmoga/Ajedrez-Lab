/**
 * Mantiene la pantalla encendida mientras un torneo o liga está corriendo (API Screen Wake Lock).
 * Evita que el móvil congele la pestaña con la pantalla apagada. Si el navegador no la soporta, no hace nada.
 * El sistema suelta el bloqueo al ocultar la pestaña; se vuelve a pedir al volver.
 */
export function createWakeLock() {
  let want = false;
  let sentinel = null;
  const supported = typeof navigator !== 'undefined' && !!navigator.wakeLock?.request;

  async function acquire() {
    if (!supported || sentinel || !want) return;
    try {
      const s = await navigator.wakeLock.request('screen');
      if (!want) { s.release?.().catch?.(() => {}); return; }
      sentinel = s;
      s.addEventListener?.('release', () => { if (sentinel === s) sentinel = null; });
    } catch { /* sin permiso o sin batería: seguimos sin bloqueo */ }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') acquire(); });
  }
  return {
    supported,
    /** Pide (true) o suelta (false) el bloqueo. Idempotente. */
    set(on) {
      want = !!on;
      if (want) acquire();
      else if (sentinel) { const s = sentinel; sentinel = null; s.release?.().catch?.(() => {}); }
    },
    get active() { return !!sentinel; },
  };
}
