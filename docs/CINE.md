# Modo cine

Botón **🎬 Cine** en el panel Jugadas (con la partida que ya tiene jugadas, incluida una importada). Abre una tarjeta con:
- **Calidad**: baja (resolución normal, sin sombras), media (hasta 1.5×, sombras 1024) o alta (hasta 2×, sombras 2048).
- **Tablero**: el tema visual de la película (al salir se restaura el anterior).
- **Velocidad** 0.5× a 2×, **Subtítulos** sí/no, y **Marcar errores y jugadas clave** (corre el análisis con el juez antes de empezar; se puede saltar tocando el aviso).
Las opciones se recuerdan.

## Qué hace
Pantalla completa, solo el tablero 3D con viñeta y una cámara que se balancea despacio. El replay avanza solo: 1.8 s por jugada, más en capturas, jaques, errores/brillantes y mate, y más si el subtítulo es largo (`duracionJugada` en `src/ui/cine.js`).
Subtítulos = jugada + texto del narrador + (si hay análisis) la línea de clase («?? Error grave · pierde ~3.1 · era mejor Nf3»). Al final: resultado y precisión de cada bando.

## Controles
Espacio/clic: pausa · ← →: jugada · Inicio/Fin · Esc: salir · barra de progreso clicable. Los controles se esconden a los 3 s sin tocar la pantalla.
Salir (✕, Esc o salir de pantalla completa) devuelve el tablero y la posición actual de la partida.

**Pantalla encendida:** durante la película se pide el bloqueo de pantalla (Screen Wake Lock); necesita https o localhost, y si el navegador no lo permite la tarjeta lo avisa. **Tipografía:** los subtítulos y el título van en cursiva con serifa (Georgia/Palatino/Noto Serif según el dispositivo).

## Efectos (entrega 2)
- **Piezas que estallan**: al comer, la pieza espera a que llegue la capturadora y estalla en chispas, trozos del color de la pieza y un destello en el suelo; la cámara tiembla un poco. Cantidad según la calidad (baja/media/alta). Opción «Piezas que estallan al comer».
- **Bloom** (opcional, apagado por defecto, ignorado en calidad baja): realza el brillo de chispas y destellos. Los pases de Three.js están en `vendor/three/postprocessing` y `vendor/three/shaders` y solo se cargan al pedirlo.
- Arreglo de paso: el replay ya no hace un redibujado extra sin jugada en cada paso (antes las piezas «saltaban» sin animarse).

## Música que sigue la tensión (entrega 3)
- `src/analysis/tension.js` (puro): temperatura 0–1 por jugada (capturas, jaques, errores, cambios bruscos de evaluación, mate cerca, final) → nivel 0 calma / 1 tensión / 2 clímax con histéresis, y el evento de cada jugada (captura, jaque, error, brillante, mate). Sin análisis funciona con material, jaques y fase.
- `src/audio/temas.js`: los temas se componen una vez con `demoKit` (`src/audio/demo-kit.js`) en capas en bucle alineadas al compás —cama, ritmo, clímax— más stingers (captura, jaque, error, brillante, mate, final). Se renderizan en un worker (`render-worker.js`, ~2 s).
- `src/audio/musica.js`: reproductor Web Audio; solo sube/baja la ganancia de las capas según el nivel y dispara stingers (máx. uno cada 1.2 s). En pausa baja de volumen en vez de callar. El AudioContext se crea dentro del clic de «Comenzar».
- Temas, uno por estilo de tablero: **Clásico** (lo-fi de madera, La menor, 74 bpm), **Pizarra** (épico, Re menor, 88 bpm: cuerdas, coro, taiko, metales) y **Neón** (electrónico, La menor, 124 bpm: pulso a cuatro, supersaw, sidechain). El tema sale del tablero elegido en la tarjeta.
- Opciones: «Música que sigue la tensión», volumen, y botón 🔊/🔇 durante la película.

## Posición de los subtítulos
Botón ⬇/⬆/➡ en la barra (o «Subtítulos en» en la tarjeta): **abajo** (con marco), **arriba** (sin marco, sobre un velo que se desvanece) o **al lado** (panel a la derecha; el tablero se recoloca en el resto). «Al lado» solo existe en pantallas anchas; en vertical se salta. Se guarda en las opciones del cine.
