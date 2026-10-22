import fs from 'node:fs/promises';
import path from 'node:path';
import { MIN_MATTER, MAX_MATTER, validateMatter, displayTemperature } from './temperature.mjs';
import { writeJson } from './state.mjs';

export const INTERVAL = 15 * 60 * 1000;
export const FRESHNESS = 30 * 60 * 1000;
export const DAY = 24 * 60 * 60 * 1000;
export const LIMIT = 900;

export class WeatherError extends Error {
  constructor(category, retryAt = null) {
    super(category);
    this.category = category;
    this.retryAt = retryAt;
  }
}

function configuration(value) {
  if (!value || !Number.isFinite(value.latitude) || Math.abs(value.latitude) > 90 ||
      !Number.isFinite(value.longitude) || Math.abs(value.longitude) > 180) {
    throw new WeatherError('configuration_error');
  }
  return { latitude: value.latitude, longitude: value.longitude };
}

export async function loadConfiguration(filename) {
  try { return configuration(JSON.parse(await fs.readFile(filename, 'utf8'))); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new WeatherError('configuration_error');
  }
}

export function parseCurrent(body, config, now = Date.now()) {
  configuration(config);
  const record = body?.data?.[0];
  if (!Array.isArray(body?.data) || body.data.length !== 1 ||
      !Number.isFinite(body.lat) || !Number.isFinite(body.lon) ||
      Math.abs(body.lat - config.latitude) > 0.02 || Math.abs(body.lon - config.longitude) > 0.02 ||
      !Number.isFinite(record?.temp) || record.temp * 100 < MIN_MATTER || record.temp * 100 > MAX_MATTER ||
      !Number.isSafeInteger(record?.dt) || record.dt <= 0 ||
      now - record.dt * 1000 >= FRESHNESS || record.dt * 1000 - now > 5 * 60 * 1000) {
    throw new WeatherError('invalid_response');
  }
  return { matterValue: validateMatter(Math.round(record.temp * 100)), providerAt: record.dt * 1000, fetchedAt: now };
}

export async function fetchCurrent(config, signal, { fetchImpl = fetch, now = Date.now,
  credentialPath = path.join(process.env.CREDENTIALS_DIRECTORY ?? '/nonexistent', 'openweather-api-key'),
  timeout = 10000 } = {}) {
  let key;
  try {
    key = (await fs.readFile(credentialPath, 'utf8')).trim();
    if (!/^[a-zA-Z0-9]{16,128}$/.test(key)) throw new Error();
  } catch { throw new WeatherError('configuration_error'); }
  const url = new URL('https://api.openweathermap.org/data/4.0/onecall/current');
  url.search = new URLSearchParams({ lat: config.latitude, lon: config.longitude, units: 'metric', appid: key });
  const deadline = AbortSignal.timeout(timeout);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  try {
    const response = await fetchImpl(url, { redirect: 'manual', signal: combined });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429) {
        const header = response.headers.get('retry-after');
        const duration = header && /^\d+$/.test(header) ? now() + Number(header) * 1000 : Date.parse(header);
        throw new WeatherError('rate_limited', Math.max(now() + 3600000, Number.isFinite(duration) ? duration : 0));
      }
      if (response.status === 401 || response.status === 403) throw new WeatherError('authentication_error');
      if (response.status >= 300 && response.status < 500) throw new WeatherError('configuration_error');
      throw new WeatherError('provider_error');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new WeatherError('invalid_response');
    const chunks = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 65536) { await reader.cancel(); throw new WeatherError('invalid_response'); }
      chunks.push(Buffer.from(value));
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new WeatherError('invalid_response'); }
    return parseCurrent(body, config, now());
  } catch (error) {
    if (error instanceof WeatherError) throw error;
    throw new WeatherError(deadline.aborted ? 'timeout' : 'network_error');
  }
}

function initialState() {
  return { version: 1, mode: 'simulated', sample: null, attempts: [], lastAttemptAt: null,
    nextAttemptAt: null, failures: 0, lastError: null };
}
const timestamp = value => value === null || (Number.isSafeInteger(value) && value >= 0);
const categories = ['configuration_error', 'authentication_error', 'rate_limited', 'provider_error',
  'invalid_response', 'timeout', 'network_error', 'daily_limit'];

function validateState(value) {
  if (value?.version !== 1 || !['weather', 'simulated'].includes(value.mode) ||
      !Array.isArray(value.attempts) || value.attempts.length > LIMIT ||
      !value.attempts.every(item => timestamp(item) && item !== null) ||
      !timestamp(value.lastAttemptAt) || !timestamp(value.nextAttemptAt) ||
      !Number.isSafeInteger(value.failures) || value.failures < 0 ||
      (value.lastError !== null && !categories.includes(value.lastError))) throw new Error('Invalid weather state; refusing to reset it');
  if (value.sample !== null) {
    validateMatter(value.sample?.matterValue);
    if (value.sample?.matterValue === null || !timestamp(value.sample?.providerAt) || value.sample?.providerAt === null ||
        !timestamp(value.sample?.fetchedAt) || value.sample?.fetchedAt === null) throw new Error('Invalid cached weather state');
  }
  return value;
}

// State changes and Matter publication are serialized, but HTTP never blocks local control.
export class WeatherEngine {
  constructor({ directory, simulated, readingPath, config, publish, now = Date.now,
    fetchWeather = fetchCurrent, save = (filename, value) => writeJson(filename, value, true),
    automatic = true }) {
    Object.assign(this, { directory, simulated, readingPath, config, publish, now, fetchWeather, save, automatic });
    this.filename = path.join(directory, 'weather-state.json');
    this.queue = Promise.resolve();
    this.inFlight = false;
    this.paused = false;
    this.storageBlocked = false;
    this.stopped = false;
    this.publishedValue = undefined;
    this.publishedAt = null;
  }
  enqueue(operation) {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {});
    return result;
  }
  async init() {
    try { this.state = validateState(JSON.parse(await fs.readFile(this.filename, 'utf8'))); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.commit(initialState());
    }
    // Restart is the explicit recovery path after fixing authentication/configuration.
    if (['authentication_error', 'configuration_error'].includes(this.state.lastError)) {
      await this.commit({ ...this.state, nextAttemptAt: null, lastError: null });
    }
    await this.syncPublished();
  }
  async commit(next) {
    try { await this.save(this.filename, next); }
    catch { this.storageBlocked = true; throw new Error('Weather state could not be saved; fetching blocked until restart'); }
    this.state = next;
  }
  fresh() {
    const sample = this.state.sample;
    return !!sample && this.now() - sample.fetchedAt < FRESHNESS && this.now() - sample.providerAt < FRESHNESS &&
      sample.providerAt - this.now() <= 300000 && sample.fetchedAt <= this.now();
  }
  selectedValue() {
    return this.state.mode === 'simulated' ? this.simulated.matterValue : this.fresh() ? this.state.sample.matterValue : null;
  }
  async syncPublished() {
    const value = this.selectedValue();
    if (value !== this.publishedValue) {
      await this.publish(value);
      this.publishedValue = value;
      this.publishedAt = this.now();
    }
  }
  status() {
    const iso = value => value === null ? null : new Date(value).toISOString();
    const sample = this.state.sample;
    return { mode: this.state.mode, ...displayTemperature(this.publishedValue),
      updatedAt: this.state.mode === 'simulated' ? this.simulated.updatedAt : iso(this.publishedAt),
      lastAttemptAt: iso(this.state.lastAttemptAt), lastSuccessAt: iso(sample?.fetchedAt ?? null),
      providerTimestamp: iso(sample?.providerAt ?? null),
      readingAgeSeconds: sample ? Math.max(0, Math.floor((this.now() - Math.min(sample.fetchedAt, sample.providerAt)) / 1000)) : null,
      stale: this.state.mode === 'weather' && !this.fresh(), inFlight: this.inFlight,
      fetchingPaused: this.paused || this.storageBlocked,
      lastError: this.storageBlocked ? 'storage_error' : this.state.lastError,
      nextAttemptAt: this.state.mode === 'weather' && !this.paused && !this.storageBlocked ? iso(this.state.nextAttemptAt) : null,
      requestsInLast24Hours: this.state.attempts.filter(time => time > this.now() - DAY).length,
      requestLimit: LIMIT, intervalSeconds: INTERVAL / 1000, freshnessLimitSeconds: FRESHNESS / 1000 };
  }
  async setMode(mode) {
    if (!['weather', 'simulated'].includes(mode)) throw new Error('Mode must be weather or simulated');
    return this.enqueue(async () => {
      if (mode === 'weather' && !this.config) throw new Error('Weather configuration is not installed');
      await this.commit({ ...this.state, mode });
      await this.syncPublished();
      this.arm();
      return this.status();
    });
  }
  async setSimulated(value) {
    validateMatter(value);
    return this.enqueue(async () => {
      if (this.state.mode !== 'simulated') throw new Error('Manual readings require simulated mode');
      const next = { matterValue: value, updatedAt: new Date(this.now()).toISOString() };
      await writeJson(this.readingPath, next, true);
      this.simulated = next;
      await this.syncPublished();
      return { ...displayTemperature(value), updatedAt: next.updatedAt };
    });
  }
  arm() {
    clearTimeout(this.timer);
    if (!this.automatic || this.stopped) return;
    let delay = 60000;
    if (this.state.mode === 'weather') {
      if (!this.inFlight && !this.paused && !this.storageBlocked) delay = Math.min(delay, Math.max(1, (this.state.nextAttemptAt ?? this.now()) - this.now()));
      if (this.fresh()) delay = Math.min(delay, Math.max(1, Math.min(this.state.sample.providerAt, this.state.sample.fetchedAt) + FRESHNESS - this.now()));
    }
    this.timer = setTimeout(() => {
      void this.tick().catch(() => { this.storageBlocked = true; this.arm(); });
    }, delay);
  }
  start() { this.arm(); }
  async tick() {
    await this.enqueue(async () => {
      if (this.stopped) return;
      await this.syncPublished();
      if (this.state.mode === 'weather' && !this.inFlight && !this.paused && !this.storageBlocked &&
          (this.state.nextAttemptAt === null || this.state.nextAttemptAt <= this.now())) {
        this.inFlight = true;
        this.abort = new AbortController();
        this.fetchTask = this.attempt(this.abort.signal).catch(() => { this.storageBlocked = true; }).finally(() => {
          this.inFlight = false;
          this.arm();
        });
      }
      this.arm();
    });
  }
  async attempt(signal) {
    const proceed = await this.enqueue(async () => {
      if (this.stopped || this.state.mode !== 'weather') return false;
      if (!this.config) {
        await this.commit({ ...this.state, lastError: 'configuration_error', nextAttemptAt: null });
        this.paused = true;
        return false;
      }
      const now = this.now();
      const attempts = this.state.attempts.filter(time => time > now - DAY);
      if (attempts.length >= LIMIT) {
        await this.commit({ ...this.state, attempts, lastError: 'daily_limit', nextAttemptAt: Math.min(...attempts) + DAY });
        return false;
      }
      // Persist both the reservation and crash-recovery delay before any network activity.
      await this.commit({ ...this.state, attempts: [...attempts, now], lastAttemptAt: now, nextAttemptAt: now + INTERVAL });
      return true;
    });
    if (!proceed || signal.aborted) return;
    let sample;
    let failure;
    try { sample = await this.fetchWeather(this.config, signal); }
    catch (error) { failure = error instanceof WeatherError ? error : new WeatherError('network_error'); }
    await this.enqueue(async () => {
      if (this.stopped || signal.aborted) return;
      if (!failure) {
        await this.commit({ ...this.state, sample, failures: 0, lastError: null, nextAttemptAt: this.now() + INTERVAL });
      } else {
        const failures = this.state.failures + 1;
        this.paused = ['configuration_error', 'authentication_error'].includes(failure.category);
        await this.commit({ ...this.state, failures, lastError: failure.category,
          nextAttemptAt: this.paused ? null : failure.category === 'rate_limited' ? failure.retryAt :
            this.now() + (failures === 1 ? 60000 : failures === 2 ? 300000 : INTERVAL) });
      }
      await this.syncPublished();
    });
  }
  async close() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.abort?.abort();
    await this.fetchTask;
    await this.queue;
  }
}
