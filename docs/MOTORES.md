# Motores

## Contrato (`src/engines/engine.js`)

```js
class MiMotor extends Engine {
  async init() {}                       // workers, WASM, modelos…
  async setPosition(fen) { this.fen = fen; }
  async go({ depth, time, noise }) {    // → { move:'e2e4', eval, mate, depth, nodes, pv:[] } | null
    ...
  }
  stop() {}                             // cancelar: go() debe resolverse con null
  dispose() {}
}
```

- Jugadas en **UCI**. `eval` en centipeones desde el punto de vista de las blancas.
- Puede llamar a `this.onInfo({ depth, eval, nodes, pv })` durante la búsqueda: la UI lo muestra en vivo.

## Registrar

En `src/engines/index.js`:

```js
registerEngine('mi-motor', {
  name: 'Mi motor',
  description: '...',
  levels: [{ id: '1', name: 'Fácil', limits: { depth: 2 } }, { id: '2', name: 'Fuerte', limits: { depth: 8, time: 5000 } }],
  create: async () => new MiMotor(),
});
```

Aparece solo en los selectores de cada jugador, con sus niveles. Ejemplos incluidos:

- `minimax/` — motor propio con Web Worker (`minimax-core.js` es JS puro, probado también en Node).
- `random/` — 15 líneas; el punto de partida más simple.

## Stockfish WASM (pendiente)

Un `StockfishEngine` es un adaptador UCI: `setPosition` → `position fen …`, `go` → `go depth N movetime T`,
y se parsea `info … score cp … pv …` hacia `onInfo`, y `bestmove` hacia el resultado. Se carga como Worker desde
`vendor/stockfish/`. El resto de la app no cambia.

## Fuerza y ruido

`limits.noise` (centipeones) suma ruido aleatorio a la elección en la raíz: niveles bajos juegan "humano".
Con `noise > 0` el motor busca cada jugada con ventana completa (más lento, pero a profundidades bajas es irrelevante).


## Stockfish 19 (WASM lite, un hilo) — incluido
- Archivos en `vendor/stockfish/` (GPL-3.0, ver `README.txt` y `LICENSE-GPL3.txt`). Sin cabeceras especiales de servidor: funciona con `python3 -m http.server`.
- Adaptador: `src/engines/stockfish/stockfish-engine.js` (UCI dentro de un Web Worker; evaluación siempre desde las blancas; `stop()` termina el worker y se recrea en el siguiente `go()`).
- Niveles por Elo aproximado (`UCI_LimitStrength` + `UCI_Elo`, rango 1320–3190) y "Máximo". Se editan en `STOCKFISH_LEVELS`.
- Aparece como motor «Stockfish 19 (WASM lite)» en Jugar y en Torneo.
- Para actualizar la versión: `npm pack stockfish`, copiar `bin/stockfish-<v>-lite-single.{js,wasm}` y cambiar `STOCKFISH_FILE`.
- Nota: el `.wasm` debe servirse como `application/wasm` (Python lo hace bien).


## Minimax v1 (referencia) y v2
El motor «Minimax (propio)» (`minimax`) es el **v1**, congelado como referencia. «Minimax v2» (`minimax2`) es la versión mejorada con funciones activables: ver [MINIMAX2.md](MINIMAX2.md).

### Stockfish y el historial

El adaptador envía `position fen <FEN> moves …` con las jugadas desde la última captura o movimiento de peón (reconstruidas con el historial de FEN de `setPosition`). Así Stockfish ve las repeticiones de la partida; con solo el FEN actual estaba ciego a ellas (ni las evitaba si ganaba ni las buscaba si perdía). Si no se puede reconstruir, usa `position fen` simple.

### Stockfish: tipo de dificultad

El desplegable de nivel de Stockfish tiene dos grupos (con `<optgroup>`), así que "tipo de dificultad" y nivel se eligen en el mismo control:

- **Elo limitado** (1–5): `UCI_LimitStrength` + `UCI_Elo`. Stockfish juega con errores arbitrarios. Son el ancla del Elo estimado de las ligas.
- **Profundidad limitada** (Prof. 1, 2, 4, 6, 8, 12, 16): fuerza completa pero con poca visión; juega coherente, solo "ve" menos jugadas adelante. No tienen Elo asociado.
- **6 · Máximo**: depth 22 / 5 s.

Cada nivel puede declarar `group`, `weak` (juez poco fiable) y `max` (nivel por defecto del juez). Los ids viejos ('1'…'6') no cambian, así que los torneos y ligas guardados siguen cargando. Con solo niveles por profundidad una liga no muestra Elo estimado (no hay ancla).
