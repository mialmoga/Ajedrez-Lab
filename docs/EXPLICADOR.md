# Explicador de jugadas

Dice en español qué hace cada jugada, también cuando la línea ya salió de la librería.

## Prioridad
1. **Nota de la librería** (campo `nota` de la jugada en el JSON de aperturas), si existe.
2. **Reglas + diccionario**: detectores → hechos → plantillas.
3. **Silencio** si nada aplica con seguridad (o si falta la plantilla).

Etiqueta visible: `librería` o `reglas`.

## Piezas (`src/analysis/`)
- `helpers.js` — valores de pieza, ataques/defensas, "pieza colgada", clavadas.
- `detectors/*.js` — cada detector recibe `{before, after, move, color, ply, prev}` y devuelve un **hecho** `{id, prioridad, slots}` o `null`. `id` = clave de la plantilla.
- `explain.js` — corre los detectores, elige hasta 2 hechos de grupos distintos (el mate/ahogado va solo) y los redacta.
- `dictionary.js` — plantillas con huecos (`{pieza}`, `{Pieza}`, `{casilla}`, `{c1}`, `{c2}`, `{rival}`…).
- `explainer.js` — une librería + reglas (con caché). Lo usan el panel *Explicación de la jugada* y el visor de torneos.

## Detectores v1
mate/ahogado/jaque/jaque descubierto, enroque, promoción, capturas (gana, cambio, recaptura, desigual), pieza ofrecida, horquilla, amenaza, clavada, evasión de jaque, retirada/retroceso, defensa de pieza amenazada, desarrollo, dama temprana, centro, columna abierta/semiabierta, peón pasado (y cerca de coronar), palanca, peones doblados (crear/reparar), rey activo en el final.

## Tono
Hechos seguros (jaque, captura, enroque) en afirmativo; interpretaciones con "probablemente". Se controla por completo desde el JSON.

## Editar frases
`library/explicaciones-es.json` → `plantillas: { id: [variante1, variante2…] }`. Se elige una variante según el número de jugada. Sin plantilla para un id, ese hecho se omite.

## Añadir un detector
1. Archivo en `src/analysis/detectors/` que exporte `{ id, grupo, detect(ctx) }`.
2. Registrarlo en `detectors/index.js`.
3. Añadir sus plantillas al JSON.

## Pendiente (v2)
"Amenaza mate" y "esta jugada pierde material", verificados con una búsqueda corta del motor.

## Explicador v2: el juez (motor)
Además de las reglas, un **juez** (un motor del registro) evalúa la posición antes y después de la jugada y emite un veredicto.

- **Elegible:** en el panel «Explicación de la jugada»: casilla «Análisis con motor», motor y nivel (cualquiera registrado menos el aleatorio). Por defecto Stockfish en su nivel más alto; si no está, Minimax v2. La elección se guarda en el navegador. Si el nivel es bajo se avisa que sus veredictos son poco fiables.
- **Atribución:** cada veredicto dice «según {juez}».
- **Qué dice** (`src/analysis/verdict.js`): imprecisión / error / error grave (pérdida de evaluación desde el punto de vista de quien movió) con «era mejor {jugada}»; mate dejado escapar; «mejor jugada» / «mejor defensa» solo cuando la posición resultante es clara; **amenaza de mate** (se devuelve el turno al que movió y se busca un mate corto).
- **Umbrales editables:** sección `umbrales` de `library/explicaciones-es.json` (centipeones): `imprecision` 50, `error` 120, `errorGrave` 300, `mateMax`, `mejorMinVentaja`, `amenazaMateMax`, `juezTiempoMs` (tope de tiempo por consulta, 350 ms). Las frases (`imprecision`, `error`, `error_grave`, `mate_perdido`, `amenaza_mate`, `mejor_jugada`, `mejor_defensa`, `mejor_era`) están en `plantillas`.
- **Asíncrono:** aparece primero la explicación por reglas y luego «el juez está analizando…» y su veredicto. Instancia de motor propia (no interfiere con los jugadores), una consulta a la vez, con caché por posición.
- **Visor de Torneo/Liga:** el veredicto es **bajo demanda** (botón «Analizar con el juez») para no competir por CPU con las partidas en curso; usa el mismo juez.
- Módulos: `src/analysis/judge.js` (motor + caché), `verdict.js` (lógica pura), `explainer.js › judgePly`.
