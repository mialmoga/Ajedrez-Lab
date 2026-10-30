import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findMoveInText, extraerMarcador, explainRejection } from '../src/exchange/parse-move.js';
import { crearPartida } from '../src/exchange/partida.js';

const ini = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test('marcador manda sobre jugadas descartadas del razonamiento', () => {
  const t = 'Descarto Nf3, es pasiva. Valoré e4 también.\n**Jugada:** d4';
  assert.equal(findMoveInText(t, ini).san, 'd4');
  assert.equal(findMoveInText(t, ini).via, 'marcador');
  assert.equal(findMoveInText('Jugada: 1. e4', ini).san, 'e4');
  assert.equal(findMoveInText('**Jugada**: 0-0', 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1').san, 'O-O');
  assert.equal(extraerMarcador('Jugada anterior: e4'), null);
  assert.equal(extraerMarcador('Jugada: a, luego Jugada final: Nc3'), 'Nc3');
});

test('marcador ilegal no cae a otra jugada del texto', () => {
  assert.equal(findMoveInText('Pensé en e4 pero\nJugada: Bb5', ini), null);
});

test('sin marcador: comportamiento clásico', () => {
  assert.equal(findMoveInText('Mi jugada: Nf3, porque desarrolla.', ini).san, 'Nf3');
  assert.equal(findMoveInText('g1f3', ini).via, 'texto');
  assert.equal(findMoveInText('no se qué jugar', ini), null);
});

test('motivos de rechazo', () => {
  // camino bloqueado por pieza propia
  assert.match(explainRejection('Jugada: Bc4', ini), /bloqueado por tu peón en d2|bloqueado por tu peón/);
  assert.match(explainRejection('Jugada: Ra4', ini), /bloqueado por tu peón en a2/);
  assert.match(explainRejection('Jugada: Nd4', ini), /no se mueve así/);
  assert.match(explainRejection('Jugada: e5', ini), /peón no puede ir a e5/);
  assert.match(explainRejection('Jugada: Nf6', ini), /no tienes|no se mueve/);
  assert.match(explainRejection('Jugada: Nb1', ini), /propio/);
  assert.match(explainRejection('e7e5', ini), /rival/);
  assert.match(explainRejection('e4e5', ini), /no hay ninguna pieza en e4/);
  assert.match(explainRejection('Jugada: O-O', ini), /rey y la torre/);
  assert.match(explainRejection('hola', ini), /nada que parezca/);
  // clavada: la torre e2 está clavada por la torre e8
  const clav = '4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1';
  assert.match(explainRejection('Jugada: Ra2', clav), /clavada/);
  // jaque sin resolver
  const jaque = '4r1k1/8/8/8/8/8/P7/4K3 w - - 0 1';
  assert.match(explainRejection('Jugada: a3', jaque), /en jaque/);
  // rey junto al rey rival
  const reyes = '8/8/8/8/8/3k4/8/4K3 w - - 0 1';
  assert.match(explainRejection('Jugada: Kd2', reyes), /casilla atacada|rey rival/);
});

test('crearPartida guarda rechazos solo si hay', () => {
  assert.equal(crearPartida({ jugadas: ['e2e4'] }).rechazos, undefined);
  assert.equal(crearPartida({ jugadas: ['e2e4'], rechazos: 3 }).rechazos, 3);
});
