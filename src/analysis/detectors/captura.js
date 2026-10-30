import { VAL, attackersInfo, other } from '../helpers.js';
export const captura = {
  id: 'captura', grupo: 'material',
  detect({ after, move, color, prev }) {
    if (!move.captured) return null;
    const vm = VAL[move.piece], vc = VAL[move.captured];
    const slots = { pieza: move.piece, capturada: move.captured, casilla: move.to };
    const defendida = attackersInfo(after, move.to, other(color)).list.length > 0;
    if (prev?.captured && prev.to === move.to) return { id: 'recaptura', prioridad: 68, slots };
    if (!defendida || vc > vm) return { id: 'captura_gana', prioridad: 70, slots };
    if (vc === vm) return { id: 'captura_cambio', prioridad: 62, slots };
    return { id: 'captura_desigual', prioridad: 66, slots };
  },
};
