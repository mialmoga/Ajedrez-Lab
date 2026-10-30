/**
 * Guardado de torneos en el navegador (localStorage), un registro por torneo.
 * Además de esto, el torneo se puede exportar/importar como archivo JSON (formato torneo@1).
 */

function safe(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

/** Crea un almacén con su propio prefijo (torneos, ligas...). */
export function createStore(PREFIX, LAST) {
  return {
  /** Lista de torneos guardados: [{ id, nombre, estado, actualizado }] (más recientes primero). */
  list() {
    return safe(() => {
      const out = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k?.startsWith(PREFIX)) continue;
        const d = JSON.parse(localStorage.getItem(k));
        out.push({ id: d.id, nombre: d.nombre, estado: d.estado, actualizado: d.actualizado });
      }
      return out.sort((a, b) => String(b.actualizado).localeCompare(String(a.actualizado)));
    }, []);
  },
  load(id) {
    return safe(() => JSON.parse(localStorage.getItem(PREFIX + id)), null);
  },
  /** @returns {boolean} false si no cupo (cuota de almacenamiento) */
  save(data) {
    return safe(() => {
      localStorage.setItem(PREFIX + data.id, JSON.stringify(data));
      localStorage.setItem(LAST, data.id);
      return true;
    }, false);
  },
  remove(id) {
    safe(() => localStorage.removeItem(PREFIX + id));
  },
  lastId() {
    return safe(() => localStorage.getItem(LAST), null);
  },
  };
}

export const TournamentStore = createStore('ajedrez-lab:torneo:', 'ajedrez-lab:torneo-ultimo');
export const LeagueStore = createStore('ajedrez-lab:liga:', 'ajedrez-lab:liga-ultima');
