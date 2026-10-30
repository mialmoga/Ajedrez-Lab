/**
 * Temas musicales del modo cine, sintetizados con demoKit (sin archivos de audio).
 *
 * Cada tema se compone UNA vez y se entrega en capas que suenan a la vez, en bucle y alineadas al compás:
 *   cama     siempre suena (acordes, adornos)
 *   ritmo    entra con la tensión media (batería y bajo)
 *   climax   entra en los momentos de máxima tensión (más ritmo, melodía, subida)
 * más «stingers» cortos para eventos puntuales: captura, jaque, error, brillante, mate y final.
 * El reproductor solo sube y baja la ganancia de las capas (musica.js); aquí no hay nada en vivo.
 *
 * Es código puro (sin DOM): corre en un worker (render-worker.js) o en Node para las pruebas.
 */
import { demoKit } from './demo-kit.js';

export const SR = 32000;
const COLA = 1.8; // segundos extra que se renderizan y se pliegan al inicio para que el bucle no corte los ecos

const suave = (x) => (x < -3 ? -1 : x > 3 ? 1 : x * (27 + x * x) / (27 + 9 * x * x));

/** Suma percusión + música, pliega la cola al principio (bucle sin costura) y satura suavemente. */
function bajar(kit, loopSeg, { cola = true, fundidoFinal = 0, duck = 0, fuerza = 0.65 } = {}) {
  const N = Math.round(loopSeg * SR), L = new Float32Array(N), R = new Float32Array(N);
  const total = kit.n;
  for (let i = 0; i < total; i++) {
    const j = cola ? i % N : i;
    if (j >= N) continue;
    // sidechain: la música (no la percusión) se agacha con cada pulso de `duck` segundos
    const g = duck ? 1 - fuerza * Math.exp(-((i / SR) % duck) * 13) : 1;
    L[j] += kit.dr[0][i] + kit.mu[0][i] * g;
    R[j] += kit.dr[1][i] + kit.mu[1][i] * g;
  }
  const f = Math.round(fundidoFinal * SR);
  for (let i = 0; i < N; i++) {
    const g = f && i > N - f ? (N - i) / f : 1;
    L[i] = suave(L[i] * 0.9) * g;
    R[i] = suave(R[i] * 0.9) * g;
  }
  return { L, R };
}

function capa(bpm, bars, seed, dibujar, opts = {}) {
  const bar = 240 / bpm, loop = bar * bars;
  const kit = demoKit(SR, loop + COLA, seed);
  dibujar(kit, { bar, beat: bar / 4, bars, loop });
  return bajar(kit, loop, opts.duck ? { duck: bar / 4, fuerza: opts.fuerza } : {});
}
function golpe(seg, seed, dibujar) {
  const kit = demoKit(SR, seg, seed);
  dibujar(kit);
  return bajar(kit, seg, { cola: false, fundidoFinal: 0.25 });
}

// ───────────────────────── CLÁSICO · lo-fi de madera ─────────────────────────
// La menor, 74 bpm, swing suave. Am7 · Dm7 · G7 · Cmaj7.
const CLASICO = {
  bpm: 74, bars: 4,
  acordes: [
    { raiz: 45, notas: [57, 60, 64, 67] },
    { raiz: 38, notas: [53, 57, 60, 64] },
    { raiz: 43, notas: [55, 59, 62, 65] },
    { raiz: 48, notas: [52, 55, 59, 64] },
  ],
  motivo: [76, 72, 74, 71], // melodía del clímax (una nota por compás, con adornos)
};

function clasicoCama(k, { bar, beat, loop }) {
  const sw = beat * 0.5 * 0.14; // swing de las corcheas
  CLASICO.acordes.forEach((c, b) => {
    const t0 = b * bar;
    c.notas.forEach((m, i) => k.syn(k.mu, t0, bar * 0.97, k.hz(m), 0.06, (i - 1.5) * 0.28, { det: [-9, 9], w: 0, lp: 850, atk: 0.09, rel: 0.55 }));
    // cajita de música: dos o tres notas sueltas por compás
    const picos = [1.5, 3, 3.5];
    picos.forEach((p, i) => {
      if (k.rnd() < -0.15 && i) return;
      const m = c.notas[Math.floor((k.rnd() * 0.5 + 0.5) * c.notas.length) % c.notas.length] + 12;
      k.bell(t0 + p * beat + (p % 1 ? sw : 0), m, 0.12, k.rnd() * 0.5, 1.9);
    });
  });
  // chisporroteo de vinilo: siseo muy suave + pops
  let y = 0;
  k.add(k.dr, 0, loop + COLA, () => { const x = k.rnd(); y += 0.08 * (x - y); return y * 0.35; }, 0.025, 0);
  for (let t = 0.3; t < loop + COLA - 0.2; t += 0.12 + (k.rnd() * 0.5 + 0.5) * 0.35) {
    if (k.rnd() < 0.55) k.add(k.dr, t, 0.006, (u) => k.rnd() * Math.exp(-u * 700), 0.05 + (k.rnd() * 0.5 + 0.5) * 0.05, k.rnd());
  }
}

function clasicoRitmo(k, { bar, beat, bars }) {
  const sw = beat * 0.5 * 0.14;
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar, c = CLASICO.acordes[b % CLASICO.acordes.length];
    k.kick(t0, 0.42, { lo: 44, hi: 110, dec: 8, click: 0.12 });
    k.kick(t0 + 2.5 * beat + sw, 0.38, { lo: 44, hi: 110, dec: 8, click: 0.1 });
    k.snare(t0 + beat, 0.32, { tone: 170, nd: 26, td: 34 });
    k.snare(t0 + 3 * beat, 0.32, { tone: 170, nd: 26, td: 34 });
    for (let e = 0; e < 8; e++) k.hat(t0 + e * beat * 0.5 + (e % 2 ? sw : 0), e % 2 ? 0.075 : 0.12, false, (e % 2 ? 0.3 : -0.3));
    // bajo
    k.syn(k.mu, t0, beat * 1.6, k.hz(c.raiz), 0.2, 0, { w: 2, lp: 420, atk: 0.012, rel: 0.12 });
    k.syn(k.mu, t0 + 2.5 * beat + sw, beat * 1.2, k.hz(c.raiz + (b % 2 ? 7 : 0)), 0.15, 0, { w: 2, lp: 420, atk: 0.012, rel: 0.1 });
  }
}

function clasicoClimax(k, { bar, beat, bars }) {
  const sw = beat * 0.5 * 0.14;
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar, c = CLASICO.acordes[b % CLASICO.acordes.length];
    // arpegio de campanas, corcheas
    for (let e = 0; e < 8; e++) k.bell(t0 + e * beat * 0.5 + (e % 2 ? sw : 0), c.notas[[0, 1, 2, 3, 2, 1, 3, 2][e]] + 12, 0.09, ((e % 4) - 1.5) * 0.35, 1.2);
    // melodía
    const m = CLASICO.motivo[b];
    k.syn(k.mu, t0 + beat * 0.5, beat * 1.7, k.hz(m), 0.05, 0.1, { det: [-6, 6], w: 1, lp: 1700, atk: 0.02, rel: 0.25, dec: 0.4 });
    k.syn(k.mu, t0 + 2.5 * beat, beat * 1.2, k.hz(m - 2 + (b % 2 ? 2 : 0)), 0.04, 0.1, { det: [-6, 6], w: 1, lp: 1500, atk: 0.02, rel: 0.25 });
    // más pegada: bombo en cada pulso, palmada en 2 y 4, hat abierto
    for (let p = 1; p < 4; p += 2) k.kick(t0 + p * beat, 0.3, { lo: 44, hi: 110, dec: 8, click: 0.08 });
    k.clap(t0 + beat, 0.2); k.clap(t0 + 3 * beat, 0.2);
    k.hat(t0 + 1.5 * beat + sw, 0.12, true, 0.3); k.hat(t0 + 3.5 * beat + sw, 0.12, true, -0.3);
  }
  // subida y relleno hacia el compás 1
  const u = (bars - 1) * bar;
  k.riser(u + 2 * beat, 2 * beat, 0.11);
  k.snare(u + 3.5 * beat, 0.3, { tone: 190, nd: 26 }); k.snare(u + 3.75 * beat, 0.35, { tone: 200, nd: 26 });
}

function clasicoStingers() {
  return {
    captura: golpe(1.6, 11, (k) => { k.kick(0, 0.75, { lo: 45, hi: 130, dec: 9 }); k.bell(0.02, 57, 0.2, 0, 1.3); k.bell(0.02, 64, 0.14, 0.3, 1.1); k.hat(0.03, 0.15, false, 0.4); }),
    jaque: golpe(1.6, 12, (k) => { k.bell(0, 81, 0.2, -0.4, 1.3); k.bell(0.13, 76, 0.2, 0.4, 1.3); k.snap(0, 0.35, 0); }),
    error: golpe(2.2, 13, (k) => { k.bell(0, 63, 0.2, -0.2, 1.8); k.bell(0.2, 58, 0.2, 0.2, 1.8); k.kick(0, 0.45, { lo: 38, hi: 70, dec: 5 }); k.syn(k.mu, 0, 1.4, k.hz(46), 0.1, 0, { w: 2, lp: 300, atk: 0.02, rel: 0.5 }); }),
    brillante: golpe(2.4, 14, (k) => { [72, 76, 79, 84, 88].forEach((m, i) => k.bell(i * 0.08, m, 0.17, (i - 2) * 0.3, 1.6)); k.hat(0.4, 0.1, true, 0); }),
    mate: golpe(6, 15, (k) => {
      k.crash(0, 0.4, 3.5); k.kick(0, 1, { lo: 36, hi: 110, dec: 3.5, len: 1.2 });
      [45, 57, 60, 64, 69, 72].forEach((m, i) => { k.bell(0.05 + i * 0.07, m + 12, 0.16, (i - 2.5) * 0.3, 3); k.syn(k.mu, 0.05, 3.8, k.hz(m), 0.045, (i - 2.5) * 0.25, { det: [-8, 8], w: 0, lp: 1100, atk: 0.05, rel: 1.4 }); });
      k.syn(k.mu, 0, 4, k.hz(33), 0.22, 0, { w: 2, lp: 200, atk: 0.01, rel: 1.2 });
    }),
    final: golpe(5, 16, (k) => {
      [48, 52, 55, 59].forEach((m, i) => k.syn(k.mu, 0, 3.2, k.hz(m), 0.05, (i - 1.5) * 0.3, { det: [-8, 8], w: 0, lp: 900, atk: 0.2, rel: 1.5 }));
      k.bell(0.4, 76, 0.1, 0.2, 3); k.bell(1.2, 71, 0.08, -0.2, 3);
    }),
  };
}

// ───────────────────────── PIZARRA · épico ─────────────────────────
// Re menor, 88 bpm. Dm · Bb · Gm · A (el último compás empuja de vuelta al inicio).
const PIZARRA = {
  bpm: 88, bars: 4,
  acordes: [
    { raiz: 38, notas: [50, 53, 57, 62] },
    { raiz: 34, notas: [50, 53, 58, 62] },
    { raiz: 43, notas: [50, 55, 58, 62] },
    { raiz: 33, notas: [49, 52, 57, 61] },
  ],
  motivo: [74, 77, 76, 73], // trompetas del clímax
};
const cuerdas = (k, t0, len, m, a, pan) => k.syn(k.mu, t0, len, k.hz(m), a, pan, { det: [-13, 0, 13], w: 0, lp: 1500, atk: 0.28, rel: 0.9 });

function pizarraCama(k, { bar, beat, loop }) {
  PIZARRA.acordes.forEach((c, b) => {
    const t0 = b * bar;
    c.notas.forEach((m, i) => cuerdas(k, t0, bar * 0.98, m, 0.05, (i - 1.5) * 0.3));
    k.syn(k.mu, t0, bar, k.hz(c.raiz - 12), 0.13, 0, { w: 0, lp: 170, atk: 0.1, rel: 0.5 }); // zumbido grave
    k.chop(t0 + beat * 1.5, beat * 2.2, c.notas[3] + (b % 2 ? 0 : 12), 0.12, 0.2, 'oo'); // coro lejano
  });
  k.bell(0, 86, 0.07, 0.4, 3.2); k.bell(2 * bar + 2 * beat, 81, 0.07, -0.4, 3.2);
}

function pizarraRitmo(k, { bar, beat, bars }) {
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar, c = PIZARRA.acordes[b];
    k.kick(t0, 0.62, { lo: 38, hi: 95, dec: 4.6, len: 0.7, click: 0.05 });
    k.kick(t0 + 2 * beat, 0.5, { lo: 38, hi: 95, dec: 4.6, len: 0.7, click: 0.05 });
    k.kick(t0 + 3.5 * beat, 0.35, { lo: 38, hi: 95, dec: 5, len: 0.5, click: 0.05 });
    k.snare(t0 + beat, 0.38, { tone: 150, nd: 11, td: 18, len: 0.45 });
    k.snare(t0 + 3 * beat, 0.38, { tone: 150, nd: 11, td: 18, len: 0.45 });
    // ostinato de cuerdas graves, corcheas cortas
    for (let e = 0; e < 8; e++) k.syn(k.mu, t0 + e * beat * 0.5, beat * 0.4, k.hz(c.raiz + 12 + (e === 7 ? 7 : 0)), e % 2 ? 0.05 : 0.075, 0, { w: 0, lp: 650, atk: 0.006, rel: 0.05 });
  }
  k.crash(0, 0.14, 2.2);
}

function pizarraClimax(k, { bar, beat, bars }) {
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar, c = PIZARRA.acordes[b], m = PIZARRA.motivo[b];
    // metales: melodía con octava
    k.syn(k.mu, t0, beat * 1.8, k.hz(m), 0.06, 0.1, { det: [-9, 9], w: 0, lp: (t) => 800 + 2600 * Math.min(1, t / 0.12), atk: 0.02, rel: 0.2 });
    k.syn(k.mu, t0 + 2 * beat, beat * 1.8, k.hz(m - (b % 2 ? 5 : 2)), 0.055, 0.1, { det: [-9, 9], w: 0, lp: (t) => 800 + 2600 * Math.min(1, t / 0.12), atk: 0.02, rel: 0.2 });
    k.chop(t0, beat * 3.5, m + 12, 0.14, -0.15, 'ah'); // coro fuerte
    for (let p = 1; p < 4; p += 2) k.kick(t0 + p * beat, 0.4, { lo: 38, hi: 95, dec: 4.6, len: 0.6, click: 0.05 });
    c.notas.forEach((n, i) => k.bell(t0 + i * beat, n + 24, 0.07, (i - 1.5) * 0.4, 2.2));
  }
  k.crash(0, 0.28, 2.8);
  const u = (bars - 1) * bar;
  k.riser(u, 4 * beat, 0.14);
  for (let i = 0; i < 8; i++) k.snare(u + 2 * beat + i * beat * 0.25, 0.14 + i * 0.04, { tone: 170, nd: 22 });
}

function pizarraStingers() {
  const stab = (k, t, notas, a, len = 0.5) => notas.forEach((m, i) => k.syn(k.mu, t, len, k.hz(m), a, (i - 1) * 0.3, { det: [-9, 9], w: 0, lp: (u) => 700 + 2500 * Math.min(1, u / 0.1), atk: 0.01, rel: 0.25 }));
  return {
    captura: golpe(1.8, 21, (k) => { k.kick(0, 0.85, { lo: 36, hi: 100, dec: 4, len: 0.9 }); stab(k, 0.01, [38, 50, 57], 0.07, 0.4); k.crash(0.01, 0.1, 1.2); }),
    jaque: golpe(1.6, 22, (k) => { stab(k, 0, [69, 76], 0.07, 0.25); stab(k, 0.2, [69, 76], 0.07, 0.35); k.snare(0, 0.4, { tone: 180, nd: 14, len: 0.35 }); }),
    error: golpe(2.6, 23, (k) => { k.syn(k.mu, 0, 2, k.hz(39), 0.14, 0, { det: [-12, 12], w: 0, lp: 300, atk: 0.02, rel: 0.9 }); k.syn(k.mu, 0, 2, k.hz(38), 0.14, 0, { det: [-12, 12], w: 0, lp: 300, atk: 0.02, rel: 0.9 }); k.chop(0.05, 1.4, 62, 0.14, 0, 'oo'); k.chop(0.45, 1.4, 57, 0.14, 0, 'oo'); k.kick(0, 0.5, { lo: 34, hi: 70, dec: 4 }); }),
    brillante: golpe(2.6, 24, (k) => { [62, 69, 74, 77, 81].forEach((m, i) => { k.chop(i * 0.1, 1.3, m, 0.12, (i - 2) * 0.25, 'ah'); k.bell(i * 0.1, m + 12, 0.1, (i - 2) * 0.3, 2); }); k.crash(0.4, 0.07, 1.8); }),
    mate: golpe(7, 25, (k) => {
      k.crash(0, 0.45, 4); k.kick(0, 1, { lo: 34, hi: 100, dec: 3, len: 1.4 });
      for (const t of [0.5, 1, 1.4]) k.kick(t, 0.55, { lo: 36, hi: 90, dec: 4, len: 0.8 });
      [38, 50, 53, 57, 62, 65, 69].forEach((m, i) => { cuerdas(k, 0.02, 4.8, m, 0.05, (i - 3) * 0.2); });
      k.chop(0.05, 3.5, 74, 0.22, 0, 'ah'); k.chop(0.05, 3.5, 62, 0.2, 0.2, 'ah');
      k.syn(k.mu, 0, 5, k.hz(26), 0.22, 0, { w: 2, lp: 160, atk: 0.02, rel: 1.5 });
    }),
    final: golpe(5.5, 26, (k) => {
      [50, 57, 62, 64].forEach((m, i) => cuerdas(k, 0, 3.8, m, 0.05, (i - 1.5) * 0.3));
      k.chop(0.3, 3, 69, 0.12, 0, 'oo'); k.bell(1.2, 86, 0.07, 0.3, 3.5);
    }),
  };
}

// ───────────────────────── NEÓN · electrónico ─────────────────────────
// La menor, 124 bpm, pulso a cuatro, sidechain. Am · F · C · G.
const NEON = {
  bpm: 124, bars: 4,
  acordes: [
    { raiz: 33, notas: [57, 60, 64, 69] },
    { raiz: 29, notas: [53, 57, 60, 65] },
    { raiz: 36, notas: [55, 60, 64, 67] },
    { raiz: 31, notas: [55, 59, 62, 67] },
  ],
  arp: [0, 2, 1, 3, 2, 1, 3, 2],
  motivo: [81, 84, 83, 79],
};

function neonCama(k, { bar, beat }) {
  NEON.acordes.forEach((c, b) => {
    const t0 = b * bar;
    c.notas.forEach((m, i) => k.syn(k.mu, t0, bar * 0.99, k.hz(m), 0.06, (i - 1.5) * 0.4, { det: [-16, -6, 6, 16], w: 0, lp: (t) => 900 + 1400 * Math.min(1, t / bar), atk: 0.12, rel: 0.25 }));
    // arpegio suave de semicorcheas
    for (let e = 0; e < 16; e++) k.syn(k.mu, t0 + e * beat * 0.25, beat * 0.2, k.hz(c.notas[NEON.arp[e % 8]] + 12), 0.05 + (e % 4 === 0 ? 0.03 : 0), ((e % 5) - 2) * 0.3, { w: 1, lp: 1700, atk: 0.003, rel: 0.05 });
  });
}

function neonRitmo(k, { bar, beat, bars }) {
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar, c = NEON.acordes[b];
    for (let p = 0; p < 4; p++) k.kick(t0 + p * beat, 0.5, { lo: 48, hi: 160, dec: 9, click: 0.18 });
    k.clap(t0 + beat, 0.22); k.clap(t0 + 3 * beat, 0.22);
    for (let e = 0; e < 8; e++) k.hat(t0 + e * beat * 0.5, e % 2 ? 0.13 : 0.05, !!(e % 2), (e % 2 ? 0.35 : -0.2));
    for (let e = 0; e < 16; e++) if (e % 4 !== 2) k.hat(t0 + e * beat * 0.25, 0.04, false, -0.35);
    // bajo a contratiempo
    for (let p = 0; p < 4; p++) k.syn(k.mu, t0 + (p + 0.5) * beat, beat * 0.4, k.hz(c.raiz + (p === 3 ? 12 : 0)), 0.13, 0, { w: 0, lp: (t) => 300 + 900 * Math.exp(-t * 14), atk: 0.004, rel: 0.05 });
  }
}

function neonClimax(k, { bar, beat, bars }) {
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar, m = NEON.motivo[b], c = NEON.acordes[b];
    // lead supersaw en corcheas
    [0, 0.75, 1.5, 2, 3].forEach((p, i) => k.syn(k.mu, t0 + p * beat, beat * (i === 4 ? 1 : 0.6), k.hz(m + [0, 0, 3, 0, -2][i]), 0.08, 0.15, { det: [-18, -7, 7, 18], w: 0, lp: 3400, atk: 0.006, rel: 0.12 }));
    k.syn(k.mu, t0, bar, k.hz(c.raiz + 24), 0.045, -0.2, { det: [-10, 10], w: 1, lp: 2000, atk: 0.2, rel: 0.4 });
    k.hat(t0 + 1.75 * beat, 0.1, true, 0.2); k.hat(t0 + 3.75 * beat, 0.1, true, -0.2);
  }
  k.crash(0, 0.24, 2.4);
  const u = (bars - 1) * bar;
  k.riser(u, 4 * beat, 0.16);
  k.sweep(u, 4 * beat, 200, 2400, 0.05);
  for (let i = 0; i < 8; i++) k.snare(u + 2 * beat + i * beat * 0.25, 0.12 + i * 0.04, { tone: 200, nd: 24 });
}

function neonStingers() {
  const bip = (k, t, m, a, len = 0.12) => k.syn(k.mu, t, len, k.hz(m), a, 0, { w: 1, lp: 4200, atk: 0.002, rel: 0.08 });
  return {
    captura: golpe(1.4, 31, (k) => { k.kick(0, 0.8, { lo: 46, hi: 180, dec: 8, click: 0.25 }); k.sweep(0, 0.35, 1400, 160, 0.14); k.clap(0.05, 0.2); }),
    jaque: golpe(1.4, 32, (k) => { bip(k, 0, 93, 0.09); bip(k, 0.14, 100, 0.09); bip(k, 0.28, 93, 0.07); k.snap(0, 0.3, 0); }),
    error: golpe(2.2, 33, (k) => { k.syn(k.mu, 0, 1.2, k.hz(69), 0.1, 0, { det: [-20, 0, 20], w: 0, lp: (t) => 3000 * Math.exp(-t * 3) + 200, atk: 0.005, rel: 0.4 }); k.sweep(0, 1.1, 900, 70, 0.12); k.kick(0, 0.5, { lo: 40, hi: 90, dec: 5 }); }),
    brillante: golpe(2.2, 34, (k) => { [72, 76, 79, 84, 88, 91].forEach((m, i) => bip(k, i * 0.07, m, 0.07, 0.25)); k.hat(0.45, 0.14, true, 0); k.sweep(0, 0.5, 400, 3500, 0.05); }),
    mate: golpe(6.5, 35, (k) => {
      k.crash(0, 0.45, 3.5); k.kick(0, 1, { lo: 40, hi: 170, dec: 4, len: 1.2 });
      [57, 60, 64, 69, 72, 76].forEach((m, i) => k.syn(k.mu, 0.02, 4.2, k.hz(m), 0.045, (i - 2.5) * 0.3, { det: [-18, -6, 6, 18], w: 0, lp: (t) => 4000 * Math.exp(-t * 1.2) + 600, atk: 0.01, rel: 1.4 }));
      k.syn(k.mu, 0, 4.5, k.hz(33), 0.24, 0, { w: 2, lp: 180, atk: 0.01, rel: 1.2 });
      k.sweep(0.05, 3, 120, 1800, 0.08);
    }),
    final: golpe(5, 36, (k) => {
      [48, 55, 60, 64].forEach((m, i) => k.syn(k.mu, 0, 3.4, k.hz(m), 0.04, (i - 1.5) * 0.3, { det: [-14, -5, 5, 14], w: 0, lp: 1200, atk: 0.3, rel: 1.4 }));
      bip(k, 0.6, 88, 0.05, 0.5);
    }),
  };
}

const TEMAS = {
  clasico: { T: CLASICO, capas: [clasicoCama, clasicoRitmo, clasicoClimax], stingers: clasicoStingers, seeds: [101, 202, 303] },
  pizarra: { T: PIZARRA, capas: [pizarraCama, pizarraRitmo, pizarraClimax], stingers: pizarraStingers, seeds: [111, 212, 313] },
  neon: { T: NEON, capas: [neonCama, neonRitmo, neonClimax], stingers: neonStingers, seeds: [121, 222, 323], duck: true },
};

/** Render de un tema → { id, sr, bpm, bars, capas:{cama,ritmo,climax}, stingers:{...} } (cada audio {L,R} de Float32Array). */
export function renderTema(id) {
  const D = TEMAS[id] ?? TEMAS.clasico;
  const { T } = D;
  // el sidechain del neón agacha cama y climax con el bombo; el ritmo (que lleva el bombo y el bajo) queda tal cual
  const [cama, ritmo, climax] = D.capas.map((f, i) => capa(T.bpm, T.bars, D.seeds[i], f, D.duck && i !== 1 ? { duck: true, fuerza: 0.6 } : {}));
  return { id: TEMAS[id] ? id : 'clasico', sr: SR, bpm: T.bpm, bars: T.bars, capas: { cama, ritmo, climax }, stingers: D.stingers() };
}

export const TEMAS_DISPONIBLES = Object.keys(TEMAS);
