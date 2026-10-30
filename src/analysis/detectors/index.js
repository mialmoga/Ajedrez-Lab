/**
 * Registro de detectores. Cada detector: { id, grupo, detect(ctx) → hecho|null }.
 * Un hecho es { id, prioridad, slots }; `id` es también la clave de la plantilla en el diccionario.
 * Para añadir uno: crea el archivo, impórtalo aquí y añade sus plantillas a library/explicaciones-es.json.
 */
import { jaque } from './jaque.js';
import { enroque } from './enroque.js';
import { promocion } from './promocion.js';
import { captura } from './captura.js';
import { sacrificio } from './sacrificio.js';
import { horquilla, amenaza, clavada } from './tactica.js';
import { evasion, retirada, defensa } from './seguridad.js';
import { desarrollo, centro, columna, peones, reyActivo } from './posicional.js';

export const DETECTORS = [jaque, enroque, promocion, captura, sacrificio, horquilla, amenaza, clavada, evasion, retirada, defensa, desarrollo, centro, columna, peones, reyActivo];
