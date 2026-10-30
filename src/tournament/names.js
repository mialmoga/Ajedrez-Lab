/** Nombres de luchadores para sugerir a los participantes (se pueden cambiar a mano). */
export const FIGHTER_NAMES = [
  'Dragón Rojo', 'Grulla Blanca', 'Tigre de Jade', 'Mono Borracho', 'El Cangrejo', 'Puño de Acero',
  'Sombra Veloz', 'Maestro Tortuga', 'Serpiente Dorada', 'Halcón Nocturno', 'Lobo Gris', 'Mantis Azul',
  'Fénix Cero', 'Bambú', 'Trueno Silente', 'Ninja del Peón', 'Rey Ermitaño', 'Torre Furiosa',
  'Alfil Fantasma', 'Caballo Loco', 'Dama de Hierro', 'Gambito', 'Zugzwang', 'El Enroque',
];

/** Un nombre que aún no esté en `used`. */
export function randomName(used = []) {
  const free = FIGHTER_NAMES.filter((n) => !used.includes(n));
  const pool = free.length ? free : FIGHTER_NAMES;
  return pool[Math.floor(Math.random() * pool.length)];
}
