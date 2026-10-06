import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeDuel, decodeDuel, duelUrl, cleanName, DUEL_RULES } from '../../src/shared/duel.js';
import { createSim } from '../../src/sim/index.js';

const DUEL = { seed: 3_987_654_321, score: 12_345, timeSec: 334, kills: 418, victory: false, name: 'Rodri ñandú 🚀' };

test('duelo: el código del link ida y vuelta conserva todo, con nombres en cualquier idioma', () => {
  const code = encodeDuel(DUEL);
  assert.match(code, /^[0-9a-zA-Z._-]+$/, 'solo caracteres seguros para una URL');
  assert.deepEqual(decodeDuel(code), DUEL);
  assert.deepEqual(decodeDuel(encodeDuel({ ...DUEL, name: '', victory: true })), { ...DUEL, name: '', victory: true });
  assert.equal(duelUrl('https://riftfall.duckdns.org', DUEL), `https://riftfall.duckdns.org/?duel=${code}`);
});

test('duelo: un link editado a mano o roto no se acepta', () => {
  const code = encodeDuel(DUEL);
  const parts = code.split('.');
  parts[2] = (999_999).toString(36); // puntaje inflado
  assert.equal(decodeDuel(parts.join('.')), null);
  assert.equal(decodeDuel(code.slice(0, -1)), null);
  assert.equal(decodeDuel(''), null);
  assert.equal(decodeDuel('hola'), null);
  assert.equal(decodeDuel(null), null);
  assert.equal(decodeDuel(`2${code.slice(1)}`), null, 'versión desconocida');
});

test('duelo: los nombres se limpian y se recortan', () => {
  assert.equal(cleanName('  <b>Ana</b>\n '), 'bAna/b');
  assert.equal(cleanName('x'.repeat(40)).length, 16);
  assert.equal(Array.from(cleanName('🚀'.repeat(20))).length, 16, 'cuenta emojis como un carácter');
  assert.equal(cleanName(undefined), '');
});

test('duelo: la misma semilla con las reglas del duelo arma la misma partida', () => {
  const a = createSim({ seed: DUEL.seed, ship: DUEL_RULES.ship, shipLevel: DUEL_RULES.shipLevel, talents: {}, rift: DUEL_RULES.rift });
  const b = createSim({ seed: DUEL.seed, ship: DUEL_RULES.ship, shipLevel: DUEL_RULES.shipLevel, talents: {}, rift: DUEL_RULES.rift });
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
});
