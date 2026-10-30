import { EventBus } from './events.js';

export const MODOS = ['prueba', 'practica'];

/**
 * Modo de la partida del tablero principal: «prueba» (sin ayudas) o «práctica» (con ayudas: 💡 y marcas).
 *
 *  - Se elige antes de la primera jugada y queda BLOQUEADO mientras dure la partida (no se puede cambiar con jugadas).
 *  - Cada partida nueva (reset sin jugadas) vuelve a «prueba»: las ayudas se activan a propósito, nunca por inercia.
 *  - `forzar()` es la única vía con jugadas hechas: la usan «Continuar desde aquí» (abre en práctica) y la recuperación
 *    de la partida guardada (conserva el modo con el que se jugó).
 *
 * `ayuda`: hay ayudas disponibles si el modo es práctica, si se está revisando una partida (un replay no admite trampa),
 * o si no juega ningún humano (motor contra motor: ver en qué se aparta cada motor de la jugada óptima).
 *
 * Eventos: 'change' { value, locked }
 */
export class GameMode extends EventBus {
  constructor(game, match, review = null) {
    super();
    this.game = game;
    this.match = match;
    this.review = review;
    this.value = 'prueba';
    game.on('change', (ev) => {
      if (ev.kind === 'reset' && game.ply === 0) this.value = 'prueba'; // partida nueva: de nuevo sin ayudas
      this.emit('change', { value: this.value, locked: this.locked });
    });
    // al revisar, solo avisa si cambia la disponibilidad de ayudas (entrar/salir del replay); avisar en cada paso
    // provocaba un redibujado extra SIN jugada y el 3D no animaba (ni estallaba) las piezas.
    let ayudaAntes = this.ayuda;
    review?.on('change', () => {
      const ahora = this.ayuda;
      if (ahora === ayudaAntes) return;
      ayudaAntes = ahora;
      this.emit('change', { value: this.value, locked: this.locked });
    });
  }

  /** Bloqueado desde la primera jugada. */
  get locked() { return this.game.ply > 0; }

  /** Cambia el modo desde el selector. Devuelve false si está bloqueado o el valor no existe. */
  set(value) {
    if (this.locked || !MODOS.includes(value)) return false;
    if (value !== this.value) { this.value = value; this.emit('change', { value, locked: this.locked }); }
    return true;
  }

  /** Fija el modo aunque haya jugadas (continuar desde un replay, recuperar una partida guardada). */
  forzar(value) {
    const v = MODOS.includes(value) ? value : 'prueba';
    this.value = v;
    this.emit('change', { value: v, locked: this.locked });
  }

  /** ¿Se pueden mostrar ayudas (💡, marcas) ahora? */
  get ayuda() {
    if (this.value === 'practica') return true;
    if (this.review?.active) return true;
    return !['w', 'b'].some((c) => this.match.players[c]?.kind === 'human');
  }
}
