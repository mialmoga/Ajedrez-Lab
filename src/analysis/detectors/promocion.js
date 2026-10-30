export const promocion = {
  id: 'promocion', grupo: 'especial',
  detect({ move }) {
    return move.promotion ? { id: 'promocion', prioridad: 90, slots: { casilla: move.to, nueva: move.promotion } } : null;
  },
};
