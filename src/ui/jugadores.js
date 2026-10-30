/** Nombre legible de cada bando: "Humano" o "Motor (nivel)". */
export function describirJugadores(match, engines) {
  const nameOf = (c) => {
    const p = match.players[c];
    if (p.kind === 'human') return 'Humano';
    const info = engines?.getEngineInfo?.(p.engineId);
    const lvl = p.custom ? 'personalizado' : info?.levels.find((l) => l.id === p.levelId)?.name ?? p.levelId;
    return `${info?.name ?? p.engineId}${lvl ? ` (${lvl})` : ''}`;
  };
  return { blancas: nameOf('w'), negras: nameOf('b') };
}
