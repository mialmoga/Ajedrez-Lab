export const enroque = {
  id: 'enroque', grupo: 'especial',
  detect({ move }) {
    if (move.flags.includes('k')) return { id: 'enroque_corto', prioridad: 80, slots: {} };
    if (move.flags.includes('q')) return { id: 'enroque_largo', prioridad: 80, slots: {} };
    return null;
  },
};
