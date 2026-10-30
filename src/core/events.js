/** Bus de eventos mínimo. Game, Match y la UI se hablan solo por aquí. */
export class EventBus {
  #handlers = new Map();

  /** Suscribe `fn` a `type`. Devuelve una función para cancelar la suscripción. */
  on(type, fn) {
    if (!this.#handlers.has(type)) this.#handlers.set(type, new Set());
    this.#handlers.get(type).add(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    this.#handlers.get(type)?.delete(fn);
  }

  emit(type, payload) {
    for (const fn of [...(this.#handlers.get(type) ?? [])]) {
      try {
        fn(payload);
      } catch (err) {
        // Un panel roto no debe tumbar al resto.
        console.error(`[events] error en un manejador de "${type}"`, err);
      }
    }
  }
}
