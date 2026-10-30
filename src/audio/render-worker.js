// Worker: compone un tema musical fuera del hilo principal (la síntesis muestra a muestra tarda un par de segundos).
import { renderTema } from './temas.js';

self.onmessage = (e) => {
  try {
    const r = renderTema(e.data.id);
    const bufs = [];
    for (const g of [r.capas, r.stingers]) for (const a of Object.values(g)) bufs.push(a.L.buffer, a.R.buffer);
    self.postMessage({ ok: true, r }, bufs);
  } catch (err) {
    self.postMessage({ ok: false, error: String(err?.message ?? err) });
  }
};
