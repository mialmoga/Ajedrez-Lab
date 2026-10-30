/**
 * Piezas compartidas por las herramientas de laboratorio (pruebas.mjs, autopsia.mjs): Stockfish por UCI en un proceso
 * aparte, aperturas, niveles y configuraciones del Minimax v2.
 */
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_FEATURES } from '../src/engines/minimax2/minimax2-core.js';
import { parsearScore } from './adjudicar.mjs';

export const NIVELES_SF = { p1: 1, p2: 2, p3: 4, p4: 6, p5: 8, p6: 12, p7: 16 }; // los mismos del adaptador de Stockfish del repo

export const APERTURAS = [
  'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6', 'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5', 'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4', 'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4',
  'e2e4 e7e6 d2d4 d7d5 b1c3 g8f6', 'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4', 'e2e4 d7d5 e4d5 d8d5 b1c3 d5a5', 'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6',
  'd2d4 d7d5 c2c4 c7c6 g1f3 g8f6', 'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7', 'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4', 'd2d4 g8f6 g1f3 e7e6 c2c4 b7b6',
  'g1f3 d7d5 g2g3 g8f6 f1g2 e7e6', 'g1f3 g8f6 c2c4 g7g6 b1c3 f8g7', 'c2c4 e7e5 b1c3 g8f6 g1f3 b8c6', 'c2c4 g8f6 b1c3 e7e6 e2e4 d7d5',
  'e2e4 e7e5 g1f3 g8f6 f3e5 d7d6', 'e2e4 g7g6 d2d4 f8g7 b1c3 d7d6', 'd2d4 f7f5 g2g3 g8f6 f1g2 e7e6', 'e2e4 e7e5 b1c3 g8f6 f2f4 d7d5',
];

export const FUNCIONES = Object.keys(DEFAULT_FEATURES).filter((k) => DEFAULT_FEATURES[k]); // las 15 activas por defecto
export const TODO_APAGADO = Object.fromEntries(Object.keys(DEFAULT_FEATURES).map((k) => [k, false]));

/** Paquetes: funciones que, por hipótesis, deben ir juntas. La prueba dirá si la hipótesis acierta. */
export const PAQUETES = {
  orden: ['contraataque', 'gravedadHistorial'], // solo ordenar mejor las jugadas: es el cimiento de la poda
  poda: ['nullMove', 'lmrMejorado', 'aspiracion', 'contraataque', 'gravedadHistorial'], // podar con buena ordenación
  'poda+q': ['nullMove', 'lmrMejorado', 'aspiracion', 'contraataque', 'gravedadHistorial', 'podaQuiescence', 'iteracionParcial'], // toda la búsqueda
  conocimiento: ['parAlfiles', 'torresColumnas', 'estructuraPeones', 'peonesPasados', 'seguridadRey', 'movilidad', 'finalArrinconar', 'repeticiones'], // toda la evaluación
  peones: ['estructuraPeones', 'peonesPasados', 'finalArrinconar'], // peones y finales, se refuerzan entre sí
  piezas: ['parAlfiles', 'torresColumnas', 'movilidad', 'seguridadRey'], // actividad de las piezas y el rey
};

/** Funciones encendidas de una configuración. Lanza si el nombre no existe. */
export function featuresDe(nombre) {
  if (nombre === 'todo') return { ...DEFAULT_FEATURES };
  if (nombre === 'ninguna') return { ...TODO_APAGADO };
  if (PAQUETES[nombre]) return { ...TODO_APAGADO, ...Object.fromEntries(PAQUETES[nombre].map((f) => [f, true])) };
  if (nombre.startsWith('sin:')) {
    const f = nombre.slice(4);
    if (!FUNCIONES.includes(f)) throw new Error(`Función desconocida en «${nombre}»`);
    return { ...DEFAULT_FEATURES, [f]: false };
  }
  if (FUNCIONES.includes(nombre)) return { ...TODO_APAGADO, [nombre]: true };
  throw new Error(`Configuración desconocida: «${nombre}». Funciones: ${FUNCIONES.join(', ')}. Paquetes: ${Object.keys(PAQUETES).join(', ')}. También: todo, ninguna, sin:<función>.`);
}

// ------------------------------------------------------------------ Stockfish por UCI (proceso aparte)
export class Stockfish {
  constructor(proc) {
    this.p = proc; this.buf = ''; this.esperas = [];
    proc.stdout.on('data', (d) => {
      this.buf += d;
      for (let i; (i = this.buf.indexOf('\n')) >= 0;) { const l = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1); this.#linea(l); }
    });
    proc.on('error', (e) => this.#fallo(e));
    proc.on('exit', () => this.#fallo(new Error('Stockfish se cerró inesperadamente')));
  }
  #linea(l) { for (const e of this.esperas.slice()) if (e.test(l)) { this.esperas.splice(this.esperas.indexOf(e), 1); clearTimeout(e.t); e.res(l); } }
  #fallo(err) { for (const e of this.esperas.splice(0)) { clearTimeout(e.t); e.rej(err); } }
  esperar(test, ms = 120000) {
    return new Promise((res, rej) => {
      const e = { test, res, rej, t: setTimeout(() => rej(new Error('Stockfish no respondió a tiempo')), ms) };
      this.esperas.push(e);
    });
  }
  enviar(c) { this.p.stdin.write(`${c}\n`); }
  static async crear(sfPath) {
    const s = new Stockfish(spawn(process.execPath, [sfPath], { stdio: ['pipe', 'pipe', 'ignore'] }));
    s.enviar('uci'); await s.esperar((l) => l === 'uciok');
    s.enviar('setoption name Hash value 16'); s.enviar('isready'); await s.esperar((l) => l === 'readyok');
    s.enviar('ucinewgame');
    return s;
  }
  async mejor(ucis, depth) {
    this.enviar(`position startpos moves ${ucis.join(' ')}`);
    this.enviar(`go depth ${depth}`);
    const m = (await this.esperar((l) => l.startsWith('bestmove'))).split(' ')[1];
    return !m || m === '(none)' ? null : m;
  }
  /** Evaluación y mejor jugada de la posición tras `ucis`: { score (del bando que mueve), mejor, depth } */
  async analizar(ucis, depth) {
    this.enviar(`position startpos moves ${ucis.join(' ')}`);
    this.enviar(`go depth ${depth}`);
    let score = null, prof = 0;
    const fin = await this.esperar((l) => {
      const sc = parsearScore(l);
      if (sc) { score = sc; prof = Number(/depth (\d+)/.exec(l)?.[1] ?? prof); }
      return l.startsWith('bestmove');
    });
    const m = fin.split(' ')[1];
    return { score, mejor: !m || m === '(none)' ? null : m, depth: prof };
  }
  /** Evaluación (score del bando que mueve) de la posición tras `ucis`, a profundidad fija. */
  async evaluar(ucis, depth) {
    this.enviar(`position startpos moves ${ucis.join(' ')}`);
    this.enviar(`go depth ${depth}`);
    let ultimo = null;
    await this.esperar((l) => { const sc = parsearScore(l); if (sc) ultimo = sc; return l.startsWith('bestmove'); });
    return ultimo;
  }
  cerrar() { try { this.enviar('quit'); } catch { /* ya cerrado */ } setTimeout(() => this.p.kill(), 500).unref(); }
}

/** Copia el Stockfish del repo a una carpeta temporal como CommonJS (el repo es ESM) y devuelve su ruta. */
export function prepararStockfish() {
  const dir = join(tmpdir(), 'ajedrez-lab-sf');
  mkdirSync(dir, { recursive: true });
  const de = (f) => fileURLToPath(new URL(`../vendor/stockfish/${f}`, import.meta.url));
  copyFileSync(de('stockfish-19-lite-single.js'), join(dir, 'sf.cjs'));
  copyFileSync(de('stockfish-19-lite-single.wasm'), join(dir, 'sf.wasm')); // el .wasm debe llamarse como el .js
  return join(dir, 'sf.cjs');
}
