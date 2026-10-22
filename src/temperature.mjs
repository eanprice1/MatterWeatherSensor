export const MIN_MATTER = -27315;
export const MAX_MATTER = 32767;

export function validateMatter(value) {
  if (value !== null && (!Number.isInteger(value) || value < MIN_MATTER || value > MAX_MATTER)) {
    throw new Error('Measurement must be null or a valid Matter temperature integer');
  }
  return value;
}

export function fahrenheitToMatter(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Temperature must be a finite number');
  const scaled = (value - 32) * 500 / 9;
  // Permit floating-point arithmetic noise at the physical limits, not out-of-range readings.
  if (scaled < MIN_MATTER - 1e-9 || scaled > MAX_MATTER + 1e-9) throw new Error('Temperature is outside the Matter range');
  return validateMatter(Math.round(scaled));
}

export function displayTemperature(value) {
  validateMatter(value);
  return {
    matterValue: value,
    celsius: value === null ? null : value / 100,
    fahrenheit: value === null ? null : Number((value / 100 * 9 / 5 + 32).toFixed(3)),
  };
}
