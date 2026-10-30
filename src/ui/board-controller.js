/**
 * Une la partida con las vistas del tablero (2D, 3D o las que haya):
 * calcula el estado a dibujar, gestiona selección de casillas y jugadas humanas.
 *
 * Contrato de vista: { setState(state), setTheme(theme), onSquareClick, destroy() }
 *   state = { board, lastMove, checkSquare, selected, targets:[{sq,capture}], orientation, move, marks:[{sq,tipo}] }
 *   marks: ayudas del modo Práctica ('riesgo' | 'vulnerable' | 'clavada'); vacío si no hay ayuda o están apagadas.
 */
import { Chess } from '../core/chess.js';
import { calcularMarcas } from '../analysis/marcas.js';

export class BoardController {
  constructor({ game, match, views, askPromotion, review = null, modo = null }) {
    this.review = review;
    this.modo = modo;
    this.marcasOn = false;
    this.flechas = []; // flechas de 💡: [{from,to,tipo:'mejor'|'respuesta'}]; se borran en cuanto cambia la posición
    this.game = game;
    this.match = match;
    this.views = views;
    this.askPromotion = askPromotion;
    this.orientation = 'w';
    this.selected = null;
    for (const v of views) v.onSquareClick = (sq) => this.click(sq);
    game.on('change', (ev) => {
      this.selected = null;
      this.flechas = [];
      this.render(ev);
    });
    review?.on('change', (ev) => { this.selected = null; this.flechas = []; this.render({ kind: ev.move ? 'move' : 'review', move: ev.move }); });
    modo?.on('change', () => { if (!modo.ayuda) this.flechas = []; this.render(); });
    this.render();
  }

  setFlechas(list) { this.flechas = this.modo?.ayuda ? list : []; this.render(); }

  setMarcas(on) { this.marcasOn = !!on; this.render(); }

  /** Color "propio": el humano si juega uno solo; si no, el que tiene el turno. */
  #propio(pos) {
    const hum = ['w', 'b'].filter((c) => this.match.players[c]?.kind === 'human');
    return hum.length === 1 ? hum[0] : pos.turn();
  }

  setTheme(theme) {
    for (const v of this.views) v.setTheme(theme);
  }

  flip() {
    this.orientation = this.orientation === 'w' ? 'b' : 'w';
    this.render();
  }

  async click(sq) {
    const { game, match } = this;
    if (this.review?.active) return; // revisando: el tablero es de solo lectura
    if (game.status().over) return;
    if (match.running && match.isEngineTurn()) return; // no es turno humano
    if (this.selected) {
      const candidates = game.legalMoves(this.selected).filter((m) => m.to === sq);
      if (candidates.length) {
        const from = this.selected;
        this.selected = null;
        let promotion;
        if (candidates.some((m) => m.promotion)) {
          promotion = await this.askPromotion(game.turn);
          if (!promotion) return this.render();
        }
        game.play({ from, to: sq, promotion }); // 'change' vuelve a dibujar
        return;
      }
    }
    const piece = game.chess.get(sq);
    this.selected = piece && piece.color === game.turn && this.selected !== sq ? sq : null;
    this.render();
  }

  state(ev) {
    const { game } = this;
    const reviewing = !!this.review?.active;
    const ply = reviewing ? this.review.ply : game.ply;
    const pos = reviewing ? new Chess(game.fens[ply]) : game.chess; // posición mostrada
    const board = pos.board();
    let checkSquare = null;
    if (pos.isCheck()) {
      outer: for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.type === 'k' && p.color === pos.turn()) { checkSquare = p.square; break outer; }
      }
    }
    const targets = new Map();
    if (this.selected && !reviewing) {
      for (const m of game.legalMoves(this.selected)) {
        targets.set(m.to, { sq: m.to, capture: !!m.captured });
      }
    }
    const lm = ply > 0 ? game.moves[ply - 1] : null;
    return {
      board,
      lastMove: lm ? { from: lm.from, to: lm.to } : null,
      checkSquare,
      selected: this.selected,
      targets: [...targets.values()],
      orientation: this.orientation,
      move: ev?.kind === 'move' ? ev.move : null,
      arrows: this.flechas,
      marks: this.marcasOn && this.modo?.ayuda && !game.status().over ? calcularMarcas(pos, this.#propio(pos)) : [],
    };
  }

  render(ev) {
    const s = this.state(ev);
    for (const v of this.views) v.setState(s);
  }
}
