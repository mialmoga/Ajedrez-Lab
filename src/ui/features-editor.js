import { h } from './dom.js';
import { DEFAULT_FEATURES } from '../engines/minimax2/minimax2-core.js';

/** Etiquetas de las funciones del Minimax v2, por grupo. */
export const FEATURE_INFO = {
  'Evaluación': {
    parAlfiles: 'Par de alfiles',
    torresColumnas: 'Torres en columnas abiertas / 7.ª fila',
    estructuraPeones: 'Peones doblados y aislados',
    peonesPasados: 'Peones pasados',
    seguridadRey: 'Seguridad del rey',
    movilidad: 'Movilidad de alfiles y torres',
    finalArrinconar: 'Final: arrinconar al rey',
  },
  'Búsqueda': {
    nullMove: 'Poda null-move',
    lmrMejorado: 'LMR mejorado',
    aspiracion: 'Ventana de aspiración',
    contraataque: 'Heurística de contraataque',
    podaQuiescence: 'Poda en quiescence',
    repeticiones: 'Detección de repeticiones',
    iteracionParcial: 'Iteración parcial (aprovecha la búsqueda a medias)',
    gravedadHistorial: 'Gravedad en el historial',
    tiempoDinamico: 'Tiempo dinámico (ahorra tiempo)',
  },
};

/**
 * Casillas para activar/apagar las funciones del Minimax v2.
 * @param {{features: object, onChange:(features:object)=>void, disabled?:boolean}} opts  `features` se muta y se devuelve en onChange.
 * @returns {HTMLElement} <details>
 */
export function createFeaturesEditor({ features, onChange, disabled = false }) {
  const state = { ...DEFAULT_FEATURES, ...(features ?? {}) };
  const boxes = {};
  const groups = Object.entries(FEATURE_INFO).map(([title, items]) =>
    h('div', { class: 'feat-group' }, h('b', {}, title),
      Object.entries(items).map(([key, label]) => {
        const cb = h('input', { type: 'checkbox', checked: !!state[key], disabled });
        cb.addEventListener('change', () => { state[key] = cb.checked; onChange?.({ ...state }); });
        boxes[key] = cb;
        return h('label', { class: 'feat-row' }, cb, ' ', label);
      })));
  const reset = h('button', { class: 'mini', disabled, onClick: () => {
    Object.assign(state, DEFAULT_FEATURES);
    for (const [k, cb] of Object.entries(boxes)) cb.checked = !!state[k];
    onChange?.({ ...state });
  } }, 'Restablecer');
  const count = () => Object.values(state).filter(Boolean).length;
  return h('details', { class: 'feat' }, h('summary', {}, 'Funciones del v2'), ...groups, reset, h('span', { class: 'muted small' }, ` (${count()} activas al abrir)`));
}
