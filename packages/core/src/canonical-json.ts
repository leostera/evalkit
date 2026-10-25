// Dependency-free so browser bundles (the dashboard) can import it without
// pulling in the Effect schemas behind the package root.
import type { JsonValue } from './index.js';

/** Canonical JSON: keys sorted recursively, array order preserved. Rejects non-JSON inputs. */
export function canonicalParameters(value: JsonValue): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map(canonicalParameters).join(',')}]`;
  if (
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalParameters(value[key]!)}`,
      )
      .join(',')}}`;
  }
  throw new Error('Matrix parameters must be finite JSON values');
}
