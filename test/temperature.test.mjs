import test from 'node:test';
import assert from 'node:assert/strict';
import { fahrenheitToMatter, displayTemperature } from '../src/temperature.mjs';

test('Fahrenheit conversion handles exact values, freezing, and negative readings', () => {
  for (const [fahrenheit, matter] of [[68, 2000], [77, 2500], [86, 3000], [32, 0], [-4, -2000], [0, -1778]]) {
    assert.equal(fahrenheitToMatter(fahrenheit), matter);
  }
});

test('conversion rejects invalid numbers and values outside physical/representation limits', () => {
  for (const value of [null, undefined, true, '68', NaN, Infinity, -Infinity, -460, 622, 1e100]) {
    assert.throws(() => fahrenheitToMatter(value));
  }
  assert.equal(fahrenheitToMatter(-459.67), -27315);
});

test('unavailable is null and never becomes a fabricated numeric observation', () => {
  assert.deepEqual(displayTemperature(null), { matterValue: null, celsius: null, fahrenheit: null });
});

test('rounding near policy thresholds is represented explicitly', () => {
  assert.equal(fahrenheitToMatter(70), 2111);
  assert.equal(displayTemperature(2111).fahrenheit, 69.998);
  assert.ok(fahrenheitToMatter(69.99) < fahrenheitToMatter(70.01));
  assert.throws(() => displayTemperature(-32768));
});
