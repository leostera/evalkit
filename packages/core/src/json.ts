import type { JsonValue } from './index.js';

/** A value that cannot be stored in a report, with the path of the offending part. */
export class NotJsonError extends Error {
  override readonly name = 'NotJsonError';
  constructor(
    readonly path: string,
    readonly reason: string,
  ) {
    super(`${path}: ${reason}`);
  }
}

/**
 * Converts an author-supplied value to JSON once, where it enters EvalKit.
 * Honours `toJSON()` (so `Date` becomes an ISO string) and drops `undefined`
 * object fields. Rejects functions, symbols, bigints, non-finite numbers and
 * cycles, naming the path of the bad value.
 */
export function toJson(value: unknown, path = 'value'): JsonValue {
  return convert(value, path, new Set());
}

function convert(value: unknown, path: string, seen: Set<object>): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new NotJsonError(path, `${value} is not JSON`);
    return value;
  }
  if (value === undefined)
    throw new NotJsonError(path, 'undefined is not JSON');
  if (typeof value !== 'object')
    throw new NotJsonError(path, `${typeof value} is not JSON`);
  if (seen.has(value)) throw new NotJsonError(path, 'cycle is not JSON');

  const withToJson = value as { toJSON?: unknown };
  if (typeof withToJson.toJSON === 'function') {
    return convert((withToJson.toJSON as () => unknown)(), path, seen);
  }

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item, index) =>
        convert(item === undefined ? null : item, `${path}[${index}]`, seen),
      );
    }
    if (value instanceof Map || value instanceof Set)
      throw new NotJsonError(path, `${value.constructor.name} is not JSON`);
    const result: { [key: string]: JsonValue } = {};
    for (const [key, field] of Object.entries(value)) {
      if (field === undefined) continue;
      result[key] = convert(field, `${path}.${key}`, seen);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

/** `toJson` for values that must be objects, such as metadata. */
export function toJsonObject(
  value: unknown,
  path: string,
): { [key: string]: JsonValue } {
  const converted = toJson(value, path);
  if (
    converted === null ||
    typeof converted !== 'object' ||
    Array.isArray(converted)
  )
    throw new NotJsonError(path, 'must be a JSON object');
  return converted;
}
