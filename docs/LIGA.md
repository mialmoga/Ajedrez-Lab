# Liga (todos contra todos)

Pestaña **Liga**. Cada participante (nombre + motor + nivel) juega contra todos los demás; sirve para comparar motores y estimar un Elo.

## Reglas
- Cada **cruce** = una pareja de partidas: 2 partidas con colores cambiados y la **misma apertura** (de la librería ponderada por `peso`, o 4 jugadas al azar). 2 a 12 participantes.
- Calendario por el método del círculo (`src/league/schedule.js`); con número impar alguien descansa cada ronda.
- Mismas reglas de partida que el torneo: tope de jugadas, adjudicación por ventaja decisiva, partidas simultáneas.
- **Desempate en la tabla** (sin partidas extra): puntos → enfrentamiento directo entre los empatados → victorias → semilla.

## Elo estimado
- `src/league/standings.js › estimateElo`: máxima verosimilitud sobre todas las partidas, **anclada** en participantes con Elo conocido: los niveles de Stockfish por Elo (`limits.elo`) o un nivel personalizado con `elo`.
- Lleva una partida virtual de tablas contra el promedio de los anclajes (evita valores infinitos con 100 % o 0 %).
- Se muestra como `~1850 ± 140`: el margen es al 95 % y es amplio con pocas partidas. Es un valor de referencia, no un Elo oficial (el Elo de Stockfish limitado tampoco coincide exactamente con FIDE).
- Sin ningún ancla no hay Elo; la tabla sigue funcionando.

## Interfaz
Tabla (PJ, G, T, D, Pts, Elo), matriz de resultados (clic en una celda → sus 2 partidas → visor con evaluación y explicaciones, o abrir en el tablero 3D), pausa/reanudación, autoguardado en el navegador (localStorage) y **Exportar/Importar JSON**. Si se borran los datos del sitio el autoguardado se pierde: exporta lo que quieras conservar.

## Formato `ajedrez-lab/liga@1`
```json
{ "formato": "ajedrez-lab/liga@1", "id": "...", "nombre": "...", "estado": "pendiente|en curso|pausado|terminado",
  "config": { "maxJugadas": 250, "concurrencia": 3, "usarLibreria": true, "adjudicar": true },
  "participantes": [ { "id": "p1", "nombre": "...", "motor": "minimax", "nivel": "4", "limites": null, "semilla": 1 } ],
  "cruces": [ { "id": "c1", "ronda": 1, "a": "p1", "b": "p2", "estado": "terminado",
      "pares": [ { "apertura": { "nombre": "...", "jugadas": ["e2e4"] },
                   "partidas": [ { "blancas": "p1", "negras": "p2", "resultado": "1-0", "razon": "...", "jugadas": ["..."], "evals": [0] }, null ] } ] } ] }
```
