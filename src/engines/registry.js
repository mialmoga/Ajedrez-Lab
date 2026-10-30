/**
 * Registro de motores. Para añadir uno:
 *
 *   registerEngine('mi-motor', {
 *     name: 'Mi motor',
 *     description: '...',
 *     levels: [{ id: '1', name: 'Fácil', limits: { depth: 2 } }, ...],
 *     create: async () => new MiMotor(),
 *   });
 *
 * y listo: aparece solo en los selectores de la UI.
 */
const entries = new Map();

export function registerEngine(id, spec) {
  if (entries.has(id)) console.warn(`[engines] "${id}" ya estaba registrado; se reemplaza`);
  entries.set(id, { id, levels: [], description: '', ...spec });
}

export function listEngines() {
  return [...entries.values()].map(({ create, ...info }) => info);
}

export function getEngineInfo(id) {
  const e = entries.get(id);
  if (!e) return null;
  const { create, ...info } = e;
  return info;
}

/** Crea e inicializa una instancia nueva (cada lado de la partida tiene la suya). */
export async function createEngine(id) {
  const e = entries.get(id);
  if (!e) throw new Error(`Motor desconocido: ${id}`);
  const engine = await e.create();
  await engine.init();
  return engine;
}
