# Minimax v2

Mejora del motor propio. El **v1** (`src/engines/minimax/`) queda intacto como **referencia**; el v2 (`src/engines/minimax2/`) se registra aparte como «Minimax v2», con los mismos 5 niveles, para enfrentarlos en Torneo y Liga.

## Funciones (todas activables)
Valores por defecto en `library/minimax2-config.json` (cambia y recarga). Además, en **Jugar**, **Torneo** y **Liga** cada jugador/participante con Minimax v2 tiene un desplegable «Funciones del v2» con casillas que sobrescriben el valor global (en Torneo/Liga se guardan en el JSON del participante, campo `opciones`). Todo en `false` es el v1: a profundidad fija elige la misma jugada **y recorre exactamente los mismos nodos** (comprobado en la prueba permanente); con tiempo limitado puede diferir porque el v2 es algo más lento por nodo.

| Función | Qué hace |
|---|---|
| `parAlfiles` | +30 por tener los dos alfiles |
| `torresColumnas` | torre en columna abierta (+20) / semiabierta (+10) y en la 7.ª (+12) |
| `estructuraPeones` | −10 por peón doblado, −12 por peón aislado |
| `peonesPasados` | bonus 10–120 según avance; más peso en los finales |
| `seguridadRey` | escudo de peones, columnas abiertas junto al rey y piezas rivales a ≤3 casillas (solo medio juego) |
| `movilidad` | alfiles y torres según casillas alcanzables |
| `finalArrinconar` | cuando un bando gana por ≥4 peones y el rival no tiene piezas (solo rey y peones): +10 por cada paso del rey rival hacia el borde y +4 por cada casilla que acerca los reyes. Sin esto, en rey y torre contra rey el motor no ve el mate con poca profundidad y empata por la regla de 50 jugadas |
| `nullMove` | poda con jugada nula (R=2/3), no en jaque ni sin piezas |
| `lmrMejorado` | reducción de jugadas tardías según profundidad y orden (tabla logarítmica) |
| `aspiracion` | raíz con ventana alrededor de la puntuación anterior; si falla, repite abierta |
| `contraataque` | recuerda qué jugada refutó a la anterior y la ordena antes |
| `podaQuiescence` | evaluación perezosa, poda delta y descarte de capturas malas |
| `repeticiones` | repetición = tablas, usando el historial de la partida (v1 no las veía dentro de la búsqueda) |
| `iteracionParcial` | si el tiempo se agota a mitad de una profundidad y ya se halló una jugada con puntuación exacta mejor que la de la iteración anterior, se juega esa (el resultado trae `parcial: true`). Solo sin ruido (niveles 4 y 5); apagada, esa iteración se descarta como en el v1 |
| `gravedadHistorial` | el contador de jugadas tranquilas que provocan cortes se frena en 5e6 para no alcanzar las bandas de killers (8–9e6), contraataque (7e6) y capturas (1e7). Apagada, crece sin tope |
| `tiempoDinamico` | **apagada por defecto**: se detiene antes si la mejor jugada es estable; ahorra tiempo pero no sube la fuerza con tiempo fijo por jugada |

## Cómo comparar
Pon al v1 y al v2 (mismo nivel) en una Liga o Torneo. Para medir una función concreta: dos participantes «Minimax v2» del mismo nivel, uno con la función apagada. Con pocas partidas el resultado es ruidoso: deja correr varias.

## Pruebas y ablación
Varias suites en `tools/pruebas.mjs` (cada función sola, paquetes de funciones, contra el v1 o contra Stockfish). Qué hace cada una, cómo calibrarlas y cómo leer la tabla: [PRUEBAS.md](PRUEBAS.md).

## Notas técnicas
- La jugada nula se implementa sobre los internos de chess.js 1.4.0 (turno, casilla al paso y hash Zobrist con la clave de turno deducida al arrancar).
- Los motores reciben el historial de la partida: `engine.setPosition(fen, historial)` (FEN de las posiciones previas); los demás motores lo ignoran.
- Los términos extra de evaluación se calculan recorriendo el tablero (más lento por nodo, más profundo gracias a las podas). Es el primer sitio donde optimizar si hiciera falta (p. ej. caché de estructura de peones).
- Probado de forma puntual (mates, táctica, cada interruptor apagado, todo apagado). Las pesas de evaluación son un primer ajuste razonable, **sin afinar**: afinarlas con partidas es el siguiente paso.

## Mediciones preliminares (arena en Node, v2 contra v1, 64 partidas, colores cambiados, aperturas de la librería)
| Configuración del v2 | Tiempo/jugada | Resultado | Elo relativo aprox. |
|---|---|---|---|
| Todo activado | 100 ms | 58 % ±12 | +55 |
| Solo búsqueda (evaluación extra apagada) | 100 ms | 60 % ±12 | +72 |
| Todo activado | 300 ms | **71 % ±11** | **+156** |

Con 32 partidas y 100 ms: solo evaluación 55 %, solo búsqueda 64 %, todo 50 % (ruido de ±17). Lectura honesta: la mejora crece con el tiempo por jugada (las podas rinden más a más profundidad); a tiempos muy cortos el coste de la evaluación extra compensa lo que aporta. Los márgenes son amplios y las pesas de evaluación siguen sin afinar. Los niveles reales (1.5–8 s) deberían verse más cerca del resultado de 300 ms que del de 100 ms.
