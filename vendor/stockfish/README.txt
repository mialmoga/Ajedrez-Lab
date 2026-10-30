Stockfish 19 (lite, un solo hilo) compilado a WebAssembly por Nathan Rugg (stockfish.js, paquete npm "stockfish" 19.0.1).
Licencia GPL-3.0 (ver LICENSE-GPL3.txt). Código fuente: https://github.com/nmrugg/stockfish.js y https://github.com/official-stockfish/Stockfish
Se usa tal cual, sin modificar. El .js y el .wasm deben estar juntos y servirse con sus tipos MIME correctos.
Para actualizar: npm pack stockfish y copiar bin/stockfish-<v>-lite-single.{js,wasm}; cambiar STOCKFISH_FILE en src/engines/stockfish/stockfish-engine.js.
