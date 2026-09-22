import { CatalogArray } from './catalog-array.js';

/** Convert already-tagged catalog values to inline binary references. */
export function encodeBinaryParts(value: unknown, parts: Uint8Array[]): unknown {
  if (value instanceof CatalogArray) {
    const index = parts.length;
    parts.push(value.toNpy());
    return { $pxt: 'ndarray', v: index };
  }
  if (value instanceof Uint8Array) {
    const index = parts.length;
    parts.push(new Uint8Array(value));
    return { $pxt: 'bytes', v: index };
  }
  if (Array.isArray(value)) return value.map((item) => encodeBinaryParts(item, parts));
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeBinaryParts(item, parts)]));
  return value;
}

/** Resolve inline bytes without interpreting other protocol tags. */
export function decodeBinaryParts(value: unknown, parts: readonly Uint8Array[]): unknown {
  const used = new Set<number>();
  function decode(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(decode);
    if (typeof item !== 'object' || item === null) return item;
    const object = item as Record<string, unknown>;
    if (object.$pxt === 'bytes' || object.$pxt === 'ndarray') {
      const index = object.v;
      if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0 || index >= parts.length)
        throw new TypeError('Invalid inline binary part reference');
      used.add(index);
      return object.$pxt === 'ndarray' ? CatalogArray.fromNpy(parts[index]!) : new Uint8Array(parts[index]!);
    }
    return Object.fromEntries(Object.entries(object).map(([key, child]) => [key, decode(child)]));
  }
  const result = decode(value);
  if (used.size !== parts.length) throw new TypeError('Unexpected binary catalog result');
  return result;
}
