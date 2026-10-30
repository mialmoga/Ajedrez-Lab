/**
 * Reproductor de la música del modo cine.
 *
 * Los temas (temas.js) son capas en bucle alineadas al compás; aquí solo se sube y baja la ganancia de cada capa
 * según el nivel de tensión (0 calma · 1 tensión · 2 clímax) y se disparan los stingers de los eventos.
 *
 *   const m = createMusica();
 *   await m.preparar('clasico');     // compone el tema en un worker (unos segundos; se guarda en memoria)
 *   m.desbloquear();                 // dentro del clic del usuario (política de autoplay), antes de esperar nada
 *   m.iniciar(0.7);
 *   m.setNivel(2); m.evento('captura'); m.atenuar(true); m.final('mate'); m.detener();
 */
const cache = new Map(); // id -> Promise<tema>
const DISPONIBLES = ['clasico', 'pizarra', 'neon']; // un tema por estilo de tablero (temas.js)

function componer(id) {
  if (!DISPONIBLES.includes(id)) id = DISPONIBLES[0];
  if (!cache.has(id)) {
    const p = (async () => {
      try {
        const w = new Worker(new URL('./render-worker.js', import.meta.url), { type: 'module' });
        return await new Promise((ok, fail) => {
          w.onmessage = (e) => { w.terminate(); e.data.ok ? ok(e.data.r) : fail(new Error(e.data.error)); };
          w.onerror = (e) => { w.terminate(); fail(new Error(e.message || 'worker')); };
          w.postMessage({ id });
        });
      } catch {
        // sin workers de módulo: se compone aquí (bloquea la página un par de segundos)
        const { renderTema } = await import('./temas.js');
        return renderTema(id);
      }
    })();
    cache.set(id, p);
    p.catch(() => cache.delete(id));
  }
  return cache.get(id);
}

export function createMusica() {
  const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  let ctx = null, master = null, tema = null, atenuada = false, vol = 0.7, sonando = false, nivel = 0, ultimoEvento = -9;
  let fuentes = [], ganancias = {}, buffers = null;

  const mkBuf = (a, sr) => {
    const b = ctx.createBuffer(2, a.L.length, sr);
    b.copyToChannel(a.L, 0); b.copyToChannel(a.R, 1);
    return b;
  };

  return {
    get disponible() { return !!AC; },
    get sonando() { return sonando; },
    /** Para depurar y probar. */
    estado() { return { sonando, nivel, ctx: ctx?.state ?? null, ganancias: Object.fromEntries(Object.entries(ganancias).map(([k, g]) => [k, +g.gain.value.toFixed(2)])), master: master ? +master.gain.value.toFixed(2) : null }; },
    async preparar(id) { tema = await componer(id); return tema; },

    /** Crea y despierta el AudioContext. Hay que llamarlo DENTRO del gesto del usuario (el clic), antes de cualquier espera. */
    desbloquear() {
      if (!AC || ctx) return;
      try { ctx = new AC(); ctx.resume?.(); } catch { ctx = null; }
    },

    iniciar(volumen = vol) {
      if (!AC || !tema || sonando) return false;
      vol = volumen;
      if (!ctx) { try { ctx = new AC(); } catch { return false; } }
      ctx.resume?.();
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      buffers = { capas: {}, stingers: {} };
      for (const [k, a] of Object.entries(tema.capas)) buffers.capas[k] = mkBuf(a, tema.sr);
      for (const [k, a] of Object.entries(tema.stingers)) buffers.stingers[k] = mkBuf(a, tema.sr);
      const t0 = ctx.currentTime + 0.15;
      fuentes = []; ganancias = {};
      for (const [k, b] of Object.entries(buffers.capas)) {
        const s = ctx.createBufferSource(), g = ctx.createGain();
        s.buffer = b; s.loop = true;
        g.gain.value = k === 'cama' ? 1 : 0;
        s.connect(g); g.connect(master);
        s.start(t0);
        fuentes.push(s); ganancias[k] = g;
      }
      master.gain.setTargetAtTime(vol * (atenuada ? 0.35 : 1), ctx.currentTime, 0.6); // entra con fundido
      sonando = true; nivel = 0; ultimoEvento = -9;
      return true;
    },

    /** 0 calma · 1 tensión · 2 clímax: las capas entran y salen con un fundido corto. */
    setNivel(n) {
      if (!sonando) return;
      nivel = n;
      const now = ctx.currentTime;
      ganancias.cama?.gain.setTargetAtTime(1, now, 0.4);
      ganancias.ritmo?.gain.setTargetAtTime(n >= 1 ? 1 : 0, now, 0.45);
      ganancias.climax?.gain.setTargetAtTime(n >= 2 ? 1 : 0, now, 0.35);
    },

    /** Stinger de un evento: 'captura' | 'jaque' | 'error' | 'brillante' | 'mate' | 'final'. Máximo uno cada ~1.2 s. */
    evento(tipo) {
      if (!sonando || !buffers.stingers[tipo]) return;
      const now = ctx.currentTime;
      if (tipo !== 'mate' && tipo !== 'final' && now - ultimoEvento < 1.2) return;
      ultimoEvento = now;
      const s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = buffers.stingers[tipo];
      g.gain.value = { captura: 0.85, jaque: 1.3, brillante: 1.3, final: 1.8 }[tipo] ?? 1;
      s.connect(g); g.connect(master);
      s.start(now + 0.02);
    },

    /** Cierre de la película: las capas se apagan despacio y suena el stinger del final ('mate' o 'final'). */
    final(tipo = 'final') {
      if (!sonando) return;
      const now = ctx.currentTime;
      for (const g of Object.values(ganancias)) g.gain.setTargetAtTime(0, now, 1.1);
      ultimoEvento = -9;
      this.evento(tipo === 'mate' ? 'mate' : 'final');
    },

    /** En pausa la música no se corta: baja de volumen (así se oyen los stingers al avanzar jugada a jugada). */
    atenuar(on) { atenuada = !!on; if (sonando) master.gain.setTargetAtTime(vol * (atenuada ? 0.35 : 1), ctx.currentTime, 0.25); },
    setVolumen(v) { vol = Math.max(0, Math.min(1, v)); if (sonando) master.gain.setTargetAtTime(vol * (atenuada ? 0.35 : 1), ctx.currentTime, 0.1); },

    detener(fundido = 0.8) {
      if (!sonando) { if (ctx) { ctx.close?.().catch(() => {}); ctx = null; } return; }
      sonando = false;
      const c = ctx, m = master, fs = fuentes;
      ctx = master = null; fuentes = []; ganancias = {}; buffers = null; atenuada = false;
      try {
        c.resume?.();
        m.gain.cancelScheduledValues(c.currentTime);
        m.gain.setTargetAtTime(0, c.currentTime, fundido / 3);
      } catch { /* ya cerrado */ }
      setTimeout(() => { for (const s of fs) { try { s.stop(); } catch { /* parado */ } } c.close?.().catch(() => {}); }, fundido * 1000 + 200);
    },
  };
}
