import { Chess, DEFAULT_POSITION } from '../core/chess.js';

/**
 * Elige la apertura de una pareja de partidas (las dos partidas, con colores cambiados, parten
 * de la misma): así los motores deterministas no repiten siempre la misma partida y la pareja es justa.
 * Con librería: un prefijo (4–10 jugadas) de una línea, ponderado por `peso`.
 * Sin librería: 4 jugadas legales al azar.
 * @returns {{ nombre: string, jugadas: string[] }}  jugadas en UCI
 */
export function pickOpening(library, { minPlies = 4, maxPlies = 10, random = Math.random } = {}) {
  const lines = (library?.lines ?? []).filter((l) => l.startFen === DEFAULT_POSITION && l.moves.length >= minPlies);
  if (lines.length) {
    const total = lines.reduce((s, l) => s + l.weight, 0);
    let r = random() * total;
    let line = lines[lines.length - 1];
    for (const l of lines) {
      r -= l.weight;
      if (r <= 0) { line = l; break; }
    }
    const top = Math.min(maxPlies, line.moves.length);
    const k = minPlies + Math.floor(random() * (top - minPlies + 1));
    return { nombre: line.name, jugadas: line.moves.slice(0, k).map((m) => m.uci) };
  }
  for (let intento = 0; intento < 20; intento++) {
    const chess = new Chess();
    const jugadas = [];
    for (let i = 0; i < minPlies; i++) {
      const moves = chess.moves({ verbose: true });
      if (!moves.length) break;
      const m = moves[Math.floor(random() * moves.length)];
      chess.move(m);
      jugadas.push(m.from + m.to + (m.promotion ?? ''));
    }
    if (!chess.isGameOver()) return { nombre: 'Aleatoria', jugadas };
  }
  return { nombre: 'Posición inicial', jugadas: [] };
}
