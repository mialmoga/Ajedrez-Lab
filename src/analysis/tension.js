/**
 * Curva de tensión de una partida (pura): cuánta «temperatura» tiene cada jugada, para que la música del modo cine
 * suba y baje con la partida. Se calcula una vez, antes de reproducir (no en vivo).
 *
 * Entrada:
 *   jugadas: [{ san, captured? }]      (la captura se deduce de la «x» del SAN; `captured` = 'p'|'n'|'b'|'r'|'q' afina el peso)
 *   plies?:  resumir(analisis).plies   (clase de cada jugada)    — opcional
 *   pos?:    analisis.pos              (evaluaciones N+1)        — opcional
 * Salida: { t:[0..1], nivel:[0|1|2], evento:[string|null], pico:{i,t} }
 *   nivel: 0 calma · 1 tensión · 2 clímax (con histéresis para que no parpadee)
 *   evento: 'mate' | 'brillante' | 'error' | 'jaque' | 'captura' | null (el más importante de la jugada)
 * Sin análisis solo usa material, jaques y fase de la partida, así que sirve también para un PGN importado.
 */
export const VALOR = { p: 1, n: 3, b: 3, r: 5, q: 9 };

const evalPlano = (p) => (p == null ? null : p.m != null ? Math.sign(p.m) * 2000 : p.e);

export function curvaTension({ jugadas, plies = null, pos = null }) {
  const N = jugadas.length;
  const t = new Array(N).fill(0), nivel = new Array(N).fill(0), evento = new Array(N).fill(null);
  let comido = 0, prev = 0, lv = 0, enfria = 0;
  for (let i = 0; i < N; i++) {
    const { san = '', captured } = jugadas[i];
    const captura = san.includes('x');
    const val = captura ? VALOR[captured] ?? 1 : 0;
    const mate = san.includes('#'), jaque = san.includes('+');
    comido += val;
    const clase = plies?.[i]?.clase ?? null;

    let r = 0.06;
    if (captura) r += 0.2 + (val >= 5 ? 0.15 : val >= 3 ? 0.05 : 0);
    if (jaque) r += 0.25;
    if (clase === 'brillante') r += 0.35;
    else if (clase === 'error_grave') r += 0.5;
    else if (clase === 'error') r += 0.3;
    else if (clase === 'imprecision') r += 0.1;
    const a = pos ? evalPlano(pos[i]) : null, d = pos ? evalPlano(pos[i + 1]) : null;
    if (a != null && d != null) r += Math.min(0.3, Math.abs(d - a) / 1000);
    const mateCerca = pos?.[i + 1]?.m != null && Math.abs(pos[i + 1].m) <= 4;
    if (mateCerca) r += 0.35;
    if (i < 8 && !captura && !jaque && !clase) r *= 0.6; // apertura: tranquila salvo que pase algo
    if (comido >= 24) r += 0.1; // final: cada jugada pesa más
    if (mate) r = 1;

    // la tensión sube de golpe y se enfría poco a poco
    const v = Math.min(1, Math.max(r, 0.7 * prev + 0.3 * r));
    prev = v;
    t[i] = Math.round(v * 1000) / 1000;

    // histéresis: sube con umbral alto, baja con umbral más bajo
    if (lv < 2 && v >= 0.55) lv = 2;
    else if (lv < 1 && v >= 0.28) lv = 1;
    else if ((lv === 2 && v < 0.42) || (lv === 1 && v < 0.2)) { if (++enfria >= 2) { lv--; enfria = 0; } } // baja solo tras dos jugadas tranquilas
    if (!((lv === 2 && v < 0.42) || (lv === 1 && v < 0.2))) enfria = 0;
    if (mate) lv = 2;
    nivel[i] = lv;

    evento[i] = mate ? 'mate' : clase === 'brillante' ? 'brillante' : clase === 'error' || clase === 'error_grave' ? 'error' : jaque ? 'jaque' : captura ? 'captura' : null;
  }
  let pico = { i: -1, t: 0 };
  t.forEach((v, i) => { if (v > pico.t) pico = { i, t: v }; });
  return { t, nivel, evento, pico };
}
