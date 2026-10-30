/**
 * Punto de entrada. Aquí se ensamblan los módulos; cada pieza es reemplazable:
 *  - motores:   src/engines/index.js (registro)
 *  - vistas:    cualquier objeto con el contrato de vista (ver docs/ARQUITECTURA.md)
 *  - paneles:   funciones create*Panel(root, ctx)
 *  - temas:     src/ui/themes.js
 */
import { Game } from './core/game.js';
import { Match } from './core/match.js';
import * as engines from './engines/index.js';
import { Library, loadDefaultLibrary } from './library/library.js';
import { pickBookMove } from './library/detector.js';
import { THEMES, applyTheme } from './ui/themes.js';
import { h } from './ui/dom.js';
import { createBoard2D } from './ui/board2d.js';
import { createBoard3D } from './ui/board3d.js';
import { Review } from './core/review.js';
import { AutoSave } from './core/autosave.js';
import { describirJugadores } from './ui/jugadores.js';
import { createSavedPanel } from './ui/panel-saved.js';
import { BoardController } from './ui/board-controller.js';
import { askPromotion } from './ui/promotion.js';
import { createGamePanel } from './ui/panel-game.js';
import { createMovesPanel } from './ui/panel-moves.js';
import { createLibraryPanel } from './ui/panel-library.js';
import { createExplainPanel, restoreJudgeConfig } from './ui/panel-explain.js';
import { createAnalysisPanel } from './ui/panel-analisis.js';
import { createCine } from './ui/cine.js';
import { AnalisisCtl } from './analysis/analisis-ctl.js';
import { Judge } from './analysis/judge.js';
import { Explainer } from './analysis/explainer.js';
import { Dictionary, loadDictionary } from './analysis/dictionary.js';
import { createExchangePanel } from './ui/panel-exchange.js';
import { Rechazos } from './exchange/rechazos.js';
import { GameMode } from './core/modo.js';
import { ensureFonts } from './ui/fonts.js';
import { createTournamentView } from './ui/tournament-view.js';
import { createLeagueView } from './ui/league-view.js';

await ensureFonts(); // fuente embebida lista antes de dibujar tableros y etiquetas

const store = {
  get: (k, d) => { try { return localStorage.getItem(`ajedrez-lab:${k}`) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(`ajedrez-lab:${k}`, v); } catch { /* sin almacenamiento */ } },
};

// --- núcleo ---
const game = new Game();
const match = new Match(game, engines);
const library = new Library();
match.book = (fen) => pickBookMove(library, fen);
const explainer = new Explainer({ library, dictionary: new Dictionary() });
const judge = new Judge({ engines });
restoreJudgeConfig(judge);

// --- tema y vista ---
let themeId = store.get('theme', 'clasico');
if (!THEMES[themeId]) themeId = 'clasico';
let theme = applyTheme(themeId);
let viewMode = store.get('view', 'both');

// --- estructura de la página ---
const app = document.getElementById('app');
const boardsEl = h('section', { class: 'boards' });
const side = h('aside', { class: 'side' });

const themeSel = h('select', { 'aria-label': 'Tema' }, Object.entries(THEMES).map(([id, t]) => h('option', { value: id }, t.name)));
themeSel.value = themeId;
const viewSel = h('select', { 'aria-label': 'Vista' },
  h('option', { value: 'both' }, '3D + 2D'), h('option', { value: '3d' }, 'Solo 3D'), h('option', { value: '2d' }, 'Solo 2D'));
viewSel.value = viewMode;

const fsBtn = h('button', { class: 'fs-btn', title: 'Pantalla completa', 'aria-label': 'Pantalla completa', onClick: () => {
  try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch { /* no soportado */ }
} }, '⛶');
document.addEventListener('fullscreenchange', () => { fsBtn.textContent = document.fullscreenElement ? '🗗' : '⛶'; window.dispatchEvent(new Event('resize')); });
const navPlay = h('button', { class: 'nav on', onClick: () => showView('play') }, 'Jugar');
const navTournament = h('button', { class: 'nav', onClick: () => showView('tournament') }, 'Torneo');
const navLeague = h('button', { class: 'nav', onClick: () => showView('league') }, 'Liga');
const playEl = h('main', { class: 'layout' }, boardsEl, side);
const tournamentEl = h('main', { class: 'tournament', hidden: true });
const leagueEl = h('main', { class: 'tournament', hidden: true });
app.append(
  h('header', { class: 'top' }, h('h1', { title: 'Ajedrez Lab' }, h('span', { class: 'logo' }, '♞'), h('span', { class: 'logo-text' }, ' Ajedrez Lab')), h('nav', { class: 'top-nav' }, navPlay, navTournament, navLeague), h('div', { class: 'top-ctl' }, viewSel, themeSel, fsBtn)),
  playEl, tournamentEl, leagueEl);

let tournamentView = null;
let leagueView = null;
function showView(name) {
  const t = name === 'tournament', l = name === 'league';
  playEl.hidden = t || l;
  tournamentEl.hidden = !t;
  leagueEl.hidden = !l;
  viewSel.hidden = t || l;
  navPlay.classList.toggle('on', !t && !l);
  navTournament.classList.toggle('on', t);
  navLeague.classList.toggle('on', l);
  // abre una partida del torneo/liga en el tablero principal (3D), en pausa para poder seguir jugándola a mano
  const viewCtx = {
    engines, library, explainer, judge, getTheme: () => theme,
    openInMain(rec, ply) {
      match.setRunning(false);
      game.loadMoves(rec.jugadas, rec.inicio ?? undefined); // la partida completa…
      review.enter(ply); // …en revisión, parado donde estabas en el visor
      showView('play');
    },
  };
  if (t) { tournamentView ??= createTournamentView(tournamentEl, viewCtx); tournamentView.onShow(); }
  if (l) { leagueView ??= createLeagueView(leagueEl, viewCtx); leagueView.onShow(); }
}

const pane3d = h('div', { class: 'pane pane3d' });
const pane2d = h('div', { class: 'pane pane2d' });
const dock = h('aside', { class: 'dock' }); // móvil horizontal con una sola vista: jugadas + comentarista junto al tablero
boardsEl.append(pane3d, pane2d, dock);

const views = [createBoard3D(pane3d, { theme }), createBoard2D(pane2d, { theme })];
const review = new Review(game, match);
const modo = new GameMode(game, match, review); // Prueba / Práctica (ayudas)
const boardCtl = new BoardController({ game, match, views, askPromotion, review, modo });

// Autoguardado: la partida actual se recupera al abrir (en pausa) y las últimas 10 quedan en una lista.
const analisisCtl = new AnalisisCtl({ game, match, judge, library, explainer });
const autosave = new AutoSave(game, match, { describe: () => describirJugadores(match, engines), modo, analisis: analisisCtl });
const recovered = autosave.restore(); // antes de crear los paneles, para que muestren los jugadores recuperados
const saveNow = () => autosave.saveCurrent();
window.addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });

function applyView() {
  boardsEl.dataset.view = viewMode;
  window.dispatchEvent(new Event('resize')); // los canvas se reajustan solos al cambiar el tamaño
}
viewSel.addEventListener('change', () => { viewMode = viewSel.value; store.set('view', viewMode); applyView(); });
function cambiarTema(id) {
  if (!THEMES[id]) return;
  themeId = id;
  themeSel.value = id;
  store.set('theme', themeId);
  theme = applyTheme(themeId);
  boardCtl.setTheme(theme);
  tournamentView?.setTheme(theme);
  leagueView?.setTheme(theme);
}
themeSel.addEventListener('change', () => cambiarTema(themeSel.value));
applyView();

// --- paneles ---
const section = (title, open, build) => {
  const body = h('div', { class: 'sec-body' });
  side.append(h('details', { class: 'sec', open, 'data-sec': title }, h('summary', {}, title), body));
  return build(body);
};
const rechazos = new Rechazos();
game.on('change', (ev) => { if (ev.kind === 'reset') rechazos.reset(); });
const cine = createCine({ game, review, explainer, analisisCtl, pane3d, view3d: views[0], getThemeId: () => themeId, setTheme: cambiarTema, nombres: () => describirJugadores(match, engines), store });
const ctx = { game, match, engines, library, explainer, judge, boardCtl, review, rechazos, modo, analisisCtl, cine, getTheme: () => theme };
section('Partida', true, (el) => createGamePanel(el, ctx));
section('Jugadas', true, (el) => createMovesPanel(el, ctx));
const movesDetails = side.lastElementChild;
const explainPanel = section('Explicación de la jugada', true, (el) => createExplainPanel(el, ctx));
const explainDetails = side.lastElementChild;
section('Análisis de la partida', false, (el) => createAnalysisPanel(el, ctx));
const libPanel = section('Librería de aperturas', true, (el) => createLibraryPanel(el, ctx));
section('Intercambio por PNG / texto', false, (el) => createExchangePanel(el, ctx));

const libDetails = side.lastElementChild;
const savedPanel = section('Partidas guardadas', false, (el) => createSavedPanel(el, { autosave, game, match, review, analisisCtl }));
if (recovered) {
  savedPanel.notify(`Partida recuperada: ${recovered} jugadas, en pausa. Pulsa Reanudar para seguir.`);
  side.lastElementChild.open = true; // ábrelo para que se vea el aviso
}
// Móvil/tableta en horizontal con UNA sola vista: jugadas y comentarista pasan a la mitad libre de la pantalla.
const dockQuery = window.matchMedia?.('(orientation: landscape) and (max-height: 699px)');
function placeDock() {
  const toDock = !!dockQuery?.matches && viewMode !== 'both';
  if (toDock) dock.append(explainDetails, movesDetails);
  else { side.insertBefore(movesDetails, libDetails); side.insertBefore(explainDetails, libDetails); }
  window.dispatchEvent(new Event('resize'));
}
dockQuery?.addEventListener?.('change', placeDock);
viewSel.addEventListener('change', placeDock);
placeDock();

fetch('library/minimax2-config.json').then((r) => (r.ok ? r.json() : null)).then((c) => { if (c?.funciones) engines.setMinimax2Defaults(c.funciones); }).catch(() => {});
loadDefaultLibrary(library).then(() => { libPanel.refresh(); explainPanel.refresh(); });
loadDictionary().then((d) => { explainer.setDictionary(d); judge.umbrales = { ...judge.umbrales, ...d.umbrales }; explainPanel.refresh(); });

// Teclado en el tablero principal: ← → Inicio Fin recorren la partida; Esc vuelve a la posición actual.
window.addEventListener('keydown', (e) => {
  if (playEl.hidden || e.altKey || e.ctrlKey || e.metaKey) return;
  const t = e.target;
  if (t?.closest?.('input, select, textarea, [contenteditable]')) return;
  if (e.key === 'ArrowLeft') review.goto(review.viewPly - 1);
  else if (e.key === 'ArrowRight') { if (review.active) review.goto(review.viewPly + 1); }
  else if (e.key === 'Home') review.goto(0);
  else if (e.key === 'End') { if (review.active) review.exit(); }
  else if (e.key === 'Escape') review.exit();
  else return;
  e.preventDefault();
});

window.ajedrezLab = { game, match, library, engines, review, autosave, modo, vistas: views, cine }; // útil para depurar desde la consola
