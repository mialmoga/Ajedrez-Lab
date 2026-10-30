/**
 * Lógica pura del cuadro de eliminación directa (sin motores, sin DOM): semillas, byes,
 * avance de ganadores, puntuación y decisión de cada cruce. Fácil de probar en Node.
 *
 * Un cruce (match) es un objeto serializable:
 *   { id:'r0m1', ronda, indice, a, b, bye, estado:'pendiente'|'en curso'|'terminado',
 *     ganador, puntos:{a,b}, decidido:'puntos'|'desempate'|'semilla'|'bye'|null,
 *     fuentes:[idA, idB], pares:[{ apertura:{nombre,jugadas}, partidas:[game|null, game|null] }] }
 * a/b son ids de participante, null (por definir) o 'BYE'.
 */
export const BYE = 'BYE';

export function bracketSize(n) {
  let s = 2;
  while (s < n) s *= 2;
  return s;
}

/** Orden estándar de semillas: 1 vs N, 4 vs N-3... (las mejores semillas reciben los byes). */
export function seedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const m = order.length * 2;
    order = order.flatMap((s) => [s, m + 1 - s]);
  }
  return order;
}

function newMatch(ronda, indice, a, b, fuentes = []) {
  return {
    id: `r${ronda}m${indice}`, ronda, indice, a, b, bye: false,
    estado: 'pendiente', ganador: null, puntos: { a: 0, b: 0 }, decidido: null,
    fuentes, pares: [],
  };
}

/** Crea las rondas para los ids de participantes (en orden de semilla). */
export function createRounds(ids) {
  const n = ids.length;
  if (n < 2 || n > 16) throw new Error('El torneo necesita entre 2 y 16 participantes');
  const size = bracketSize(n);
  const order = seedOrder(size);
  const slot = (seed) => (seed <= n ? ids[seed - 1] : BYE);

  const rounds = [[]];
  for (let i = 0; i < size / 2; i++) rounds[0].push(newMatch(0, i, slot(order[2 * i]), slot(order[2 * i + 1])));
  for (let r = 1, count = size / 4; count >= 1; r++, count /= 2) {
    rounds.push(Array.from({ length: count }, (_, i) => newMatch(r, i, null, null, [`r${r - 1}m${2 * i}`, `r${r - 1}m${2 * i + 1}`])));
  }
  for (const m of rounds[0]) {
    if (m.a === BYE || m.b === BYE) {
      m.bye = true;
      m.estado = 'terminado';
      m.decidido = 'bye';
      m.ganador = m.a === BYE ? m.b : m.a;
      advance(rounds, m);
    }
  }
  return rounds;
}

/** Coloca al ganador de `match` en su hueco de la siguiente ronda. */
export function advance(rounds, match) {
  const next = rounds[match.ronda + 1]?.[Math.floor(match.indice / 2)];
  if (!next) return;
  next[match.indice % 2 === 0 ? 'a' : 'b'] = match.ganador;
}

/** Puntos de un participante en una partida: 1, 0.5 o 0. */
export function gamePoints(game, participantId) {
  if (game.resultado === '1/2-1/2') return 0.5;
  return (game.resultado === '1-0') === (game.blancas === participantId) ? 1 : 0;
}

export function seriesScore(match) {
  let a = 0, b = 0;
  for (const pair of match.pares) {
    for (const g of pair.partidas) {
      if (!g) continue;
      a += gamePoints(g, match.a);
      b += gamePoints(g, match.b);
    }
  }
  return { a, b };
}

/**
 * Siguiente paso de un cruce:
 *   { action: 'finish-pair' }  hay una pareja de partidas a medias (reanudar)
 *   { action: 'play-pair' }    toca abrir una pareja nueva
 *   { action: 'decided', winner, by }
 * @param {{juegosPorCruce:number, maxParesDesempate:number}} config
 * @param {(id:string)=>number} seedOf  semilla del participante (menor = mejor)
 */
export function nextStep(match, config, seedOf) {
  if (match.pares.some((p) => !p.partidas.every(Boolean))) return { action: 'finish-pair' };
  const base = Math.max(1, Math.floor(config.juegosPorCruce / 2));
  if (match.pares.length < base) return { action: 'play-pair' };
  const { a, b } = seriesScore(match);
  if (a !== b) return { action: 'decided', winner: a > b ? match.a : match.b, by: match.pares.length > base ? 'desempate' : 'puntos' };
  if (match.pares.length >= base + config.maxParesDesempate) {
    return { action: 'decided', winner: seedOf(match.a) <= seedOf(match.b) ? match.a : match.b, by: 'semilla' };
  }
  return { action: 'play-pair' };
}

/** 1.5 → "1½", 2 → "2", 0.5 → "½" */
export function fmtPoints(n) {
  const whole = Math.floor(n);
  const half = n - whole >= 0.5;
  return half ? (whole ? `${whole}½` : '½') : String(whole);
}

/** Título de ronda según su distancia a la final. */
export function roundTitle(index, total) {
  const fromEnd = total - 1 - index;
  return ['Final', 'Semifinal', 'Cuartos de final', 'Octavos de final'][fromEnd] ?? `Ronda ${index + 1}`;
}
