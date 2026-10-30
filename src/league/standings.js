/**
 * Tabla, matriz de resultados y Elo estimado de una liga. Lógica pura (sin DOM ni motores).
 * Un juego: { blancas:id, negras:id, resultado:'1-0'|'0-1'|'1/2-1/2' }.
 */
import { gamePoints } from '../tournament/bracket.js';

export function finishedGames(cruces) {
  return cruces.flatMap((c) => c.pares.flatMap((p) => p.partidas.filter(Boolean)));
}

/** Filas ordenadas: puntos → enfrentamientos directos entre empatados → victorias → semilla. */
export function standings(participantes, cruces) {
  const rows = new Map(participantes.map((p) => [p.id, { id: p.id, semilla: p.semilla, pj: 0, g: 0, t: 0, d: 0, pts: 0 }]));
  const h2h = new Map(); // "a|b" -> puntos de a contra b
  const add = (a, b, pts) => h2h.set(`${a}|${b}`, (h2h.get(`${a}|${b}`) ?? 0) + pts);
  for (const g of finishedGames(cruces)) {
    for (const [me, rival] of [[g.blancas, g.negras], [g.negras, g.blancas]]) {
      const pts = gamePoints(g, me), r = rows.get(me);
      r.pj++; r.pts += pts;
      if (pts === 1) r.g++; else if (pts === 0.5) r.t++; else r.d++;
      add(me, rival, pts);
    }
  }
  const list = [...rows.values()];
  const groups = new Map();
  for (const r of list) groups.set(r.pts, [...(groups.get(r.pts) ?? []), r]);
  for (const grupo of groups.values()) {
    for (const r of grupo) r.directo = grupo.reduce((s, o) => s + (o === r ? 0 : h2h.get(`${r.id}|${o.id}`) ?? 0), 0);
  }
  list.sort((x, y) => y.pts - x.pts || (y.directo ?? 0) - (x.directo ?? 0) || y.g - x.g || x.semilla - y.semilla);
  list.forEach((r, i) => { r.pos = i + 1; });
  return list;
}

/** matriz[a][b] = puntos de a contra b (null si aún no jugaron). */
export function crossTable(participantes, cruces) {
  const m = {};
  for (const p of participantes) { m[p.id] = {}; for (const q of participantes) m[p.id][q.id] = null; }
  for (const g of finishedGames(cruces)) {
    for (const [me, rival] of [[g.blancas, g.negras], [g.negras, g.blancas]]) m[me][rival] = (m[me][rival] ?? 0) + gamePoints(g, me);
  }
  return m;
}

const K = Math.LN10 / 400;
const expected = (elo, opp) => 1 / (1 + 10 ** ((opp - elo) / 400));

/**
 * Elo estimado por máxima verosimilitud, anclado en participantes con Elo conocido (p. ej. Stockfish limitado).
 * Cada estimación lleva una partida virtual (tablas) contra el promedio de los anclajes para evitar valores
 * infinitos con 100 % o 0 % de puntos. `err` es el margen al 95 %.
 * @param {string[]} ids  @param {object[]} games  @param {Map<string,number>} anchors id → Elo
 * @returns {Map<string,{elo:number, err:number, ancla:boolean, n:number}>|null} null si no hay anclajes
 */
export function estimateElo(ids, games, anchors) {
  if (!anchors?.size) return null;
  const mean = [...anchors.values()].reduce((s, v) => s + v, 0) / anchors.size;
  const elo = new Map(ids.map((id) => [id, anchors.get(id) ?? mean]));
  const hist = new Map(ids.map((id) => [id, []]));
  for (const g of games) {
    hist.get(g.blancas)?.push({ opp: g.negras, s: gamePoints(g, g.blancas) });
    hist.get(g.negras)?.push({ opp: g.blancas, s: gamePoints(g, g.negras) });
  }
  const free = ids.filter((id) => !anchors.has(id) && hist.get(id).length);
  const info = new Map();
  for (let it = 0; it < 200; it++) {
    for (const id of free) {
      const games_ = hist.get(id);
      let S = 0.5, E = expected(elo.get(id), mean), I = E * (1 - E); // partida virtual
      for (const { opp, s } of games_) {
        const e = expected(elo.get(id), elo.get(opp));
        S += s; E += e; I += e * (1 - e);
      }
      const step = Math.max(-150, Math.min(150, (S - E) / (K * I)));
      elo.set(id, elo.get(id) + step);
      info.set(id, I);
    }
  }
  const out = new Map();
  for (const id of ids) {
    if (anchors.has(id)) out.set(id, { elo: anchors.get(id), err: 0, ancla: true, n: hist.get(id).length });
    else if (hist.get(id).length) out.set(id, { elo: elo.get(id), err: 1.96 / (K * Math.sqrt(info.get(id))), ancla: false, n: hist.get(id).length });
  }
  return out;
}
