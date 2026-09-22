import { decodeNpy, encodeNpy } from './catalog-npy.js';
import type { NpyArray } from './catalog-npy.js';

type NumericArray =
  | Int8Array
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | BigInt64Array
  | BigUint64Array
  | Float32Array
  | Float64Array;

const nativeOrder = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? '<' : '>';

/** Owns a validated numeric NumPy payload without rounding its values. */
export class CatalogArray {
  readonly descr: string;
  readonly shape: readonly number[];
  readonly fortranOrder: boolean;
  readonly #data: Uint8Array;

  constructor(array: NpyArray) {
    const copy = decodeNpy(encodeNpy(array));
    this.descr = copy.descr;
    this.shape = Object.freeze([...copy.shape]);
    this.fortranOrder = copy.fortranOrder;
    this.#data = copy.data;
    Object.freeze(this);
  }

  get data(): Uint8Array {
    return new Uint8Array(this.#data);
  }

  toNpy(): Uint8Array {
    return encodeNpy({ descr: this.descr, shape: this.shape, fortranOrder: this.fortranOrder, data: this.#data });
  }

  static fromNpy(bytes: Uint8Array): CatalogArray {
    return new CatalogArray(decodeNpy(bytes));
  }
}

export function catalogArray(values: NumericArray, shape: readonly number[] = [values.length]): CatalogArray {
  const types: readonly [Function, string][] = [
    [Int8Array, '|i1'],
    [Uint8Array, '|u1'],
    [Int16Array, `${nativeOrder}i2`],
    [Uint16Array, `${nativeOrder}u2`],
    [Int32Array, `${nativeOrder}i4`],
    [Uint32Array, `${nativeOrder}u4`],
    [BigInt64Array, `${nativeOrder}i8`],
    [BigUint64Array, `${nativeOrder}u8`],
    [Float32Array, `${nativeOrder}f4`],
    [Float64Array, `${nativeOrder}f8`],
  ];
  const descr = types.find(([type]) => values instanceof type)?.[1];
  if (!descr) throw new TypeError('Array values require a supported numeric typed array');
  return new CatalogArray({
    descr,
    shape,
    fortranOrder: false,
    data: new Uint8Array(values.buffer, values.byteOffset, values.byteLength),
  });
}
