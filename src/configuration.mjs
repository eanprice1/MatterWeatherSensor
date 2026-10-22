// Deployment metadata only. Persistent node/endpoint identifiers are deliberately unchanged.
function label(environment, key, fallback) {
  const value = environment[key] ?? fallback;
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value, 'utf8') > 32 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${key} must be a nonempty label of at most 32 UTF-8 bytes without control characters`);
  }
  return value;
}

function identifier(environment, key, fallback, minimum, maximum) {
  const raw = environment[key];
  if (raw !== undefined && (typeof raw !== 'string' || !/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(raw))) {
    throw new Error(`${key} must be a decimal or hexadecimal integer`);
  }
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${key} is outside the supported identifier range`);
  }
  return value;
}

export function deviceConfiguration(environment = process.env) {
  return {
    deviceName: label(environment, 'OTM_DEVICE_NAME', 'Outdoor Temperature Sensor'),
    vendorName: label(environment, 'OTM_VENDOR_NAME', 'MatterWeatherSensor'),
    vendorId: identifier(environment, 'OTM_VENDOR_ID', 0xfff1, 1, 0xfff4),
    productId: identifier(environment, 'OTM_PRODUCT_ID', 0x8000, 0, 0xffff),
  };
}

export const hexadecimalId = value => `0x${value.toString(16).toUpperCase().padStart(4, '0')}`;
