export interface NpyArray {
  descr: string;
  fortranOrder: boolean;
  shape: readonly number[];
  data: Uint8Array;
}

function byteLength(array: Omit<NpyArray, 'data'>): number {
  const dtype = /^([<>|])([biuf])(1|2|4|8)$/.exec(array.descr);
  if (!dtype || (dtype[2] === 'b' && dtype[3] !== '1') || (dtype[2] === 'f' && dtype[3] === '1'))
    throw new TypeError('Unsupported NumPy dtype');
  if (dtype[1] === '|' && dtype[3] !== '1') throw new TypeError('Multi-byte NumPy values require byte order');
  if (typeof array.fortranOrder !== 'boolean' || !Array.isArray(array.shape))
    throw new TypeError('Invalid NumPy layout');
  let elements = 1;
  for (const dimension of array.shape) {
    if (!Number.isSafeInteger(dimension) || dimension < 0) throw new TypeError('Invalid NumPy shape');
    elements *= dimension;
    if (!Number.isSafeInteger(elements)) throw new TypeError('NumPy shape exceeds safe size');
  }
  const size = elements * Number(dtype[3]);
  if (!Number.isSafeInteger(size)) throw new TypeError('NumPy payload exceeds safe size');
  return size;
}

export function encodeNpy(array: NpyArray): Uint8Array {
  if (!(array.data instanceof Uint8Array) || array.data.byteLength !== byteLength(array))
    throw new TypeError('NumPy data length does not match shape and dtype');
  const shape = array.shape.length ? `${array.shape.join(', ')},` : '';
  const dictionary = `{'descr': '${array.descr}', 'fortran_order': ${array.fortranOrder ? 'True' : 'False'}, 'shape': (${shape}), }`;
  const headerSize = Math.ceil((10 + dictionary.length + 1) / 64) * 64 - 10;
  if (headerSize > 0xffff) throw new TypeError('NumPy header exceeds version 1 size');
  const header = new TextEncoder().encode(dictionary.padEnd(headerSize - 1, ' ') + '\n');
  const result = new Uint8Array(10 + header.length + array.data.byteLength);
  result.set([0x93, 78, 85, 77, 80, 89, 1, 0]);
  new DataView(result.buffer).setUint16(8, header.length, true);
  result.set(header, 10);
  result.set(array.data, 10 + header.length);
  return result;
}

export function decodeNpy(bytes: Uint8Array): NpyArray {
  if (bytes.length < 10 || ![0x93, 78, 85, 77, 80, 89].every((value, index) => bytes[index] === value))
    throw new TypeError('Invalid NumPy magic');
  const version = bytes[6];
  if (![1, 2, 3].includes(version!) || bytes[7] !== 0) throw new TypeError('Unsupported NumPy version');
  const prefix = version === 1 ? 10 : 12;
  if (bytes.length < prefix) throw new TypeError('Truncated NumPy header');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLength = version === 1 ? view.getUint16(8, true) : view.getUint32(8, true);
  if (headerLength > bytes.length - prefix) throw new TypeError('Truncated NumPy header');
  const header = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(prefix, prefix + headerLength));
  if (!header.endsWith('\n')) throw new TypeError('Invalid NumPy header terminator');
  // Parse only the numeric-array dictionary grammar; never evaluate Python literals.
  const body = /^\s*\{([\s\S]*)\}\s*$/.exec(header)?.[1];
  if (body === undefined) throw new TypeError('Invalid NumPy header');
  const fields = new Map<string, string>();
  const entry = /\s*(['"])(descr|fortran_order|shape)\1\s*:\s*('[^']*'|"[^"]*"|True|False|\([\d,\s]*\))\s*(,|$)/gy;
  let position = 0;
  while (position < body.length && body.slice(position).trim()) {
    entry.lastIndex = position;
    const match = entry.exec(body);
    if (!match || fields.has(match[2]!)) throw new TypeError('Invalid NumPy header field');
    fields.set(match[2]!, match[3]!);
    position = entry.lastIndex;
  }
  const descr = fields.get('descr');
  const order = fields.get('fortran_order');
  const shape = fields.get('shape');
  if (
    fields.size !== 3 ||
    !descr ||
    !/^(['"])[<>|][biuf][1248]\1$/.test(descr) ||
    !['True', 'False'].includes(order!) ||
    !shape?.startsWith('(')
  )
    throw new TypeError('Unsupported NumPy header');
  const dimensions = shape.slice(1, -1).trim();
  if (
    dimensions &&
    !/^\d+\s*,(?:\s*\d+\s*,)*\s*$/.test(dimensions) &&
    !/^\d+\s*,\s*\d+(?:\s*,\s*\d+)*$/.test(dimensions)
  )
    throw new TypeError('Invalid NumPy shape tuple');
  const result: NpyArray = {
    descr: descr.slice(1, -1),
    fortranOrder: order === 'True',
    shape: dimensions ? dimensions.replace(/,\s*$/, '').split(',').map(Number) : [],
    data: new Uint8Array(bytes.subarray(prefix + headerLength)),
  };
  if (result.data.byteLength !== byteLength(result))
    throw new TypeError('NumPy data length does not match shape and dtype');
  return result;
}
