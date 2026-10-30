# Formato de la librería JSON

```json
{
  "formato": "ajedrez-lab/libreria@1",
  "nombre": "Mis aperturas",
  "lineas": [
    {
      "id": "espanola-cerrada",
      "nombre": "Española: Cerrada",
      "eco": "C84",
      "peso": 3,
      "descripcion": "Texto libre (opcional).",
      "inicio": "FEN opcional (por defecto, la posición inicial)",
      "jugadas": [
        { "san": "e4", "nota": "Ocupa el centro y abre líneas para el alfil de rey y la dama." },
        { "san": "e5", "nota": "..." },
        "Nf3"
      ]
    }
  ]
}
```

| Campo | Obligatorio | Descripción |
|---|---|---|
| `lineas` | sí | Lista de líneas. También se aceptan `lines`, un array suelto, o un objeto que sea una sola línea. |
| `jugadas` | sí | Lista de jugadas. Cada una es `{ "san": "Nf3", "nota": "..." }` o solo el texto (`"Nf3"`). |
| `san` | sí | Notación SAN. También vale UCI (`"g1f3"`) usando la clave `uci`. |
| `nota` | no | La explicación que ve el jugador cuando juega esa jugada. |
| `nombre`, `id`, `eco`, `descripcion` | no | Metadatos. |
| `peso` | no (1) | Importancia de la línea: pondera la predicción y el libro de aperturas. |
| `inicio` | no | FEN de partida, para estudiar finales o posiciones concretas. |

Alias en inglés aceptados: `moves`, `name`, `note`, `weight`, `fen`, `description`.

## Cómo se usa

- **Carga**: botón *Cargar JSON…* (varios a la vez), o lista los archivos en `library/index.json` para que se
  carguen al arrancar.
- **Validación**: cada línea se reproduce con chess.js. Una jugada ilegal genera un aviso y **corta la línea ahí**.
- **Detección**: se compara por **posición** (FEN sin contadores), no por orden de jugadas, así que las
  transposiciones se detectan. La predicción es el reparto de `peso` entre las líneas vivas.
- **Notas compartidas**: si dos líneas pasan por la misma posición con la misma jugada, se muestran las
  notas distintas de ambas (sin repetir).
