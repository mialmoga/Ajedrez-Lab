/**
 * Detector de aperturas: dada la partida actual, dice qué líneas de la librería siguen vivas,
 * cuál es la jugada siguiente más probable, y explica la última jugada si está en la librería.
 * Compara por POSICIÓN (FEN), no por orden de jugadas: detecta transposiciones.
 */

/** Agrupa las siguientes jugadas de un conjunto de coincidencias. */
function aggregateNext(hits) {
  const byUci = new Map();
  let total = 0;
  for (const { line, i } of hits) {
    const next = line.moves[i];
    if (!next) continue;
    total += line.weight;
    if (!byUci.has(next.uci)) byUci.set(next.uci, { uci: next.uci, san: next.san, weight: 0, lines: [], notes: [] });
    const e = byUci.get(next.uci);
    e.weight += line.weight;
    e.lines.push({ id: line.id, name: line.name });
    if (next.nota && !e.notes.includes(next.nota)) e.notes.push(next.nota);
  }
  return [...byUci.values()]
    .map((e) => ({ ...e, pct: total ? Math.round((e.weight / total) * 100) : 0 }))
    .sort((a, b) => b.weight - a.weight);
}

/**
 * @param {import('./library.js').Library} library
 * @param {import('../core/game.js').Game} game
 */
export function analyze(library, game) {
  const hits = library.positionsFor(game.fen);
  const gameUci = game.uciHistory;

  const alive = hits.map(({ line, i }) => {
    const prefix = line.moves.slice(0, i).map((m) => m.uci);
    const exact = prefix.length === gameUci.length && prefix.every((u, k) => u === gameUci[k]);
    return { line, i, exact, next: line.moves[i] ?? null, finished: i >= line.moves.length };
  });
  alive.sort((a, b) => Number(b.exact) - Number(a.exact) || b.line.weight - a.line.weight);

  const nextMoves = aggregateNext(hits);

  // Explicación de la última jugada (solo líneas cuya jugada previa coincide con la jugada real).
  const last = game.lastMove;
  const lastMoveNotes = [];
  if (last) {
    const lu = last.from + last.to + (last.promotion ?? '');
    for (const { line, i } of hits) {
      const prev = i > 0 ? line.moves[i - 1] : null;
      if (prev && prev.uci === lu && prev.nota && !lastMoveNotes.some((n) => n.nota === prev.nota)) {
        lastMoveNotes.push({ san: prev.san, nota: prev.nota, line: line.name });
      }
    }
  }

  // Si salimos de la librería: dónde y qué esperaba.
  let leftAtPly = null;
  let expected = [];
  if (hits.length === 0 && game.ply > 0) {
    for (let j = game.ply - 1; j >= 0; j--) {
      const h = library.positionsFor(game.fens[j]);
      if (h.length) {
        leftAtPly = j;
        expected = aggregateNext(h);
        break;
      }
    }
  }

  return {
    inBook: hits.length > 0,
    alive,
    nextMoves,
    lastMoveNotes,
    leftAtPly,
    expected,
    totalLines: library.lines.length,
  };
}

/** Elige una jugada de la librería (ponderada por peso) para usarla como libro de aperturas. */
export function pickBookMove(library, fen) {
  const next = aggregateNext(library.positionsFor(fen));
  if (!next.length) return null;
  const total = next.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const e of next) {
    r -= e.weight;
    if (r <= 0) return e.uci;
  }
  return next[0].uci;
}
