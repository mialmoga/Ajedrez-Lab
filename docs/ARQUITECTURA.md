# Arquitectura

Todo se habla por **contratos pequeños** y un bus de eventos. Cada pieza se puede reemplazar sin tocar el resto.

```
          ┌────────┐ change/gameover ┌───────────────┐ setState ┌──────────┐
 clics ─► │ Game   │ ───────────────►│ BoardController│────────►│ Vistas   │ (2D, 3D, …)
          └───▲────┘                 └───────▲───────┘          └──────────┘
              │ play()                       │ click(sq)
          ┌───┴────┐  go()/stop()      ┌─────┴──────┐
          │ Match  │ ◄────────────────►│ Engine(s)  │  (registro de motores)
          └────────┘                   └────────────┘
```

## Núcleo (`src/core`)

- **`Game`** — envuelve chess.js. `play(SAN | UCI | {from,to,promotion})`, `undo()`, `reset(fen)`,
  `loadMoves(lista, fen)`, `status()`. Eventos: `change {kind:'move'|'undo'|'reset', move?}`, `gameover`.
- **`Match`** — quién juega cada lado (`players.w/b`: `{kind:'human'}` o `{kind:'engine', engineId, levelId, custom}`),
  pausa, retardo entre jugadas, libro de aperturas opcional. Cualquier cambio en la partida cancela la
  búsqueda en curso y relanza la lógica. Eventos: `thinking`, `info`, `engine-move`, `state`, `error`.
- **`Review`** — modo revisión sobre `Game`: `enter/goto/step/exit/continueHere`; pausa el `Match` mientras está activo (ver `docs/PARTIDAS.md`).
- **`EventBus`** — `on(tipo, fn)` devuelve la función para desuscribirse.
- **`chess.js` (wrapper)** — único punto de entrada a la librería de reglas.

## Vistas (`src/ui`)

Una vista es cualquier objeto con este contrato (así se añade, quita o reescribe un tablero):

```js
{
  setState({ board, lastMove, checkSquare, selected, targets, orientation, move }),
  setTheme(theme),
  onSquareClick: (sq) => {},   // la asigna el BoardController
  destroy(),
}
// board = chess.board() · lastMove = {from,to}|null · targets = [{sq, capture}]
// move = jugada verbose recién hecha (para animar) o null
```

`BoardController` calcula el estado, gestiona la selección de casillas y las jugadas humanas
(incluida la promoción) y llama a `setState` en todas las vistas. Para una vista nueva: créala en
`main.js` y añádela al array `views`.

### Paneles

`createXxxPanel(root, ctx)` con `ctx = { game, match, engines, library, boardCtl, getTheme }`.
Añade uno con la función `section(...)` de `main.js`.

### Temas

`src/ui/themes.js`: colores de la interfaz (variables CSS), del 2D y del 3D. Un bloque nuevo aparece solo en el selector.

## Librería (`src/library`)

- `Library` carga y **valida reproduciendo** cada línea con chess.js; indexa por FEN (sin contadores).
- `analyze(library, game)` → líneas vivas, siguientes jugadas con %, nota de la última jugada, dónde se salió del libro.
- `pickBookMove(library, fen)` → jugada ponderada para usar la librería como libro de aperturas.

## Intercambio (`src/exchange`)

- `png-chunks.js` — chunks tEXt (puro, probado en Node).
- `png.js` — dibuja la posición en un canvas e incrusta el estado.
- `parse-move.js` — extrae la primera jugada legal de texto libre.

## Torneo (`src/tournament`)

- `bracket.js` — lógica pura (semillas, byes, avance, puntos, desempates).
- `game-runner.js` — `playGame()`: una partida motor-vs-motor sin interfaz.
- `tournament.js` — `Tournament`: ejecuta el cuadro con paralelismo, pausa/reanuda; todo el estado es JSON (`this.data`).
- `storage.js` — guardado en localStorage. UI: `src/ui/tournament-*.js`, `bracket-view.js`, `replay-viewer.js`, `eval-chart.js`.

## Fuentes

`vendor/fonts` (DejaVu, licencia libre) se declaran en `styles.css` y se esperan con `ensureFonts()` antes de dibujar.
Cambiar de tipografía = cambiar esos tres archivos y los nombres en `ui/fonts.js`.

## Convenciones

- Jugadas entre módulos en **UCI** (`e2e4`, `e7e8q`); SAN solo para mostrar.
- Evaluación en centipeones desde el punto de vista de las **blancas**.
