# Pruebas del Minimax v2 (`tools/pruebas.mjs`)

Un solo archivo con varias **suites** (exámenes) que se corren por separado. Necesita Node 18 o superior; no instala nada.

```
node tools/pruebas.mjs --suite lista        # qué suites y paquetes hay
node tools/pruebas.mjs --suite v1-fuerte    # cada función sola contra el v1, profundidad 6, tope 3 s (la ablación original)
node tools/pruebas.mjs --suite v1-corto     # cada función sola contra el v1, tope 300 ms
node tools/pruebas.mjs --suite v1-paquetes  # paquetes contra el v1, 300 ms
node tools/pruebas.mjs --suite sf-p5        # paquetes contra Stockfish 19, profundidad 8 (nivel p5), v2 a 500 ms
```
`node tools/ablacion.mjs` sigue funcionando: es un atajo de `--suite v1-fuerte` y usa el mismo archivo de resultados.

## Por qué hay suites distintas
- **`v1-fuerte`** (profundidad fija): mide la *evaluación*. La poda no puede lucirse aquí, porque con un tope de profundidad solo pierde precisión y no gana profundidad.
- **`v1-corto`** (tiempo corto): la velocidad de la poda se convierte en profundidad. Aquí cuentan `nullMove`, `lmrMejorado`, `aspiracion`, `podaQuiescence` e `iteracionParcial`.
- **`sf-*`**: un rival distinto del v1 da partidas más decisivas (el v2 y el v1 se parecen tanto que más de 60 % acaba en tablas).

## Configuraciones
| Nombre | Qué es |
|---|---|
| `ninguna` | v2 con todo apagado = v1 (el **control**) |
| `todo` | el v2 por defecto (15 funciones activas; `tiempoDinamico` apagada) |
| `<función>` | solo esa encendida |
| `sin:<función>` | todo menos esa (para ver interacciones) |
| paquete | varias encendidas a la vez (tabla siguiente) |

| Paquete | Funciones | Hipótesis |
|---|---|---|
| `orden` | contraataque, gravedadHistorial | ordenar mejor las jugadas; cimiento de la poda |
| `poda` | nullMove, lmrMejorado, aspiracion, contraataque, gravedadHistorial | podar con buena ordenación |
| `poda+q` | `poda` + podaQuiescence + iteracionParcial | toda la búsqueda |
| `conocimiento` | las 7 de evaluación + repeticiones | toda la evaluación |
| `peones` | estructuraPeones, peonesPasados, finalArrinconar | peones y finales se refuerzan entre sí |
| `piezas` | parAlfiles, torresColumnas, movilidad, seguridadRey | actividad de piezas y rey |

Los paquetes son **hipótesis**: la prueba dirá si acertaron.

## Opciones
`--games N` (40 por defecto; correr con 20 y luego con 40 solo juega las que faltan, con aperturas nuevas),
`--jobs N` (por defecto la mitad de los hilos; el v2 juega con límite de tiempo y un equipo saturado falsea las medidas),
`--only a,b,c`, `--menos a,b` (todo menos cada una), `--nivel p4` (nivel de Stockfish: p1…p7 = profundidad 1, 2, 4, 6, 8, 12, 16),
`--depth N --time MS`, `--sin-dibujos`, `--probar-stockfish` (comprueba que el Stockfish responde en tu equipo y sale).

## Cómo leer la tabla
- **puntaje ±95 %**: porcentaje de puntos del v2 y su margen. Si el rango contiene el punto de comparación, no se distingue del azar.
- **contra «ninguna» (pareado)**: diferencia con el control sobre las *mismas* aperturas y colores. Es más sensible que comparar puntajes sueltos y es la columna principal contra Stockfish.
- Contra el v1 la referencia es 50 %, y `ninguna` debe dar ~50 % (el script avisa si se desvía con 20 partidas o más).

## Calibrar el nivel de Stockfish
Contra un Stockfish demasiado fuerte todo pierde y no hay diferencias que ver. Prueba unas pocas partidas:
```
node tools/pruebas.mjs --suite sf-p5 --only todo,ninguna --games 6 --nivel p4
node tools/pruebas.mjs --suite sf-p5 --only todo,ninguna --games 6 --nivel p5
node tools/pruebas.mjs --suite sf-p5 --only todo,ninguna --games 6 --nivel p6
```
y elige el nivel donde «todo» saque entre 30 y 50 %.

Fíjate en la primera línea que imprime (`Stockfish 19 (nivel p4, profundidad 6)`): un `--nivel` equivocado es fácil de pasar por alto. Referencias vistas hasta ahora:
- **p6 (profundidad 12)** es demasiado fuerte: tanto «todo» como «ninguna» pierden todas (0-0-6). No sirve para comparar.
- **p4 (profundidad 6)**: «ninguna» pierde casi todas y «todo» queda entre tablas y derrotas, que es donde sí se ve diferencia.
- Con muestras tan pequeñas (6 partidas) es solo una orientación; el nivel definitivo se elige mirando varios.

## Diagnóstico: cuando algo no cuadra
- **`--probar-stockfish`** dice en un par de segundos si el Stockfish arranca y contesta en tu equipo (`Todo bien` o `¡Algo falla!`).
- **«Cómo terminaron las partidas jugadas»** aparece bajo la tabla: por configuración, cuántas acabaron en mate, por tope de jugadas, por repetición, etc., y cuántas jugadas duraron de media. Si casi todas dicen «tope de jugadas», los empates vienen del límite de 160 jugadas y no de que los motores jueguen igual.
- Si un motor no devuelve jugada, el script se detiene con un mensaje claro; ya no lo cuenta como empate.
- **Carga del equipo:** el v2 juega con límite de tiempo. Si otro programa le quita procesador, rinde menos y los resultados se desvían (Stockfish por profundidad no cambia, solo tarda más). Cierra otras aplicaciones y no subas `--jobs` más allá de tus núcleos físicos. Si una corrida da resultados muy distintos a otra con los mismos parámetros, sospecha primero de esto.
- Si la configuración «ninguna» contra el v1 no da ~50 %, el script lo avisa (con 20 partidas o más).

## Limitaciones conocidas
- Las partidas de más de 160 jugadas cuentan como tablas. Contra rivales parecidos, muchas partidas acaban así y la prueba distingue poco. Pendiente de decidir: *adjudicar* una partida como ganada cuando una evaluación fuerte (por ejemplo +800 centipeones) se mantenga varias jugadas seguidas.
- Las aperturas son 20 líneas fijas (40 partidas = las 20 por los dos colores); ampliar `--games` más allá de 40 repite aperturas.
- Los paquetes son hipótesis; el puntaje de cada uno vale lo que valga su margen de error.

## Notas
- El Stockfish es el del repo (`vendor/stockfish`): se copia a una carpeta temporal como CommonJS y se usa por UCI en un proceso aparte.
- Cada suite guarda su avance en un JSON (`pruebas-<suite>.json`; `v1-fuerte` usa `ablacion-resultados-fuerte.json`). Con Ctrl+C se guarda y se puede continuar con el mismo comando.
- Las partidas más largas de 160 jugadas cuentan como tablas.

## Adjudicación de las partidas que llegan al tope de jugadas

Una partida que llega a las 160 jugadas ya no cuenta siempre como tablas. Stockfish (profundidad 12) evalúa la posición final: si un bando va ≥ 3 peones arriba (o hay mate anunciado), se le da la victoria como **«adjudicada»**; con menos ventaja, sigue siendo **«tope de jugadas»** = tablas. En el resumen aparecen separadas de los mates reales, con la evaluación media con la que el v2 llegó al tope (para entender por qué una partida «empató»).

- `--sin-adjudicar`: el tope cuenta como tablas, como antes.
- `--adj-cp 300` (ventaja en centipeones) y `--adj-depth 12` (profundidad) se pueden cambiar.
- El archivo de resultados recuerda con qué criterio se juzgó (`_adj`). Si lo cambias, solo se vuelven a jugar las partidas que habían llegado al tope; el resto se conserva.
- La lógica de decisión está en `tools/adjudicar.mjs` (con `tests/adjudicar.test.mjs`). La variable `PRUEBAS_MAX_PLIES=14` baja el tope solo para comprobar que funciona sin jugar 160 jugadas.

## Autopsia (`tools/autopsia.mjs`)

Juega unas partidas del v2 contra Stockfish, juzga **cada jugada del v2** con un Stockfish más profundo (por defecto profundidad 16) y, en las que pierden ventaja (≥ 1.2 peones), averigua *por qué* falló volviendo a pedirle la jugada al mismo v2 con más tiempo (×4 y ×16):

| causa | qué significa |
|---|---|
| `horizonte-corto` | con ×4 de tiempo ya acierta: faltaba poca profundidad (búsqueda: poda, orden, extensiones) |
| `horizonte-largo` | solo con ×16: la trampa está lejos |
| `evaluacion` | ni con ×16: ve el problema pero lo juzga mal (conocimiento que falta en la evaluación, o la poda lo descarta) |

```
node tools/autopsia.mjs                                  # v2 «todo» contra Stockfish p5, 4 partidas
node tools/autopsia.mjs --config poda --nivel p4 --games 8
node tools/autopsia.mjs --prof 14 --sondeos 4,16 --umbral 120 --time 500 --salida autopsia-poda
```
Genera `autopsia.md` (informe: pérdida media por jugada v2 vs Stockfish y por fase, errores por causa y por fase, tácticas perdidas —la mejor era captura o jaque y el v2 jugó una tranquila—, los 15 peores errores con FEN y sondeos), `autopsia.pgn` (las partidas con cada error anotado: ábrelo en el replay de la app) y `autopsia.json`. Ctrl+C termina la partida en curso y escribe el informe con lo que haya. La lógica pura está en `tools/autopsia-nucleo.mjs` (con `tests/autopsia.test.mjs`); lo compartido con `pruebas.mjs` (Stockfish por UCI, aperturas, configuraciones) en `tools/comun.mjs`.
