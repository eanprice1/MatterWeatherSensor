import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { WeatherEngine, WeatherError, parseCurrent, fetchCurrent, INTERVAL, FRESHNESS, DAY, LIMIT } from '../src/weather.mjs';

// Synthetic location at 0,0; never use a deployment's real location in fixtures.
const config = { latitude: 0, longitude: 0 };
const epoch = Date.UTC(2026, 9, 19);
const body = (temp = 20, now = epoch) => ({ lat: 0, lon: 0, data: [{ temp, dt: Math.floor(now / 1000) }] });

async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'otm-weather-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let clock = epoch;
  let calls = 0;
  const readings = [];
  const readingPath = path.join(directory, 'reading.json');
  const simulated = { matterValue: 2222, updatedAt: new Date(epoch).toISOString() };
  await fs.writeFile(readingPath, JSON.stringify(simulated));
  const settings = { directory, readingPath, simulated, config, now: () => clock, automatic: false,
    publish: async value => { readings.push(value); },
    fetchWeather: async () => { calls++; return parseCurrent(body(25, clock), config, clock); }, ...options };
  const engine = new WeatherEngine(settings);
  await engine.init();
  t.after(() => engine.close());
  return { directory, engine, settings, readings, get calls() { return calls; },
    get clock() { return clock; }, advance: amount => { clock += amount; },
    async tick() { await engine.tick(); await engine.fetchTask; } };
}

test('current response validates temperature, location, structure, and freshness', () => {
  assert.equal(parseCurrent(body(-3.889), config, epoch).matterValue, -389);
  assert.equal(parseCurrent(body(21.111), config, epoch).matterValue, 2111);
  for (const bad of [NaN, Infinity, null, '20', -274, 328]) {
    assert.throws(() => parseCurrent(body(bad), config, epoch), /invalid_response/);
  }
  for (const bad of [{}, { ...body(), data: [] }, { ...body(), data: [...body().data, ...body().data] },
    { ...body(), lat: 41 }, { ...body(), lon: null }, body(20, epoch - FRESHNESS), body(20, epoch + 301000),
    { ...body(), data: [{ temp: 20, dt: '123' }] }]) {
    assert.throws(() => parseCurrent(bad, config, epoch), /invalid_response/);
  }
});

test('weather schedule, mode isolation, and restart do not leak simulated data or add requests', async t => {
  const f = await fixture(t);
  assert.equal(f.engine.status().mode, 'simulated');
  assert.equal(f.engine.status().matterValue, 2222);
  await f.tick();
  assert.equal(f.calls, 0);
  await f.engine.setMode('weather');
  assert.equal(f.engine.status().matterValue, null);
  await f.tick();
  assert.equal(f.calls, 1);
  assert.equal(f.engine.status().matterValue, 2500);
  await assert.rejects(f.engine.setSimulated(1000), /simulated mode/);
  f.advance(INTERVAL - 1);
  await f.tick();
  assert.equal(f.calls, 1);
  const restarted = new WeatherEngine(f.settings);
  await restarted.init();
  t.after(() => restarted.close());
  await restarted.tick();
  assert.equal(f.calls, 1);
  assert.equal(restarted.status().matterValue, 2500);
  f.advance(1);
  await f.tick();
  assert.equal(f.calls, 2);
  await f.engine.setMode('simulated');
  assert.equal(f.engine.status().matterValue, 2222);
  await f.engine.setSimulated(-1222);
  assert.equal(f.engine.status().matterValue, -1222);
  f.advance(INTERVAL);
  await f.tick();
  assert.equal(f.calls, 2);
});

test('retries back off, retain a valid sample, expire independently, then recover', async t => {
  let failing = false;
  const f = await fixture(t, { fetchWeather: async () => {
    if (failing) throw new WeatherError('network_error');
    return parseCurrent(body(-10, f.clock), config, f.clock);
  } });
  await f.engine.setMode('weather');
  await f.tick();
  failing = true;
  for (const [advance, retry] of [[INTERVAL, 60000], [60000, 300000], [300000, INTERVAL]]) {
    f.advance(advance);
    await f.tick();
    assert.equal(Date.parse(f.engine.status().nextAttemptAt) - f.clock, retry);
    assert.equal(f.engine.status().matterValue, -1000);
  }
  f.advance(FRESHNESS - (INTERVAL + 60000 + 300000));
  await f.tick();
  assert.equal(f.engine.status().matterValue, null);
  assert.equal(f.engine.status().stale, true);
  failing = false;
  f.advance(INTERVAL);
  await f.tick();
  assert.equal(f.engine.status().matterValue, -1000);
  assert.equal(f.engine.status().lastError, null);
});

test('authentication pauses through mode changes and retries only after restart', async t => {
  let calls = 0;
  const f = await fixture(t, { fetchWeather: async () => { calls++; throw new WeatherError('authentication_error'); } });
  await f.engine.setMode('weather');
  await f.tick();
  assert.equal(f.engine.status().fetchingPaused, true);
  await f.engine.setMode('simulated');
  await f.engine.setMode('weather');
  f.advance(DAY);
  await f.tick();
  assert.equal(calls, 1);
  const restarted = new WeatherEngine(f.settings);
  await restarted.init();
  t.after(() => restarted.close());
  await restarted.tick();
  await restarted.fetchTask;
  assert.equal(calls, 2);
});

test('429 backoff and quota survive restarts; rolling quota eventually opens', async t => {
  const f = await fixture(t, { fetchWeather: async () => { throw new WeatherError('rate_limited', f.clock + 7200000); } });
  await f.engine.setMode('weather');
  await f.tick();
  const restarted = new WeatherEngine(f.settings);
  await restarted.init();
  t.after(() => restarted.close());
  assert.equal(Date.parse(restarted.status().nextAttemptAt), f.clock + 7200000);
  await restarted.tick();
  assert.equal(restarted.status().requestsInLast24Hours, 1);
  await f.engine.commit({ ...f.engine.state, attempts: Array(LIMIT).fill(f.clock), nextAttemptAt: f.clock });
  await f.tick();
  assert.equal(f.engine.status().lastError, 'daily_limit');
  assert.equal(Date.parse(f.engine.status().nextAttemptAt), f.clock + DAY);
  const quotaRestart = new WeatherEngine(f.settings);
  await quotaRestart.init();
  t.after(() => quotaRestart.close());
  assert.equal(quotaRestart.status().requestsInLast24Hours, LIMIT);
  f.advance(DAY);
  await f.tick();
  assert.equal(f.engine.status().requestsInLast24Hours, 1);
  assert.equal(f.engine.status().lastError, 'rate_limited');
});

test('accounting is durable before HTTP and failed persistence blocks the request', async t => {
  const f = await fixture(t, { fetchWeather: async () => {
    const disk = JSON.parse(await fs.readFile(f.engine.filename, 'utf8'));
    assert.equal(disk.attempts.length, 1);
    assert.equal(disk.lastAttemptAt, f.clock);
    assert.equal(disk.nextAttemptAt, f.clock + INTERVAL);
    return parseCurrent(body(), config, f.clock);
  } });
  await f.engine.setMode('weather');
  await f.tick();
  assert.equal(f.engine.status().matterValue, 2000);
  f.advance(INTERVAL);
  f.engine.save = async () => { throw new Error('disk full'); };
  await f.tick();
  assert.equal(f.engine.status().lastError, 'storage_error');
  assert.equal(f.engine.status().requestsInLast24Hours, 1);
  f.advance(FRESHNESS);
  await f.tick();
  assert.equal(f.engine.status().matterValue, null);
});

test('slow HTTP does not block mode changes or overlap, and shutdown aborts it', async t => {
  let requests = 0;
  const f = await fixture(t, { fetchWeather: async (_config, signal) => {
    requests++;
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    throw new WeatherError('network_error');
  } });
  await f.engine.setMode('weather');
  await f.engine.tick();
  // Let the durable reservation complete without waiting on the mock HTTP operation.
  for (let attempt = 0; requests === 0 && attempt < 100; attempt++) await delay(2);
  assert.equal(requests, 1);
  const afterCrash = new WeatherEngine(f.settings);
  await afterCrash.init();
  t.after(() => afterCrash.close());
  await afterCrash.tick();
  assert.equal(requests, 1);
  assert.equal(afterCrash.status().requestsInLast24Hours, 1);
  assert.equal(Date.parse(afterCrash.status().nextAttemptAt), f.clock + INTERVAL);
  assert.equal(afterCrash.status().matterValue, null);
  await f.engine.setMode('simulated');
  await f.engine.setSimulated(1234);
  f.advance(DAY);
  await f.engine.tick();
  assert.equal(requests, 1);
  assert.equal(f.engine.status().matterValue, 1234);
  await f.engine.close();
});

test('old cache starts unavailable and corrupted state is never silently reset', async t => {
  const f = await fixture(t);
  await f.engine.setMode('weather');
  await f.tick();
  f.advance(FRESHNESS);
  const restarted = new WeatherEngine(f.settings);
  await restarted.init();
  t.after(() => restarted.close());
  assert.equal(restarted.status().matterValue, null);
  await fs.writeFile(f.engine.filename, '{"version":1}');
  await assert.rejects(new WeatherEngine(f.settings).init(), /Invalid weather state/);
  assert.equal(await fs.readFile(f.engine.filename, 'utf8'), '{"version":1}');
});

test('HTTP adapter disables redirects, bounds responses, handles errors, and redacts credentials', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'otm-http-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const credentialPath = path.join(directory, 'credential');
  const dummyKey = 'testcredential01234567890123456789';
  await fs.writeFile(credentialPath, dummyKey);
  const options = { credentialPath, now: () => epoch, fetchImpl: async (url, settings) => {
    assert.equal(settings.redirect, 'manual');
    assert.equal(url.pathname, '/data/4.0/onecall/current');
    assert.equal(url.searchParams.get('units'), 'metric');
    assert.equal(url.searchParams.get('appid'), dummyKey);
    return new Response(JSON.stringify(body()));
  } };
  assert.equal((await fetchCurrent(config, undefined, options)).matterValue, 2000);
  for (const [status, category] of [[401, 'authentication_error'], [403, 'authentication_error'], [404, 'configuration_error'],
    [302, 'configuration_error'], [500, 'provider_error'], [429, 'rate_limited']]) {
    await assert.rejects(fetchCurrent(config, undefined, { ...options, fetchImpl: async () => new Response('', {
      status, headers: { 'Retry-After': '7200' } }) }), error => {
      assert.equal(error.category, category);
      assert.doesNotMatch(error.message, /appid|testcredential/);
      if (status === 429) assert.equal(error.retryAt, epoch + 7200000);
      return true;
    });
  }
  for (const text of ['not JSON', 'x'.repeat(65537)]) {
    await assert.rejects(fetchCurrent(config, undefined, { ...options, fetchImpl: async () => new Response(text) }), /invalid_response/);
  }
  await assert.rejects(fetchCurrent(config, undefined, { ...options,
    fetchImpl: async () => { throw new Error(`secret URL appid=${dummyKey}`); } }), error => error.message === 'network_error');
  await assert.rejects(fetchCurrent(config, undefined, { ...options, timeout: 5, fetchImpl: async (_url, { signal }) => {
    await delay(20, undefined, { signal });
    return new Response('');
  } }), /timeout/);
});
