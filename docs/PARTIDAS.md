# Partidas sueltas: revisar, exportar e importar

## Revisar una partida (tablero principal)

- Botones **⏮ ◀ ▶ ⏭** sobre la lista de jugadas, o **← → Inicio Fin** del teclado. **Esc** vuelve a la posición actual.
- Cualquier jugada de la lista es clicable: el 2D y el 3D muestran esa posición.
- Mientras revisas, el tablero es **solo lectura** y la partida queda **en pausa** (los motores no mueven).
  Al salir se devuelve el estado de pausa que había.
- El comentarista (y el juez) explican **la jugada que estás viendo**.
- **Volver a la actual**: sale de la revisión. **Continuar desde aquí**: descarta las jugadas posteriores y deja seguir
  la partida desde esa posición (queda en pausa; pulsa Reanudar).
- Si la partida cambia por otro lado (una jugada nueva, "Nueva partida"), la revisión termina sola.

Código: `src/core/review.js` (estado y pausa), `src/ui/board-controller.js` (dibuja la posición revisada), `src/ui/panel-moves.js` (controles).

## Abrir desde Torneo / Liga

"Abrir en el tablero principal (3D)" carga la partida **completa** y te deja en revisión en la jugada donde estabas en el visor.

## Exportar

En el tablero principal (panel *Jugadas*) y en el visor de Torneo/Liga: **Exportar JSON** y **Exportar PGN**.

JSON `ajedrez-lab/partida@1`:

```json
{ "formato": "ajedrez-lab/partida@1", "blancas": "…", "negras": "…", "resultado": "1-0",
  "razon": "jaque mate", "apertura": { "nombre": "…" }, "inicio": "<FEN, solo si no es la inicial>",
  "fecha": "ISO", "evento": "Ajedrez Lab", "jugadas": ["e2e4", "e7e5"], "evals": [null, 12] }
```

`evals` solo si la partida las trae (torneo/liga); en centipeones desde el punto de vista de las blancas.

## Importar

Panel *Jugadas* → **Importar partida…** acepta el JSON anterior o un **PGN**. Se abre en revisión en la jugada 0.

PGN, versión 1: se leen **cabeceras y jugadas** (incluye `SetUp`/`FEN`, enroque `0-0`, varias líneas).
Se **ignoran** comentarios `{…}` y `;…`, variantes `(…)`, NAGs `$n` y signos `!?`. Si el archivo trae varios juegos, se lee el primero.
Una jugada ilegal corta la carga en la última válida y avisa. Pendiente para otra versión: variantes y comentarios.

Código: `src/exchange/partida.js`. Pruebas: `tests/partida.test.mjs`.

## Autoguardado

La partida del tablero principal se guarda sola en el navegador (`localStorage`), sin tocar nada:

- **Cuándo:** en cada jugada, al pausar o reanudar, y al ocultar o cerrar la pestaña.
- **Qué:** las jugadas, el FEN inicial si no es el estándar, y los jugadores (motor, nivel y funciones del v2).
- **Al abrir la página:** si había una partida, se recupera **en pausa**, con sus jugadores, y aparece un aviso en *Partidas guardadas*. Pulsa Reanudar para seguir.
- **Lista de las últimas 10:** al terminar una partida, o al sustituirla por otra (Nueva, importar, abrir de torneo…), se archiva en el panel **Partidas guardadas**. Las de menos de 4 jugadas se ignoran, y cortar la partida con "Continuar desde aquí" no crea duplicados. Cada una se puede **Revisar**, bajar en **PGN/JSON** o quitar.
- **Límite:** vive en el navegador; si borras los datos del sitio, se pierde (exporta lo que quieras conservar). Si no cabe, avisa.

Código: `src/core/autosave.js`, `src/ui/panel-saved.js`. Pruebas: `tests/autosave.test.mjs`.

## Modo Prueba / Práctica
Selector «Modo» en el panel Partida (solo tablero principal; no existe en Torneo ni Liga).
- **Prueba** (por defecto): sin ayudas. **Práctica**: habilita las ayudas (💡 y marcas, próximos pasos).
- Se elige antes de la primera jugada y queda **fijo** mientras dure la partida. «Nueva partida» vuelve a Prueba.
- «Continuar desde aquí» en un replay abre la partida en Práctica.
- Las ayudas también están disponibles al revisar una partida y en motor contra motor (para ver dónde un motor se aparta de la jugada óptima).
- El modo se guarda en el autoguardado y en la exportación JSON (campo opcional `modo`); el PGN no lo lleva.

### Marcar casillas (Práctica)
Con ayudas disponibles aparece la casilla «Marcar casillas» en el panel «Explicación de la jugada» (apagada por defecto). Dibuja en el tablero 2D:
- 🔴 **en riesgo**: pieza propia atacada sin defensa suficiente (el color «propio» es el del humano; si no hay uno solo, el del turno).
- 🟢 **vulnerable**: pieza rival en esa situación.
- 🟠 **clavada** (borde punteado): pieza clavada a otra de más valor.
Usa los mismos criterios que el narrador (`src/analysis/marcas.js`). El 3D llegará junto con las flechas de 💡.

### 💡 Pista (Práctica)
El botón «💡 Pista» (mismo panel «Explicación de la jugada», solo con ayudas disponibles) consulta al **juez** configurado en «Explicación de la jugada» (Stockfish por defecto) sobre la posición que se ve en el tablero, también en revisión:
- Flecha **verde** gruesa: la jugada que haría el juez, con su evaluación.
- Flecha **azul** tenue: la respuesta que esperaría del rival.
Se dibujan en 2D y 3D y se borran al cambiar la posición (jugada, deshacer, navegar). Las marcas de casillas también se ven en 3D (anillos).
Para ver dónde un motor se aparta de lo óptimo: motor contra motor, pausa y 💡.

En móvil vertical (diseño apilado) los paneles «Jugadas» y «Explicación de la jugada» van justo bajo el tablero; Partida, Librería e Intercambio quedan debajo. En horizontal y escritorio el orden no cambia.
