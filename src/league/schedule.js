/**
 * Calendario todos contra todos (método del círculo). Con número impar de participantes alguien
 * descansa cada ronda. Cada cruce es UNA pareja de partidas (colores cambiados, misma apertura).
 * @returns {{id:string, ronda:number, a:string, b:string}[]}
 */
export function roundRobin(ids) {
  const list = [...ids];
  if (list.length % 2) list.push(null); // descanso
  const n = list.length;
  const cruces = [];
  let k = 0;
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = list[i], b = list[n - 1 - i];
      if (a && b) cruces.push({ id: `c${++k}`, ronda: r + 1, a, b });
    }
    list.splice(1, 0, list.pop()); // rota todos menos el primero
  }
  return cruces;
}
