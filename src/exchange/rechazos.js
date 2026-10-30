/**
 * Contador de respuestas rechazadas de la partida actual (intercambio por PNG / texto).
 * Sirve para comparar cuántas jugadas ilegales comete una IA con cada ayuda. Se reinicia con cada partida nueva.
 */
export class Rechazos {
  constructor() { this.items = []; }
  get n() { return this.items.length; }
  add(texto, motivo) { this.items.push({ texto: String(texto).slice(0, 200), motivo }); }
  reset() { this.items = []; }
}
