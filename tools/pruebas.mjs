#!/usr/bin/env node
/**
 * Pruebas del Minimax v2: varias "suites" (exámenes) en un solo archivo, que se corren por separado.
 *
 *   node tools/pruebas.mjs --suite lista        # muestra las suites y qué contiene cada una
 *   node tools/pruebas.mjs --suite v1-fuerte    # cada función sola contra el v1, profundidad 6 (la ablación original)
 *   node tools/pruebas.mjs --suite v1-corto     # lo mismo con tope de 300 ms (aquí la poda sí gana profundidad)
 *   node tools/pruebas.mjs --suite v1-paquetes  # paquetes de funciones que deben ir juntas, contra el v1, 300 ms
 *   node tools/pruebas.mjs --suite sf-p5        # esos paquetes contra Stockfish 19 por profundidad 8 (nivel p5)
 *
 * Opciones:
 *   --games N       partidas por configuración (por defecto 40; con 20 y luego 40 solo se juegan las que faltan)
 *   --jobs N        partidas a la vez (por defecto, la mitad de tus hilos: el v2 juega con límite de tiempo)
 *   --only a,b,c    solo esas configuraciones (funciones, paquetes, "todo", "ninguna" o "sin:<función>")
 *   --menos a,b     prueba "todo menos a", "todo menos b"… (más "todo" y "ninguna" de referencia)
 *   --nivel p4      cambia el nivel de Stockfish de las suites sf-*  (p1…p7 = profundidad 1,2,4,6,8,12,16)
 *   --depth N --time MS    cambia el ritmo de la suite
 *   --sin-adjudicar partidas que llegan al tope de jugadas = tablas sin más (antes se adjudican con Stockfish)
 *   --adj-cp N      ventaja (centipeones) que da la victoria al adjudicar (por defecto 300); --adj-depth N profundidad (12)
 *   --sin-dibujos   sin los peones a espadazos
 *   --probar-stockfish    comprueba que el Stockfish responde en tu equipo y sale
 *
 * Configuraciones: "ninguna" = v2 con todo apagado (es el v1: CONTROL); "todo" = el v2 por defecto; una función suelta =
 * solo esa encendida; un paquete = varias encendidas a la vez; "sin:nullMove" = todo menos esa.
 * Necesita Node 18 o superior. Guarda el avance en un JSON por suite: si cortas con Ctrl+C y lanzas el mismo comando,
 * continúa donde iba. Detalles en docs/PRUEBAS.md.
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus, tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from '../src/core/chess.js';
import { search as searchV2, DEFAULT_FEATURES } from '../src/engines/minimax2/minimax2-core.js';
import { search as searchV1 } from '../src/engines/minimax/minimax-core.js';
import { cpParaV2, adjudicar, UMBRAL_DEFECTO, PROFUNDIDAD_ADJ } from './adjudicar.mjs';
import { NIVELES_SF, APERTURAS, FUNCIONES, TODO_APAGADO, PAQUETES, featuresDe, Stockfish, prepararStockfish } from './comun.mjs';

// ------------------------------------------------------------------ definiciones
const RITMOS = {
  fuerte: { depth: 6, time: 3000, desc: 'profundidad 6, tope 3 s' },
  corto: { depth: 30, time: 300, desc: 'tope 300 ms' },
  sf: { depth: 30, time: 500, desc: 'tope 500 ms' },
};

const MAX_PLIES = Number(process.env.PRUEBAS_MAX_PLIES) || 160; // PRUEBAS_MAX_PLIES solo sirve para probar la adjudicación sin jugar 160 jugadas // más largo = tablas
const INDIVIDUALES = ['todo', 'ninguna', ...FUNCIONES];
const DE_PAQUETES = ['ninguna', 'todo', ...Object.keys(PAQUETES)];

const SUITES = {
  'v1-fuerte': {
    desc: 'Cada función encendida sola contra el v1, profundidad 6 y tope 3 s. Mide la evaluación; la poda no puede lucirse con un tope de profundidad.',
    rival: { tipo: 'v1' }, ritmo: 'fuerte', configs: INDIVIDUALES, archivo: 'ablacion-resultados-fuerte.json', // el mismo archivo de la ablación original
  },
  'v1-corto': {
    desc: 'Cada función sola contra el v1 con tope de 300 ms. Aquí la velocidad de la poda se convierte en profundidad.',
    rival: { tipo: 'v1' }, ritmo: 'corto', configs: INDIVIDUALES,
  },
  'v1-paquetes': {
    desc: 'Paquetes de funciones contra el v1 con tope de 300 ms.',
    rival: { tipo: 'v1' }, ritmo: 'corto', configs: DE_PAQUETES,
  },
  'sf-p5': {
    desc: 'Paquetes contra Stockfish 19 limitado por profundidad 8 (nivel p5). Un rival distinto da partidas más decisivas. Calibra el nivel con --nivel p4 / p6.',
    rival: { tipo: 'stockfish', nivel: 'p5' }, ritmo: 'sf', configs: DE_PAQUETES,
  },
};

// ------------------------------------------------------------------ una partida
/** Juega una partida v2(nombre) contra el rival. Devuelve { puntos: 1 (gana v2) | 0.5 | 0, plies, fin }. */
async function jugar({ nombre, apertura, v2Blancas }, { depth, time, rival, sfPath, sfDepth, adj }) {
  const features = featuresDe(nombre);
  const c = new Chess();
  const hist = [], ucis = [];
  for (const u of APERTURAS[apertura % APERTURAS.length].split(' ')) { hist.push(c.fen()); c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); ucis.push(u); }
  const sf = rival === 'stockfish' ? await Stockfish.crear(sfPath) : null;
  let plies = 0, adjudicada = null;
  try {
    while (!c.isGameOver() && plies < MAX_PLIES) {
      const v2Mueve = (c.turn() === 'w') === v2Blancas;
      let move;
      if (v2Mueve) move = searchV2(c.fen(), { depth, time, noise: 0, historial: hist.slice(), features })?.move;
      else if (sf) move = await sf.mejor(ucis, sfDepth);
      else move = searchV1(c.fen(), { depth, time, noise: 0 })?.move;
      if (!move) throw new Error(`${v2Mueve ? 'el v2' : sf ? 'Stockfish' : 'el v1'} no devolvió jugada en la jugada ${plies + 1} (posición ${c.fen()})`);
      hist.push(c.fen());
      try { c.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }); } catch { return { puntos: v2Mueve ? 0 : 1, plies, fin: `ilegal (${v2Mueve ? 'v2' : 'rival'})` }; } // jugada ilegal = pierde quien la hizo
      ucis.push(move);
      plies++;
    }
    if (adj && !c.isGameOver() && plies >= MAX_PLIES) { // tope de jugadas: se adjudica con Stockfish en vez de dar tablas sin más
      const juez = sf ?? await Stockfish.crear(sfPath);
      try { adjudicada = { ...adjudicar(cpParaV2(await juez.evaluar(ucis, adj.depth), c.turn(), v2Blancas), adj.cp), plies }; }
      finally { if (!sf) juez.cerrar(); }
    }
  } finally { sf?.cerrar(); }
  if (c.isCheckmate()) return { puntos: (c.turn() === 'w') === v2Blancas ? 0 : 1, plies, fin: 'mate' }; // le toca mover al mateado
  if (adjudicada) return adjudicada;
  const fin = c.isStalemate() ? 'ahogado' : c.isThreefoldRepetition() ? 'repetición' : c.isInsufficientMaterial() ? 'material' : c.isDraw() ? '50 jugadas' : 'tope de jugadas';
  return { puntos: 0.5, plies, fin };
}

// ------------------------------------------------------------------ trabajador
if (!isMainThread) {
  parentPort.on('message', async (tarea) => {
    const t0 = Date.now();
    try { parentPort.postMessage({ ...tarea, ...(await jugar(tarea, workerData)), seg: (Date.now() - t0) / 1000 }); }
    catch (e) { parentPort.postMessage({ ...tarea, error: String(e?.message ?? e) }); }
  });
} else {
  // ---------------------------------------------------------------- proceso principal
  const arg = (k, def) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : def; };
  const nombreSuite = arg('suite', 'v1-fuerte');

  if (nombreSuite === 'lista') {
    console.log('Suites disponibles (node tools/pruebas.mjs --suite <nombre>):\n');
    for (const [n, s] of Object.entries(SUITES)) console.log(`  ${n.padEnd(12)} ${s.desc}\n${' '.repeat(15)}configuraciones: ${s.configs.join(', ')}\n`);
    console.log('Paquetes:'); for (const [n, f] of Object.entries(PAQUETES)) console.log(`  ${n.padEnd(12)} ${f.join(' + ')}`);
    console.log('\nTambién: --only sin:nullMove (todo menos esa), --menos a,b (todo menos cada una).');
    process.exit(0);
  }
  if (process.argv.includes('--probar-stockfish')) { // comprobación rápida: ¿responde el Stockfish en este equipo?
    const ruta = prepararStockfish();
    console.log(`Stockfish preparado en ${ruta}`);
    const t = Date.now();
    const sf = await Stockfish.crear(ruta);
    const m1 = await sf.mejor(['e2e4'], 6), m2 = await sf.mejor(['e2e4', 'e7e5', 'g1f3'], 6);
    sf.cerrar();
    console.log(`Responde: tras 1.e4 juega ${m1}; tras 1.e4 e5 2.Cf3 juega ${m2} (${Date.now() - t} ms). ${m1 && m2 ? 'Todo bien.' : '¡Algo falla!'}`);
    process.exit(m1 && m2 ? 0 : 1);
  }
  const suite = SUITES[nombreSuite];
  if (!suite) { console.error(`Suite desconocida: ${nombreSuite}. Usa --suite lista`); process.exit(1); }

  const ritmo = RITMOS[suite.ritmo];
  const depth = Number(arg('depth', ritmo.depth)), time = Number(arg('time', ritmo.time));
  const nivel = suite.rival.tipo === 'stockfish' ? arg('nivel', suite.rival.nivel) : null;
  if (nivel && !NIVELES_SF[nivel]) { console.error(`Nivel de Stockfish desconocido: ${nivel} (usa ${Object.keys(NIVELES_SF).join(', ')})`); process.exit(1); }
  const sfDepth = nivel ? NIVELES_SF[nivel] : null;
  const adjudicarOn = !process.argv.includes('--sin-adjudicar');
  const adjCp = Number(arg('adj-cp', UMBRAL_DEFECTO)), adjDepth = Number(arg('adj-depth', PROFUNDIDAD_ADJ));
  const adj = adjudicarOn ? { cp: adjCp, depth: adjDepth } : null;
  const games = Number(arg('games', 40));
  const jobs = Math.max(1, Number(arg('jobs', Math.floor(cpus().length / 2))));
  const menos = arg('menos', null)?.split(',').map((s) => s.trim());
  const only = arg('only', null)?.split(',').map((s) => s.trim());
  const nombres = menos ? ['todo', 'ninguna', ...menos.map((f) => `sin:${f}`)] : (only ?? suite.configs);
  try { nombres.forEach(featuresDe); } catch (e) { console.error(e.message); process.exit(1); }

  const rivalTxt = nivel ? `Stockfish 19 (nivel ${nivel}, profundidad ${sfDepth})` : 'el v1';
  const ritmoTxt = (arg('depth') || arg('time')) ? `profundidad ${depth}, tope ${time} ms` : ritmo.desc;
  const sufijo = [nivel && nivel !== suite.rival.nivel ? nivel : '', arg('depth') || arg('time') ? `d${depth}-t${time}` : ''].filter(Boolean).join('-');
  const archivo = (!sufijo && suite.archivo) || `pruebas-${nombreSuite}${sufijo ? `-${sufijo}` : ''}.json`;

  let hechas = {};
  if (existsSync(archivo)) {
    hechas = JSON.parse(readFileSync(archivo, 'utf8'));
    // Versión 2: antes de ella «lmrMejorado» apagado reducía 2 en lugar de 1; solo «todo» sirve de aquellos archivos.
    if (hechas._version !== 2) {
      const antes = Object.keys(hechas).length;
      hechas = Object.fromEntries(Object.entries(hechas).filter(([k]) => k.startsWith('todo|')));
      console.log(`Archivo de una versión anterior: se conservan ${Object.keys(hechas).length} de ${antes} partidas (solo «todo»); el resto se vuelve a jugar.`);
    }
  }
  hechas._version = 2;
  // Las partidas cortadas por el tope se juzgaron con otro criterio de adjudicación: esas (y solo esas) se vuelven a jugar.
  const marca = adj ? `adj:${adj.cp}:${adj.depth}` : 'sin';
  if (hechas._adj !== marca) {
    const reJugar = Object.entries(hechas._info ?? {}).filter(([, v]) => v[1] === 'tope de jugadas' || String(v[1]).startsWith('adjudicada')).map(([k]) => k);
    if (reJugar.length && hechas._adj !== undefined) console.log(`Cambió el criterio de adjudicación: se vuelven a jugar ${reJugar.length} partidas que llegaron al tope.`);
    else if (reJugar.length) console.log(`Archivo sin adjudicación: ${reJugar.length} partidas que llegaron al tope se vuelven a jugar para juzgarlas.`);
    for (const k of reJugar) { delete hechas[k]; delete hechas._info[k]; }
    hechas._adj = marca;
  }
  hechas._info = hechas._info ?? {}; // { clave: [jugadas, cómo terminó] } para diagnosticar
  const clave = (t) => `${t.nombre}|${t.apertura}|${t.v2Blancas ? 'w' : 'b'}`;

  const tareas = [];
  for (let g = 0; g < games; g++) for (const nombre of nombres) {
    const t = { nombre, apertura: Math.floor(g / 2), v2Blancas: g % 2 === 0 };
    if (!(clave(t) in hechas)) tareas.push(t);
  }
  const total = games * nombres.length;
  console.log(`Suite ${nombreSuite}: Minimax v2 contra ${rivalTxt} · ${ritmoTxt} · ${games} partidas × ${nombres.length} configuraciones = ${total}`);
  console.log(adj ? `Adjudicación: al tope de ${MAX_PLIES} jugadas, ventaja ≥ ${adj.cp} cp según Stockfish (profundidad ${adj.depth}) = victoria (--sin-adjudicar para desactivarla)` : 'Sin adjudicación: el tope de jugadas cuenta como tablas.');
  console.log(`Ya hechas: ${total - tareas.length} · por jugar: ${tareas.length} · procesos: ${jobs} · resultados en ${archivo}`);
  if (jobs > 1 && time < 1000) console.log('Aviso: con límites de tiempo cortos, usar muchos núcleos a la vez puede falsear los resultados.');
  const sfPath = (nivel || adj) && tareas.length ? prepararStockfish() : null;

  const guardar = () => writeFileSync(archivo, JSON.stringify(hechas));

  function tabla() {
    const ctlClaves = Object.keys(hechas).filter((k) => k.startsWith('ninguna|'));
    const ctl = Object.fromEntries(ctlClaves.map((k) => [k.slice(8), hechas[k]]));
    const filas = nombres.map((nombre) => {
      const ent = Object.entries(hechas).filter(([k]) => k.startsWith(`${nombre}|`)).map(([k, v]) => [k.slice(nombre.length + 1), v]);
      const xs = ent.map(([, v]) => v);
      const n = xs.length;
      if (!n) return { nombre, n: 0 };
      const p = xs.reduce((a, b) => a + b, 0) / n;
      const varianza = xs.reduce((a, x) => a + (x - p) ** 2, 0) / Math.max(1, n - 1);
      const margen = 1.96 * Math.sqrt(varianza / n);
      const g = xs.filter((x) => x === 1).length, d = xs.filter((x) => x === 0.5).length, pe = n - g - d;
      const pc = Math.min(0.999, Math.max(0.001, p));
      // diferencia pareada con el control (mismas aperturas y colores): más sensible que comparar puntajes sueltos
      const dif = nombre === 'ninguna' ? [] : ent.filter(([k]) => k in ctl).map(([k, v]) => v - ctl[k]);
      let pareada = null;
      if (dif.length >= 2) {
        const m = dif.reduce((a, b) => a + b, 0) / dif.length;
        const v = dif.reduce((a, x) => a + (x - m) ** 2, 0) / (dif.length - 1);
        pareada = { m, e: 1.96 * Math.sqrt(v / dif.length) };
      }
      return { nombre, n, g, d, pe, p, margen, elo: -400 * Math.log10(1 / pc - 1), pareada };
    }).filter((f) => f.n).sort((a, b) => b.p - a.p);
    const w = Math.max(...filas.map((f) => f.nombre.length), 6);
    const lineas = [`${'configuración'.padEnd(Math.max(w, 13))}  partidas   G-T-P      puntaje   ±95%    Elo    contra «ninguna» (pareado)`];
    for (const f of filas) {
      const par = f.pareada ? `${f.pareada.m >= 0 ? '+' : ''}${(f.pareada.m * 100).toFixed(1)} ±${(f.pareada.e * 100).toFixed(1)}` : '—';
      lineas.push(`${f.nombre.padEnd(Math.max(w, 13))}  ${String(f.n).padStart(8)}   ${`${f.g}-${f.d}-${f.pe}`.padEnd(9)}  ${(f.p * 100).toFixed(1).padStart(6)}%  ${`±${(f.margen * 100).toFixed(0)}`.padStart(5)}   ${((f.elo >= 0 ? '+' : '') + f.elo.toFixed(0)).padStart(4)}   ${par}`);
    }
    // cómo terminaron las partidas: sirve para detectar que algo va mal (p. ej. todas por tope de jugadas)
    const fines = nombres.map((nombre) => {
      const inf = Object.entries(hechas._info).filter(([k]) => k.startsWith(`${nombre}|`)).map(([, v]) => v);
      if (!inf.length) return null;
      const cuenta = {}; for (const [, f] of inf) cuenta[f] = (cuenta[f] ?? 0) + 1;
      const conEval = inf.filter((x) => x[2] != null && Math.abs(x[2]) < 50000); // evaluaciones al cortar por el tope (sin mates)
      const evalTxt = conEval.length ? ` · al llegar al tope el v2 iba ${(conEval.reduce((a, x) => a + x[2], 0) / conEval.length / 100 >= 0 ? '+' : '')}${(conEval.reduce((a, x) => a + x[2], 0) / conEval.length / 100).toFixed(1)} de media (${conEval.length} partidas)` : '';
      return `  ${nombre.padEnd(Math.max(w, 13))}  ${String(inf.length).padStart(3)} partidas · ${Math.round(inf.reduce((a, [p]) => a + p, 0) / inf.length)} jugadas de media · ${Object.entries(cuenta).map(([f, n]) => `${f} ${n}`).join(', ')}${evalTxt}`;
    }).filter(Boolean);
    if (fines.length) lineas.push('', 'Cómo terminaron las partidas jugadas:', ...fines);
    if (fines.length) lineas.push(adj ? `  «adjudicada» = llegó al tope de ${MAX_PLIES} jugadas con ventaja ≥ ${adj.cp / 100} peones para un bando según Stockfish (profundidad ${adj.depth}); cuenta como victoria, pero no es un mate. «tope de jugadas» = ventaja menor: tablas. (--sin-adjudicar lo desactiva)` : `  Sin adjudicación: lo que llegó al tope de ${MAX_PLIES} jugadas cuenta como tablas, aunque alguien fuera ganando.`);
    const c0 = filas.find((f) => f.nombre === 'ninguna');
    if (suite.rival.tipo === 'v1' && c0 && c0.n >= 20 && Math.abs(c0.p - 0.5) > Math.max(0.06, c0.margen)) lineas.push('', `⚠ El CONTROL («ninguna» = v1) dio ${(c0.p * 100).toFixed(1)} % y debería dar ~50 %: el montaje está desviado, no te fíes de las diferencias pequeñas.`);
    lineas.push('', `Puntaje = % de puntos del v2 contra ${rivalTxt}. El margen ±95 % dice qué tan fiable es: si [puntaje − margen, puntaje + margen] contiene el punto de comparación, la diferencia no se distingue del azar con estas partidas.`);
    lineas.push(suite.rival.tipo === 'v1'
      ? 'La referencia es 50 %. «ninguna» debe quedar en ~50 % (es el v1 contra sí mismo).'
      : 'Contra Stockfish la referencia es «ninguna»: lo que importa es la columna pareada (cuánto mejora cada configuración respecto a ninguna).');
    return lineas.join('\n');
  }

  if (!tareas.length) { console.log('\n' + tabla()); process.exit(0); }

  let terminadas = total - tareas.length, i = 0;
  const t0 = Date.now();
  const inicial = terminadas;
  let activos = 0;
  const workers = [];
  const minutosRestantes = () => (terminadas > inicial ? ((Date.now() - t0) / 60000 / (terminadas - inicial)) * (total - terminadas) : null);

  // --- dibujitos: dos peones a espadazos mientras corre (solo en una terminal ancha; --sin-dibujos los apaga) ---
  const ANCHO = 40;
  const animar = process.stdout.isTTY && (process.stdout.columns ?? 0) >= ANCHO + 24 && !process.argv.includes('--sin-dibujos');
  const PEON_I = [' o        ', '/|\\------>', '/ \\       '];
  const PEON_D = ['        o ', '<------/|\\', '       / \\'];
  const RUIDOS = ['clang!', 'zas!', 'pum!', 'chin!', 'tin tin!'];
  const POS = [0, 2, 4, 6, 8, 10, 10, 8, 6, 4, 2, 0]; // el 10 es el choque
  let cuadro = 0, alto = 0, timer = null;
  function dibujar() {
    const x = POS[cuadro % POS.length], ciclo = Math.floor(cuadro / POS.length), choque = x === 10;
    cuadro++;
    const filas = [0, 1, 2].map((r) => {
      let fila = ' '.repeat(x) + PEON_I[r] + ' '.repeat(ANCHO - 20 - 2 * x) + PEON_D[r] + ' '.repeat(x);
      if (choque && r === 1) fila = fila.slice(0, 9 + x) + '*' + fila.slice(10 + x + 1);
      return fila;
    });
    if (choque) { const t = RUIDOS[ciclo % RUIDOS.length]; filas[0] = ' '.repeat(Math.max(0, Math.floor((ANCHO - t.length) / 2))) + t; }
    const frac = total ? terminadas / total : 1, lleno = Math.round(frac * 30);
    const resta = minutosRestantes();
    const lineas = [...filas, `[${'#'.repeat(lleno)}${'-'.repeat(30 - lleno)}] ${terminadas}/${total} (${Math.round(frac * 100)}%)`,
      `${resta == null ? 'calculando el tiempo restante…' : `quedan ~${Math.max(1, Math.round(resta))} min`} · Ctrl+C guarda y sale`];
    if (alto) process.stdout.write(`\x1b[${alto - 1}A\r`);
    process.stdout.write(lineas.map((l) => l + '\x1b[K').join('\n'));
    alto = lineas.length;
  }
  function parar() { // borra el dibujo para que lo que se imprima después salga limpio
    if (timer) { clearInterval(timer); timer = null; }
    if (alto) { process.stdout.write(`\x1b[${alto - 1}A\r\x1b[J`); alto = 0; }
  }
  if (animar) { dibujar(); timer = setInterval(dibujar, 350); }

  const cerrar = () => { parar(); guardar(); for (const w of workers) w.terminate(); console.log('\n' + tabla()); console.log(`\nResultados guardados en ${archivo} (${((Date.now() - t0) / 60000).toFixed(1)} min)`); process.exit(0); };
  process.on('SIGINT', () => { parar(); console.log('\nInterrumpido: avance guardado, vuelve a lanzar el mismo comando para continuar.'); guardar(); console.log('\n' + tabla()); process.exit(0); });

  for (let j = 0; j < Math.min(jobs, tareas.length); j++) {
    const w = new Worker(new URL(import.meta.url), { workerData: { depth, time, rival: suite.rival.tipo, sfPath, sfDepth, adj } });
    workers.push(w);
    const siguiente = () => { if (i < tareas.length) { activos++; w.postMessage(tareas[i++]); } };
    w.on('message', (r) => {
      if (r.error) { parar(); guardar(); console.error(`\nError en una partida (${r.nombre}): ${r.error}`); process.exit(1); }
      activos--;
      hechas[clave(r)] = r.puntos;
      hechas._info[clave(r)] = r.cp != null ? [r.plies, r.fin, Math.round(r.cp)] : [r.plies, r.fin];
      terminadas++;
      if (terminadas % 10 === 0 || terminadas === total) {
        guardar();
        if (!animar) console.log(`  ${terminadas}/${total} partidas · quedan ~${(minutosRestantes() ?? 0).toFixed(0)} min`);
      }
      if (i < tareas.length) siguiente(); else if (activos === 0) cerrar();
    });
    w.on('error', (e) => { parar(); console.error('Error en un proceso:', e); process.exit(1); });
    siguiente();
  }
}
