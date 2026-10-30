// Web Worker: ejecuta la búsqueda fuera del hilo de la interfaz.
import { search } from './minimax2-core.js';

self.onmessage = (e) => {
  const { id, fen, limits } = e.data;
  try {
    const result = search(fen, {
      ...limits,
      onInfo: (info) => self.postMessage({ id, type: 'info', info }),
    });
    self.postMessage({ id, type: 'result', result });
  } catch (err) {
    self.postMessage({ id, type: 'error', message: String(err?.stack ?? err) });
  }
};
