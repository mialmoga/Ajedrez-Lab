# Análisis de la partida

Panel «Análisis de la partida» (tablero principal). El juez (el de «Explicación de la jugada», Stockfish por defecto) evalúa
cada posición y se obtiene, por jugada, una clase; por bando, contadores y precisión.

## Cómo se usa
Con la partida en pausa o terminada (también una importada, PGN/JSON, o una de torneo/liga abierta en el tablero): **🔍 Analizar partida**.
Hay barra de progreso y botón Cancelar. Si la partida cambia mientras analiza, se cancela; si cambia después, el panel avisa de que está desactualizado.

## Clases (`src/analysis/analisis.js`)
Pérdida = centipeones que pierde quien mueve respecto a la posición anterior (según el juez). Umbrales = los del narrador (`verdict.js`).
| Clase | Regla |
|---|---|
| 📖 Libro | jugada de una línea de la librería de aperturas y sin pérdida relevante |
| !! Brillante | mejor jugada (pérdida ≤ 15) que ofrece una pieza, sin perder la posición (≥ −0.5) y sin estar ya ganando de sobra (≤ +6) |
| ★ Mejor | la del juez, o pérdida ≤ 15 cp |
| ✓ Buena | pérdida < 50 |
| ?! Imprecisión | 50–119 |
| ? Error | 120–299 |
| ?? Error grave | ≥ 300, o dejar pasar un mate corto (≤ 6) |
Excepción: si antes y después la ventaja es decisiva (±5 peones o más) no se castiga, salvo pérdidas enormes.
«Genial» (jugada única) no existe: haría falta que el juez devuelva varias líneas.

## Precisión
Por jugada: `103.1668·e^(−0.04354·Δ) − 3.1669`, con Δ = caída de probabilidad de ganar (0–100) del que mueve; probabilidad = `50 + 50·(2/(1+e^(−0.00368208·cp)) − 1)` (fórmulas públicas de Lichess). Se promedia por bando. Es una aproximación: no coincide con otras páginas.

## Formato (`analisis`, versión 1)
`{ version, juez, inicio?, jugadas:[uci], pos:[{e,m,b}] (N+1), lib:[bool], sac:[bool] }` — `e` cp (blancas), `m` mate (+ blancas), `b` mejor jugada del juez en esa posición.
Pruebas: `tests/analisis.test.mjs`.

## En el replay y en la lista
Con un análisis vigente:
- **Jugadas**: las brillantes y las imprecisiones, errores y errores graves llevan su símbolo de color (`!!`, `?!`, `?`, `??`) y un texto al pasar el cursor con lo que pierden.
- **Explicación de la jugada**: debajo de la jugada mostrada sale la clase (`?? Error grave · pierde ~3.1 · era mejor Nf3`; las buenas dicen «coincide con la del juez»).
- **Flecha**: al revisar una jugada floja (y con ayudas disponibles, que en un replay siempre las hay) se dibuja en verde la jugada que debió hacerse sobre el tablero que se ve.

## Se guarda con la partida
- **Autoguardado:** al terminar el análisis queda guardado con la partida actual (se recupera al recargar) y con su copia en «Partidas guardadas», aunque la partida ya estuviera archivada. Un análisis pesa unos 10–20 KB.
- **JSON exportado:** el campo `analisis` viaja con la partida; al importar solo se usa si coincide jugada por jugada. El PGN no lo lleva.
- **Al abrir una guardada** («Revisar») o importar un JSON con análisis, se carga solo y no hay que repetirlo.
- Si cambias de partida (Nueva, importar otra…) el análisis anterior se descarta; si solo añades o deshaces jugadas, el panel avisa de que está desactualizado.
