# Torneo de eliminación directa

Pestaña **Torneo**: pon nombre a tus participantes, asígnales motor y nivel, y míralos pelear en un cuadro
tipo artes marciales. Todo el estado es JSON: se autoguarda, se exporta, se reanuda y se reproduce sin volver
a correr los motores.

## Cómo funciona

- **Participantes** (2–16): nombre + motor + nivel (o profundidad/tiempo personalizados). El orden de la lista es
  la **semilla**: #1 recibe los byes (si no son potencia de 2) y no se cruza con #2 hasta la final.
- **Cruces**: se juegan por **parejas de partidas** con colores cambiados y la **misma apertura** (un prefijo de 4–10 jugadas
  de una línea de la librería, ponderado por `peso`; sin librería, 4 jugadas al azar). Así los motores deterministas
  no repiten siempre la misma partida y cada pareja es justa.
- **Desempate**: si tras las parejas del cruce hay empate se juegan parejas extra (máx. configurable). Agotadas, avanza la
  mejor semilla (queda anotado como `semilla`).
- **Fin de partida**: reglas normales (mate, ahogado, repetición, 50 jugadas, material). Además, `maxJugadas` adjudica por la
  última evaluación, y *adjudicar* da la victoria a quien mantenga ≥ 9 peones de ventaja durante 8 jugadas seguidas
  (para no esperar a que el motor "remate" posiciones ganadas). Un motor que se cuelga o juega ilegal pierde la partida.
- **Paralelismo**: `concurrencia` partidas a la vez (cada una con sus propias instancias de motor). Un cruce empieza en cuanto
  terminan los que lo alimentan, sin esperar a toda la ronda.
- **Pausar/Reanudar**: pausar cancela las partidas en juego (se reinician al reanudar); las terminadas y las aperturas ya
  sorteadas se conservan.

## Interfaz

- **Cuadro** (SVG): clic en un cruce → sus partidas. El punto rojo parpadea en los cruces que se están jugando.
- **Visor**: ◀ ▶ ⏮ ⏭, reproducción automática, clic en cualquier jugada o en la gráfica de evaluación para saltar. Las partidas
  *en vivo* se siguen jugada a jugada. Las jugadas de apertura salen atenuadas. Atajos: ← → Inicio Fin Espacio.
- **Abrir en el tablero principal (3D)**: carga la partida hasta la jugada actual en el tablero de *Jugar* (en pausa, para que puedas
  seguirla a mano o analizarla).
- **Guardado**: autoguardado en el navegador (localStorage) tras cada cambio; *Exportar JSON* / *Importar JSON…* para archivarlo.
  Al abrir la página se reabre el último torneo (sin ejecutarlo).

## Formato `ajedrez-lab/torneo@1`

```jsonc
{
  "formato": "ajedrez-lab/torneo@1",
  "id": "t-…", "nombre": "…", "creado": "ISO", "actualizado": "ISO",
  "estado": "pendiente | en curso | pausado | terminado",
  "campeon": "p3",                       // id del participante, o null
  "config": { "juegosPorCruce": 2, "maxParesDesempate": 3, "maxJugadas": 250,
              "concurrencia": 3, "usarLibreria": true, "adjudicar": true },
  "participantes": [
    { "id": "p1", "nombre": "Dragón Rojo", "motor": "minimax", "nivel": "3", "limites": null, "semilla": 1 }
    // "limites": { "depth": 5, "time": 2000, "noise": 0 } si es personalizado (entonces "nivel": null)
  ],
  "rondas": [                             // rondas[0] = primera ronda … la última tiene la final
    [ {
        "id": "r0m0", "ronda": 0, "indice": 0, "a": "p1", "b": "BYE" /* o id / null */, "bye": false,
        "estado": "terminado", "ganador": "p1", "puntos": { "a": 1.5, "b": 0.5 },
        "decidido": "puntos | desempate | semilla | bye",
        "fuentes": [],                    // ids de los cruces que lo alimentan
        "pares": [ {
          "apertura": { "nombre": "Española: Cerrada", "jugadas": ["e2e4", "e7e5", "g1f3", "b8c6"] },
          "partidas": [                   // [blancas=a, blancas=b]
            { "blancas": "p1", "negras": "p2", "resultado": "1-0 | 0-1 | 1/2-1/2", "razon": "jaque mate",
              "jugadas": ["e2e4", "…"],   // UCI, incluye la apertura
              "evals": [null, null, 12, -8], // cp (blancas +), tope ±1500 (mates = ±1500); null = sin dato
              "tiempoMs": 8123 }
          ]
        } ]
    } ]
  ]
}
```

Las partidas son datos planos: se pueden analizar con cualquier script (por ejemplo, convertir `jugadas` a PGN).

## Probar sin interfaz

`src/tournament/` no toca el DOM: `Tournament.create(...)` + `await t.run()` funciona en Node (ver `tests/tournament.test.mjs`,
que registra un motor "en proceso" para no necesitar Workers).

## Pantalla encendida

Mientras un torneo o una liga corre, la pestaña pide mantener la pantalla encendida (Screen Wake Lock) para que el móvil no congele los motores. Funciona con la pantalla al mínimo de brillo y el teléfono cargando. Si el navegador no lo soporta, no pasa nada. El bloqueo se suelta al pausar o terminar.
