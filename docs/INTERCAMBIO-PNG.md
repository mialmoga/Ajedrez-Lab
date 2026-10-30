# Intercambio por PNG (jugar contra una IA sin API)

## Ciclo

1. **Descargar PNG** o **Copiar PNG** (panel *Intercambio*).
2. Pásalo a la IA (por ejemplo, adjuntándolo en un chat) con una instrucción corta:
   *"Eres las negras. Razona lo que quieras y termina con una línea «Jugada: <tu jugada>»."*
   (la imagen ya trae esa instrucción impresa).
3. Pega su respuesta en el cuadro de jugada. Acepta texto libre:
   - **Con marcador** (`Jugada: Nf3`, también `**Jugada:** Nf3`, `Move: …`): manda la **última** línea marcada y se ignora
     el resto, así "descarto Qd1, es pasiva" en el razonamiento no se confunde con la jugada. Si la jugada del marcador
     es ilegal se rechaza; no se busca otra en el texto.
   - **Sin marcador**: toma la **primera jugada legal** que encuentre (`Nf3`, `g1f3`, `0-0`, "Mi jugada: Nf3, porque…").

### Rechazos
Si no hay jugada legal, el panel dice **por qué** (camino bloqueado por tu pieza, pieza clavada, rey en jaque sin
resolver, "no hay pieza en e4", casilla propia…). No sugiere jugadas ni lista las legales; es el mensaje que puedes
devolver a la IA. Cada rechazo suma al contador *Rechazos en esta partida* (se reinicia con cada partida nueva y no
sobrevive a recargar la página) y, si es mayor que 0, se guarda como `rechazos` en el JSON exportado de la partida:
sirve para comparar cuántas jugadas ilegales comete una IA con cada ayuda.
4. Repite con el PNG del siguiente turno.

**IA vs IA**: el mismo ciclo alternando dos IAs; tú solo copias jugadas de una a otra.

## Qué lleva la imagen

- Tablero dibujado con coordenadas (orientado según el lado que mira abajo) y última jugada resaltada.
- Texto impreso: **turno**, **FEN completo**, últimas jugadas e instrucción de respuesta.
- Estado completo en un chunk `tEXt` de nombre `ajedrez-lab` (JSON: fen, turno, inicio, jugadas SAN/UCI).

## Cargar

- **Cargar PNG…** restaura la partida entera si el archivo conserva los metadatos.
- Si el PNG viene de un chat que **borra los metadatos** (casi todos recomprimen), usa el FEN impreso en la imagen
  con *Cargar FEN*.

## Limitaciones

- Los modelos de visión a veces leen mal las piezas: por eso el FEN impreso es el respaldo de confianza.
- Copiar al portapapeles puede recomprimir la imagen según el navegador; *Descargar* conserva los metadatos.
