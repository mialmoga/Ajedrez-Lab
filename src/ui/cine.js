import { h } from './dom.js';
import { THEMES } from './themes.js';
import { createWakeLock } from './wake-lock.js';
import { CLASES, detalleDeClase } from '../analysis/analisis.js';
import { curvaTension } from '../analysis/tension.js';
import { createMusica } from '../audio/musica.js';

/**
 * Modo cine: el replay de la partida a pantalla completa, solo con el tablero 3D, viñeta, cámara en movimiento suave,
 * reproducción automática (más lenta en capturas, jaques y errores) y subtítulos con el narrador y el análisis.
 *
 *   const cine = createCine({ game, review, match, explainer, analisisCtl, boardsEl, pane3d, view3d, getThemeId, setTheme, store })
 *   cine.abrir()   → tarjeta de opciones (calidad, tablero, subtítulos, velocidad) y luego la película
 */

export const POS_SUBS = { abajo: '⬇', arriba: '⬆', lado: '➡' };
export const VELOCIDADES = [0.5, 1, 1.5, 2];
export const CALIDADES = { baja: 'Baja · más fluida', media: 'Media', alta: 'Alta · mejor imagen' };
const MARCADAS = new Set(['brillante', 'imprecision', 'error', 'error_grave']);

/**
 * Segundos que dura en pantalla una jugada (pura, para poder probarla).
 * Base 1.8 s; las capturas, jaques, errores/brillantes y el mate piden más tiempo; el subtítulo largo, también.
 */
export function duracionJugada({ san = '', captura = false, clase = null, caracteres = 0, subtitulos = true, velocidad = 1 }) {
  let t = 1.8;
  if (captura) t += 0.7;
  if (san.includes('#')) t += 2.5;
  else if (san.includes('+')) t += 0.5;
  if (clase && MARCADAS.has(clase)) t += 1.2;
  if (subtitulos) t += Math.min(3, caracteres * 0.035);
  return t / (VELOCIDADES.includes(velocidad) ? velocidad : 1);
}

const DEFECTOS = { calidad: 'media', tema: null, subtitulos: true, velocidad: 1, analizar: true, estallidos: true, bloom: false, musica: true, volumen: 0.7, subPos: 'abajo' };

export function createCine({ game, review, explainer, analisisCtl, pane3d, view3d, getThemeId, setTheme, nombres, store }) {
  const cargar = () => { try { return { ...DEFECTOS, ...(JSON.parse(store.get('cine', 'null')) ?? {}) }; } catch { return { ...DEFECTOS }; } };
  let opt = cargar();
  let abierto = false;
  const musica = createMusica();
  let tension = null, plyMusica = 0, silencio = false, cerrada = false;
  const wake = createWakeLock(); // que la pantalla no se apague mientras dura la película

  // ---------- estructura ----------
  const stage = h('div', { class: 'cine-stage' });
  const vineta = h('div', { class: 'cine-vineta' });
  const titulo = h('div', { class: 'cine-titulo' });
  const subHead = h('div', { class: 'cine-sub-head' });
  const subTexto = h('div', { class: 'cine-sub-texto' });
  const subClase = h('div', { class: 'cine-sub-clase' });
  const subs = h('div', { class: 'cine-subs' }, subHead, subTexto, subClase);
  const progreso = h('div', { class: 'cine-progreso' }, h('div', { class: 'cine-progreso-fill' }));
  const msg = h('div', { class: 'cine-msg' });
  const btn = (txt, title, fn) => h('button', { class: 'cine-btn', title, onClick: fn }, txt);
  const bInicio = btn('⏮', 'Volver al principio', () => ir(0));
  const bAtras = btn('‹', 'Jugada anterior (←)', () => { pausar(); ir(review.viewPly - 1); });
  const bPlay = btn('⏸', 'Pausa / seguir (espacio)', () => alternar());
  const bAdelante = btn('›', 'Jugada siguiente (→)', () => { pausar(); ir(review.viewPly + 1); });
  const bVel = btn('1×', 'Velocidad', () => { opt.velocidad = VELOCIDADES[(VELOCIDADES.indexOf(opt.velocidad) + 1) % VELOCIDADES.length]; bVel.textContent = `${opt.velocidad}×`; guardar(); });
  const bMus = btn('🔊', 'Música (silenciar / activar)', () => { silencio = !silencio; musica.setVolumen(silencio ? 0 : opt.volumen); bMus.textContent = silencio ? '🔇' : '🔊'; });
  const bPos = btn('⬇', 'Mover los subtítulos (abajo → arriba → al lado)', () => { const orden = Object.keys(POS_SUBS).filter((x) => x !== 'lado' || ladoOk()); opt.subPos = orden[(orden.indexOf(posEfectiva()) + 1) % orden.length]; aplicarPos(); guardar(); });
  const bSub = btn('💬', 'Subtítulos', () => { opt.subtitulos = !opt.subtitulos; pintarSub(); guardar(); });
  const bSalir = btn('✕', 'Salir del modo cine (Esc)', () => salir());
  const barra = h('div', { class: 'cine-barra' }, bInicio, bAtras, bPlay, bAdelante, bVel, bSub, bPos, bMus, bSalir);
  const overlay = h('div', { class: 'cine', hidden: true }, stage, vineta, titulo, subs, msg, h('div', { class: 'cine-controles' }, progreso, barra));
  document.body.append(overlay);

  // posición de los subtítulos: abajo (con marco), arriba (sin marco) o en un panel al lado (solo en pantallas anchas)
  const ladoOk = () => innerWidth >= 700 && innerWidth >= innerHeight * 1.15;
  const posEfectiva = () => (opt.subPos === 'lado' && !ladoOk() ? 'abajo' : POS_SUBS[opt.subPos] ? opt.subPos : 'abajo');
  function aplicarPos() {
    const p = posEfectiva();
    overlay.dataset.sub = p;
    bPos.textContent = POS_SUBS[p];
  }
  window.addEventListener('resize', () => { if (abierto) aplicarPos(); });

  function guardar() { try { store.set('cine', JSON.stringify(opt)); } catch { /* sin almacenamiento */ } }

  // ---------- reproducción ----------
  let timer = 0, jugando = false, tema0 = null, padre = null, siguiente = null, ocultar = 0;

  const K = () => review.viewPly - 1; // índice de la jugada mostrada
  function nombreJugada(k) {
    const m = game.moves[k];
    const num = Math.floor((k + (game.moves[0]?.color === 'b' ? 1 : 0)) / 2) + 1;
    return `${num}${m.color === 'w' ? '.' : '…'} ${m.san}`;
  }
  function textoNarrador(k) {
    try { return explainer?.explainPly(game.startFen, game.uciHistory, k)?.texto ?? ''; } catch { return ''; }
  }

  function pintarSub() {
    subs.hidden = !opt.subtitulos;
    bSub.classList.toggle('off', !opt.subtitulos);
    const ply = review.viewPly;
    if (ply === 0) {
      subHead.textContent = '';
      subTexto.textContent = '';
      subClase.textContent = '';
      return;
    }
    const k = ply - 1;
    subHead.textContent = nombreJugada(k);
    subTexto.textContent = textoNarrador(k);
    const rc = analisisCtl?.claseDe(k);
    if (rc?.clase && MARCADAS.has(rc.clase)) {
      const c = CLASES[rc.clase];
      subClase.replaceChildren(h('b', { style: { color: c.color } }, `${c.simbolo} ${c.etiqueta}`), detalleDeClase(rc, game.fens[k]));
    } else subClase.textContent = '';
    // reinicia la animación de entrada
    subs.classList.remove('entra'); void subs.offsetWidth; subs.classList.add('entra');
  }

  function pintarFin() {
    const st = game.status();
    const r = analisisCtl?.vigente ? analisisCtl.resumen : null;
    subHead.textContent = st.over ? `Fin de la partida · ${st.reason}` : 'Fin de la reproducción';
    subTexto.textContent = st.over && st.winner ? `Ganan las ${st.winner === 'w' ? 'blancas' : 'negras'}.` : st.over ? 'Tablas.' : '';
    subClase.textContent = r?.precision.w != null ? `Precisión · blancas ${r.precision.w.toFixed(1)}% · negras ${r.precision.b?.toFixed(1) ?? '–'}%` : '';
    subs.hidden = false;
    subs.classList.remove('entra'); void subs.offsetWidth; subs.classList.add('entra');
  }

  function refrescar() {
    const n = game.ply, ply = review.viewPly;
    overlay.querySelector('.cine-progreso-fill').style.width = n ? `${(100 * ply) / n}%` : '0%';
    bPlay.textContent = jugando ? '⏸' : ply >= n ? '⟲' : '▶';
    bPlay.title = jugando ? 'Pausa (espacio)' : ply >= n ? 'Ver otra vez (espacio)' : 'Seguir (espacio)';
    bAtras.disabled = bInicio.disabled = ply <= 0;
    bAdelante.disabled = ply >= n;
    titulo.hidden = ply > 0;
    if (ply >= n && n > 0) pintarFin(); else pintarSub();
    musicaSync();
  }

  function ir(ply) {
    review.goto(Math.max(0, Math.min(game.ply, ply)));
    refrescar();
    if (jugando) programar();
  }

  function programar() {
    clearTimeout(timer);
    if (!jugando) return;
    const ply = review.viewPly;
    if (ply >= game.ply) { jugando = false; refrescar(); return; }
    const k = ply - 1;
    let dur;
    if (ply === 0) dur = 2.4 / opt.velocidad; // tarjeta de título
    else {
      const m = game.moves[k];
      const rc = analisisCtl?.claseDe(k);
      dur = duracionJugada({ san: m.san, captura: !!m.captured, clase: rc?.clase ?? null, caracteres: opt.subtitulos ? (textoNarrador(k).length + (subClase.textContent?.length ?? 0)) : 0, subtitulos: opt.subtitulos, velocidad: opt.velocidad });
    }
    timer = setTimeout(() => { if (jugando) { review.goto(ply + 1); refrescar(); programar(); } }, dur * 1000);
  }

  // ---------- música: sigue la tensión de la jugada que se está viendo ----------
  function calcularTension() {
    const r = analisisCtl?.vigente ? analisisCtl.resumen : null;
    tension = curvaTension({
      jugadas: game.moves.map((m) => ({ san: m.san, captured: m.captured })),
      plies: r?.plies ?? null,
      pos: r ? analisisCtl.analisis.pos : null,
    });
  }
  function musicaSync() {
    if (!musica.sonando || !tension) return;
    const ply = review.viewPly, n = game.ply, k = ply - 1;
    const adelante = ply === plyMusica + 1;
    plyMusica = ply;
    if (ply < n) cerrada = false;
    if (cerrada) return; // ya sonó el cierre: un nuevo dibujado en la última jugada no debe levantar las capas
    musica.setNivel(k >= 0 ? tension.nivel[k] ?? 0 : 0);
    if (!adelante || k < 0) return;
    if (ply >= n) { musica.final(tension.evento[k] === 'mate' ? 'mate' : 'final'); cerrada = true; }
    else if (tension.evento[k]) musica.evento(tension.evento[k]);
  }

  function pausar() { jugando = false; clearTimeout(timer); musica.atenuar(true); refrescar(); }
  function reproducir() {
    if (review.viewPly >= game.ply) review.goto(0);
    jugando = true;
    musica.atenuar(false);
    refrescar();
    programar();
  }
  function alternar() { jugando ? pausar() : reproducir(); }

  // ---------- entrar y salir ----------
  function mostrarMensaje(txt) { msg.textContent = txt ?? ''; msg.hidden = !txt; }

  async function empezar() {
    abierto = true;
    tema0 = getThemeId();
    if (opt.tema && opt.tema !== tema0) setTheme(opt.tema);
    padre = pane3d.parentNode; siguiente = pane3d.nextSibling;
    stage.append(pane3d);
    overlay.hidden = false;
    aplicarPos();
    document.body.classList.add('cine-on');
    try { await overlay.requestFullscreen?.({ navigationUI: 'hide' }); } catch { /* sin pantalla completa: se queda cubriendo la ventana */ }
    view3d?.setQuality?.(opt.calidad);
    view3d?.setCine?.(true);
    view3d?.setEfectos?.({ estallidos: opt.estallidos, bloom: opt.bloom && opt.calidad !== 'baja' });
    wake.set(true);
    review.enter(0);
    bVel.textContent = `${opt.velocidad}×`;
    const a = analisisCtl;
    const nb = nombres?.() ?? {};
    titulo.replaceChildren(h('div', { class: 'cine-titulo-grande' }, nb.blancas && nb.negras ? `${nb.blancas}  vs  ${nb.negras}` : 'Una partida de ajedrez'), h('div', { class: 'cine-titulo-chico' }, `${game.ply} jugadas`));
    silencio = false; cerrada = false; bMus.textContent = '🔊'; plyMusica = 0; tension = null;
    // la música se compone en un worker mientras se prepara el análisis
    const pm = opt.musica && musica.disponible ? musica.preparar(opt.tema).then(() => true, () => false) : null;
    bMus.hidden = !pm;
    if (opt.analizar && a && !a.vigente && !a.motivoNo()) {
      mostrarMensaje('Preparando la película… analizando la partida con el juez');
      const off = a.on('change', (e) => { if (e.estado === 'running') mostrarMensaje(`Preparando la película… posición ${e.hecho} de ${e.total} · toca para saltar`); });
      const saltar = () => a.cancelar();
      msg.onclick = saltar;
      await a.analizar();
      off(); msg.onclick = null;
      mostrarMensaje('');
    }
    if (!abierto) return; // salieron mientras se preparaba
    calcularTension();
    if (pm) {
      mostrarMensaje('Componiendo la música…');
      const ok = await pm;
      mostrarMensaje('');
      if (!abierto) return;
      if (ok) musica.iniciar(opt.volumen);
    }
    jugando = true;
    refrescar();
    programar();
    movido();
  }

  function salir() {
    if (!abierto) return;
    abierto = false;
    wake.set(false);
    pausar();
    analisisCtl?.cancelar();
    clearTimeout(ocultar);
    musica.detener();
    tension = null;
    view3d?.setCine?.(false);
    view3d?.setQuality?.('alta');
    padre?.insertBefore(pane3d, siguiente);
    overlay.hidden = true;
    document.body.classList.remove('cine-on', 'cine-quieto');
    overlay.dataset.fs = '';
    if (document.fullscreenElement === overlay) document.exitFullscreen?.().catch(() => {});
    if (tema0 && getThemeId() !== tema0) setTheme(tema0);
    review.exit();
    window.dispatchEvent(new Event('resize'));
  }

  // fuera de pantalla completa (Esc del navegador) = salir del modo cine
  document.addEventListener('fullscreenchange', () => { if (abierto && !document.fullscreenElement && overlay.dataset.fs === '1') salir(); else if (document.fullscreenElement === overlay) overlay.dataset.fs = '1'; });

  // controles que se esconden si no mueves el ratón / tocas la pantalla
  function movido() {
    document.body.classList.remove('cine-quieto');
    clearTimeout(ocultar);
    ocultar = setTimeout(() => { if (abierto && jugando) document.body.classList.add('cine-quieto'); }, 3000);
  }
  overlay.addEventListener('pointermove', movido);
  overlay.addEventListener('pointerdown', movido);
  progreso.addEventListener('click', (e) => {
    const r = progreso.getBoundingClientRect();
    ir(Math.round(((e.clientX - r.left) / r.width) * game.ply));
  });
  stage.addEventListener('click', () => { if (abierto) { alternar(); movido(); } });

  // teclado: en cine manda el modo cine (se captura antes que los atajos del tablero)
  window.addEventListener('keydown', (e) => {
    if (!abierto) return;
    const k = e.key;
    if (k === ' ' || k === 'Enter') alternar();
    else if (k === 'ArrowRight') { pausar(); ir(review.viewPly + 1); }
    else if (k === 'ArrowLeft') { pausar(); ir(review.viewPly - 1); }
    else if (k === 'Home') ir(0);
    else if (k === 'End') ir(game.ply);
    else if (k === 'Escape') salir();
    else return;
    e.preventDefault(); e.stopPropagation(); movido();
  }, true);

  // ---------- tarjeta de opciones ----------
  function abrir() {
    if (abierto || !game.ply) return;
    opt = cargar();
    if (!opt.tema || !THEMES[opt.tema]) opt.tema = getThemeId();
    const judgeOk = !!analisisCtl?.judge?.config?.enabled; // el cine pausa la partida solo, no hace falta pausarla antes
    const yaHay = !!analisisCtl?.vigente;

    const selCalidad = h('select', {}, Object.entries(CALIDADES).map(([id, n]) => h('option', { value: id }, n)));
    selCalidad.value = opt.calidad;
    const selTema = h('select', {}, Object.entries(THEMES).map(([id, t]) => h('option', { value: id }, t.name)));
    selTema.value = opt.tema;
    const selVel = h('select', {}, VELOCIDADES.map((v) => h('option', { value: v }, `${v}×`)));
    selVel.value = String(opt.velocidad);
    const chkSub = h('input', { type: 'checkbox', checked: opt.subtitulos });
    const selPos = h('select', {}, [['abajo', 'Abajo'], ['arriba', 'Arriba'], ['lado', 'Al lado (pantalla ancha)']].map(([v, n]) => h('option', { value: v }, n)));
    selPos.value = POS_SUBS[opt.subPos] ? opt.subPos : 'abajo';
    const chkEst = h('input', { type: 'checkbox', checked: opt.estallidos });
    const chkBloom = h('input', { type: 'checkbox', checked: opt.bloom });
    const chkMus = h('input', { type: 'checkbox', checked: opt.musica });
    const rngVol = h('input', { type: 'range', min: '0', max: '1', step: '0.05' });
    rngVol.value = String(opt.volumen);
    const chkAn = h('input', { type: 'checkbox', checked: judgeOk && !yaHay && opt.analizar, disabled: !judgeOk || yaHay });
    const nota = yaHay ? 'Ya hay un análisis de esta partida: se usará.' : judgeOk ? 'Tarda un rato (una consulta al juez por jugada); puedes saltarlo al empezar.' : 'Activa el «Análisis con motor · juez» para poder preparar el análisis.';
    const fila = (txt, el, extra) => h('label', { class: 'cine-fila' }, h('span', {}, txt), el, extra);
    const cerrar = () => tarjeta.remove();
    const tarjeta = h('div', { class: 'cine-tarjeta-fondo', onClick: (e) => { if (e.target === tarjeta) cerrar(); } },
      h('div', { class: 'cine-tarjeta', role: 'dialog', 'aria-label': 'Modo cine' },
        h('h3', {}, '🎬 Modo cine'),
        h('p', { class: 'muted small' }, 'El replay a pantalla completa, con el tablero 3D. Espacio pausa, ← → avanzan, Esc sale.'),
        fila('Calidad', selCalidad),
        fila('Tablero', selTema),
        fila('Velocidad', selVel),
        fila('Subtítulos', chkSub),
        fila('Subtítulos en', selPos),
        fila('Piezas que estallan al comer', chkEst),
        fila('Bloom (brillo; pide más a la GPU)', chkBloom),
        fila('Música que sigue la tensión', chkMus),
        fila('Volumen', rngVol),
        fila('Marcar errores y jugadas clave', chkAn),
        h('div', { class: 'muted small' }, nota),
        ...(wake.supported ? [] : [h('div', { class: 'warn small' }, 'Este navegador no permite mantener la pantalla encendida (hace falta https o localhost): puede apagarse sola.')]),
        h('div', { class: 'btn-row' },
          h('button', { class: 'cine-go', onClick: () => {
            opt = { calidad: selCalidad.value, tema: selTema.value, subtitulos: chkSub.checked, velocidad: Number(selVel.value), analizar: chkAn.checked, estallidos: chkEst.checked, bloom: chkBloom.checked, musica: chkMus.checked, volumen: Number(rngVol.value), subPos: selPos.value };
            musica.desbloquear(); // el AudioContext se crea dentro del clic
            guardar(); cerrar(); empezar();
          } }, '▶ Comenzar'),
          h('button', { onClick: cerrar }, 'Cancelar'))));
    document.body.append(tarjeta);
  }

  return { abrir, salir, musica, get abierto() { return abierto; } };
}
