/**
 * Autopsia del Minimax v2 contra Stockfish: juega unas partidas, juzga CADA jugada del v2 con un Stockfish más fuerte
 * y, en las que pierden ventaja, averigua POR QUÉ falló dándole más tiempo al mismo v2:
 *
 *   horizonte-corto  con ×4 de tiempo ya encuentra algo bueno  → le faltaba un poco de profundidad
 *   horizonte-largo  solo con ×16                              → la trampa estaba lejos
 *   evaluacion       ni con ×16                                → ve el problema pero lo juzga mal (evaluación, poda u orden)
 *
 *   node tools/autopsia.mjs                          # v2 «todo» contra Stockfish nivel p5, 4 partidas
 *   node tools/autopsia.mjs --config poda --nivel p4 --games 8
 *   node tools/autopsia.mjs --prof 14 --sondeos 4,16 --umbral 120 --time 500
 *
 * Opciones: --config (como en pruebas.mjs: todo, ninguna, un paquete, sin:<función>…) · --nivel p1…p7 · --games N ·
 *   --time MS (tope del v2 por jugada, 500) · --prof N (profundidad del Stockfish que juzga, 16) ·
 *   --sondeos 4,16 (multiplicadores de tiempo) · --umbral CP (pérdida que cuenta como error, 120) · --max-plies N (160) ·
 *   --salida nombre (prefijo de los archivos, por defecto «autopsia»)
 * Genera: <salida>.md (el informe), <salida>.pgn (las partidas con los errores anotados: ábrelo en el replay de la app)
 * y <salida>.json (los datos). Necesita Node 18+. Detalles en docs/PRUEBAS.md.
 */
import { writeFileSync } from 'node:fs';
import { Chess } from '../src/core/chess.js';
import { search as searchV2 } from '../src/engines/minimax2/minimax2-core.js';
import { NIVELES_SF, APERTURAS, featuresDe, Stockfish, prepararStockfish } from './comun.mjs';
import { perdida, causaDelError, fase, tipoDeJugada, resumirErrores, MATE_CP, UMBRAL_ERROR } from './autopsia-nucleo.mjs';

const arg = (k, def) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : def; };
const config = arg('config', 'todo');
const nivel = arg('nivel', 'p5');
const partidas = Number(arg('games', 4));
const tiempo = Number(arg('time', 500));
const prof = Number(arg('prof', 16));
const sondeos = arg('sondeos', '4,16').split(',').map(Number).filter((x) => x > 0);
const umbral = Number(arg('umbral', UMBRAL_ERROR));
const maxPlies = Number(arg('max-plies', 160));
const salida = arg('salida', 'autopsia');
if (!NIVELES_SF[nivel]) { console.error(`Nivel desconocido: ${nivel} (usa ${Object.keys(NIVELES_SF).join(', ')})`); process.exit(1); }
let features; try { features = featuresDe(config); } catch (e) { console.error(e.message); process.exit(1); }
const sfDepth = NIVELES_SF[nivel];

const ruta = prepararStockfish();
const rival = await Stockfish.crear(ruta); // el que juega contra el v2
const juez = await Stockfish.crear(ruta); // el que juzga (más profundo)

const uciA = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
const sanDe = (fen, u) => { try { return new Chess(fen).move(uciA(u))?.san ?? u; } catch { return u; } };
const fmt = (cp) => `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(1)}`;
const pc = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : '—');

const partidasHechas = [];
const errores = [];
let cerrando = false;

/** Posición terminal: score para quien mueve (mate = perdió). */
function scoreTerminal(c) { return c.isCheckmate() ? { cp: -MATE_CP } : { cp: 0 }; }

async function jugarYAnalizar(g) {
  const v2Blancas = g % 2 === 0;
  const c = new Chess();
  const hist = [], ucis = [], jugadas = [];
  const libro = APERTURAS[Math.floor(g / 2) % APERTURAS.length].split(' ');
  for (const u of libro) { hist.push(c.fen()); const m = c.move(uciA(u)); ucis.push(u); jugadas.push({ uci: u, san: m.san, v2: false, libro: true, fenAntes: hist[hist.length - 1] }); }

  // --- 1. la partida ---
  while (!c.isGameOver() && ucis.length < maxPlies && !cerrando) {
    const v2Mueve = (c.turn() === 'w') === v2Blancas;
    const fenAntes = c.fen();
    let uci, info = null;
    if (v2Mueve) { info = searchV2(fenAntes, { depth: 30, time: tiempo, noise: 0, historial: hist.slice(), features }); uci = info?.move; }
    else uci = await rival.mejor(ucis, sfDepth);
    if (!uci) break;
    hist.push(fenAntes);
    let m; try { m = c.move(uciA(uci)); } catch { break; }
    ucis.push(uci);
    jugadas.push({ uci, san: m.san, v2: v2Mueve, fenAntes, profundidad: info?.depth ?? null });
  }
  const resultado = c.isCheckmate() ? ((c.turn() === 'w') ? '0-1' : '1-0') : (c.isGameOver() ? '1/2-1/2' : '*');
  const puntosV2 = resultado === '*' || resultado === '1/2-1/2' ? 0.5 : ((resultado === '1-0') === v2Blancas ? 1 : 0);

  // --- 2. juicio de cada posición con el Stockfish fuerte ---
  const N = jugadas.length;
  const E = []; // E[k] = { score (de quien mueve), mejor } de la posición tras k jugadas
  const tab = new Chess();
  for (let k = 0; k <= N; k++) {
    if (tab.isGameOver()) E.push({ score: scoreTerminal(tab), mejor: null });
    else { const a = await juez.analizar(ucis.slice(0, k), prof); E.push({ score: a.score, mejor: a.mejor }); }
    if (k < N) tab.move(uciA(ucis[k]));
  }

  // --- 3. pérdida por jugada y diagnóstico de los errores del v2 ---
  const acpl = { v2: { sum: 0, n: 0, fase: {} }, rival: { sum: 0, n: 0 } };
  for (let k = libro.length; k < N; k++) {
    const j = jugadas[k];
    const p = E[k].mejor === j.uci ? 0 : perdida(E[k].score, E[k + 1].score);
    j.perdida = p;
    if (p == null) continue;
    const bando = j.v2 ? acpl.v2 : acpl.rival;
    bando.sum += p; bando.n++;
    const ply = k; const f = fase(ply, j.fenAntes);
    j.fase = f;
    if (j.v2) { acpl.v2.fase[f] ??= { sum: 0, n: 0 }; acpl.v2.fase[f].sum += p; acpl.v2.fase[f].n++; }
    if (!j.v2 || p < umbral) continue;

    // el v2 perdió ventaja: ¿era profundidad o evaluación?
    const probas = [];
    for (const factor of sondeos) {
      const r = searchV2(j.fenAntes, { depth: 30, time: tiempo * factor, noise: 0, historial: hist.slice(0, k), features });
      const mv = r?.move;
      let pp;
      if (!mv) pp = null;
      else if (mv === j.uci) pp = p;
      else if (mv === E[k].mejor) pp = 0;
      else pp = perdida(E[k].score, (await juez.analizar([...ucis.slice(0, k), mv], prof)).score);
      probas.push({ factor, jugada: mv ? sanDe(j.fenAntes, mv) : null, perdida: pp, profundidad: r?.depth ?? null });
      if (pp != null && pp < umbral) break;
    }
    const { causa, factor } = causaDelError(probas, umbral);
    const sanMejor = E[k].mejor ? sanDe(j.fenAntes, E[k].mejor) : null;
    const err = {
      partida: g + 1, ply: k + 1, numero: Math.floor(k / 2) + 1, color: k % 2 === 0 ? 'w' : 'b', fen: j.fenAntes,
      san: j.san, mejor: sanMejor, perdida: p, profundidadV2: j.profundidad, causa, factor, fase: f,
      tipoV2: tipoDeJugada(j.san), tipoMejor: sanMejor ? tipoDeJugada(sanMejor) : 'tranquila', sondeos: probas,
      evalAntes: E[k].score, // del bando que mueve
    };
    j.error = err;
    errores.push(err);
  }

  // --- 4. PGN anotado ---
  const nombreV2 = `Minimax v2 (${config})`, nombreSf = `Stockfish 19 (${nivel}, prof. ${sfDepth})`;
  let mov = '';
  jugadas.forEach((j, k) => {
    if (k % 2 === 0) mov += `${Math.floor(k / 2) + 1}. `;
    else if (k === 0) mov += '1... ';
    mov += j.san;
    if (j.error) {
      const e = j.error;
      mov += e.perdida >= 300 ? '??' : '?';
      mov += ` {pierde ${(e.perdida / 100).toFixed(1)} · mejor ${e.mejor ?? '?'} · causa: ${e.causa}${e.factor ? ` (con ×${e.factor} de tiempo la encuentra)` : ''} · v2 llegó a prof. ${e.profundidadV2 ?? '?'}}`;
    }
    mov += ' ';
  });
  const pgn = `[Event "Autopsia ${nombreV2} vs ${nombreSf}"]\n[Round "${g + 1}"]\n[White "${v2Blancas ? nombreV2 : nombreSf}"]\n[Black "${v2Blancas ? nombreSf : nombreV2}"]\n[Result "${resultado}"]\n\n${mov.trim()} ${resultado}\n`;
  return { g: g + 1, v2Blancas, resultado, puntosV2, plies: N, acpl, pgn, errores: jugadas.filter((j) => j.error).length };
}

process.on('SIGINT', () => { cerrando = true; console.log('\nInterrumpido: se termina la partida en curso y se escribe el informe con lo que haya…'); });
console.log(`Autopsia: Minimax v2 «${config}» (${tiempo} ms) contra Stockfish ${nivel} · ${partidas} partidas · juez a profundidad ${prof} · sondeos ×${sondeos.join(', ×')} · error = pérdida ≥ ${umbral} cp`);
const t0 = Date.now();
for (let g = 0; g < partidas && !cerrando; g++) {
  const r = await jugarYAnalizar(g);
  partidasHechas.push(r);
  console.log(`  partida ${r.g}/${partidas}: ${r.v2Blancas ? 'v2 blancas' : 'v2 negras'} · ${r.resultado} · ${r.plies} jugadas · ${r.errores} errores del v2 · ${((Date.now() - t0) / 60000).toFixed(1)} min`);
}
rival.cerrar(); juez.cerrar();
if (!partidasHechas.length) process.exit(0);

// ------------------------------------------------------------------ informe
const res = resumirErrores(errores);
const sumV2 = partidasHechas.reduce((a, r) => a + r.acpl.v2.sum, 0), nV2 = partidasHechas.reduce((a, r) => a + r.acpl.v2.n, 0);
const sumSf = partidasHechas.reduce((a, r) => a + r.acpl.rival.sum, 0), nSf = partidasHechas.reduce((a, r) => a + r.acpl.rival.n, 0);
const porFase = {};
for (const r of partidasHechas) for (const [f, x] of Object.entries(r.acpl.v2.fase)) { porFase[f] ??= { sum: 0, n: 0 }; porFase[f].sum += x.sum; porFase[f].n += x.n; }
const G = partidasHechas.filter((r) => r.puntosV2 === 1).length, P = partidasHechas.filter((r) => r.puntosV2 === 0 && r.resultado !== '*' && r.resultado !== '1/2-1/2').length, T = partidasHechas.length - G - P;
const orden = ['horizonte-corto', 'horizonte-largo', 'evaluacion', 'sin-sondeo'];
const s1 = sondeos[0], sN = sondeos.at(-1);
const EXPLICA = {
  'horizonte-corto': `Con ×${s1} de tiempo ya juega bien: le faltaba poca profundidad. Ayudan las mejoras de búsqueda (poda, orden de jugadas, extensiones) o más tiempo.`,
  'horizonte-largo': `Solo con más tiempo (hasta ×${sN}) lo ve: la trampa está lejos. Cuesta arreglarlo con búsqueda; suele ser táctica profunda.`,
  evaluacion: `Ni con ×${sN} de tiempo acierta: ve el problema pero lo juzga mal (o la poda lo descarta). Aquí está el conocimiento que falta en la evaluación.`,
  'sin-sondeo': 'No se hizo sondeo.',
};
const tabla = (obj, claves) => claves.filter((k) => obj[k]).map((k) => `| ${k} | ${obj[k]} | ${pc(obj[k], res.total)} |`).join('\n');
const top = [...errores].sort((a, b) => b.perdida - a.perdida).slice(0, 15);
const md = [
  `# Autopsia del Minimax v2 («${config}») contra Stockfish ${nivel}`,
  '',
  `${partidasHechas.length} partidas · v2 a ${tiempo} ms por jugada · juez Stockfish a profundidad ${prof} · error = pérdida ≥ ${umbral / 100} peones · sondeos ×${sondeos.join(', ×')} de tiempo.`,
  `Resultado del v2: ${G} ganadas, ${T} tablas/sin terminar, ${P} perdidas.`,
  '',
  '## Calidad de juego',
  `- Pérdida media por jugada (ACPL): **v2 ${nV2 ? (sumV2 / nV2).toFixed(0) : '—'} cp** · Stockfish ${nivel} ${nSf ? (sumSf / nSf).toFixed(0) : '—'} cp (menos es mejor; ${nV2} y ${nSf} jugadas).`,
  ...Object.entries(porFase).map(([f, x]) => `- v2 en ${f}: ${(x.sum / x.n).toFixed(0)} cp por jugada (${x.n} jugadas)`),
  '',
  `## Errores del v2: ${res.total}`,
  res.total ? `Pérdida media por error: ${(res.perdidaMedia / 100).toFixed(1)} peones.` : 'Ninguno por encima del umbral.',
  '',
  '### Por causa',
  '| causa | errores | % |', '|---|---|---|', tabla(res.porCausa, orden),
  '',
  ...orden.filter((k) => res.porCausa[k]).map((k) => `- **${k}**: ${EXPLICA[k]}`),
  '',
  '### Por fase', '| fase | errores | % |', '|---|---|---|', tabla(res.porFase, ['apertura', 'medio', 'final']),
  '',
  `### Tácticas perdidas`,
  `${res.tacticaPerdida} de ${res.total} errores (${pc(res.tacticaPerdida, res.total)}): la mejor era una captura o un jaque y el v2 jugó una tranquila.`,
  '',
  `## Los ${top.length} peores errores`,
  ...top.map((e) => `- Partida ${e.partida}, jugada ${e.numero}${e.color === 'w' ? '.' : '…'} **${e.san}** (pierde ${(e.perdida / 100).toFixed(1)}; mejor **${e.mejor ?? '?'}**) · ${e.fase} · v2 llegó a prof. ${e.profundidadV2 ?? '?'} · causa: ${e.causa}${e.factor ? ` (×${e.factor})` : ''}\n  - FEN: \`${e.fen}\`${e.sondeos.length ? `\n  - sondeos: ${e.sondeos.map((s) => `×${s.factor} → ${s.jugada ?? '—'} (pierde ${s.perdida != null ? (s.perdida / 100).toFixed(1) : '?'}, prof. ${s.profundidad ?? '?'})`).join(' · ')}` : ''}`),
  '',
  `Las partidas completas, con cada error anotado, están en \`${salida}.pgn\`: ábrelo en el replay de la app (Importar) para ver cada posición en el tablero.`,
  '',
].join('\n');
writeFileSync(`${salida}.md`, md);
writeFileSync(`${salida}.pgn`, partidasHechas.map((r) => r.pgn).join('\n'));
writeFileSync(`${salida}.json`, JSON.stringify({ config, nivel, tiempo, prof, sondeos, umbral, partidas: partidasHechas.map(({ pgn, ...r }) => r), errores }, null, 1));

console.log('\n' + md.split('\n## Los ')[0]);
console.log(`Escrito: ${salida}.md · ${salida}.pgn · ${salida}.json  (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
process.exit(0);
