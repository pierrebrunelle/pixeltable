import { decodeNpy, encodeNpy } from './catalog-npy.js';
import type { NpyArray } from './catalog-npy.js';

export type CatalogNumericArray =
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

  /** Return an independent, native-endian, row-major flattened typed array. */
  toTypedArray(): CatalogNumericArray {
    const dtype = this.descr.slice(1);
    const size = Number(this.descr.slice(2));
    const count = this.#data.length / size;
    const bytes = new Uint8Array(this.#data.length);
    const swap = size > 1 && this.descr[0] !== nativeOrder;
    const strides: number[] = [];
    let stride = 1;
    for (const dimension of this.shape) {
      strides.push(stride);
      stride *= dimension;
    }
    for (let index = 0; index < count; index++) {
      let source = index;
      if (this.fortranOrder) {
        let remaining = index;
        source = 0;
        for (let axis = this.shape.length - 1; axis >= 0; axis--) {
          source += (remaining % this.shape[axis]!) * strides[axis]!;
          remaining = Math.floor(remaining / this.shape[axis]!);
        }
      }
      for (let byte = 0; byte < size; byte++)
        bytes[index * size + byte] = this.#data[source * size + (swap ? size - 1 - byte : byte)]!;
    }
    if (dtype === 'f2') {
      const bits = new Uint16Array(bytes.buffer);
      return Float32Array.from(bits, (value) => {
        const sign = value & 0x8000 ? -1 : 1;
        const exponent = (value >> 10) & 31;
        const fraction = value & 1023;
        if (exponent === 31) return fraction ? NaN : sign * Infinity;
        return sign * (exponent === 0 ? fraction * 2 ** -24 : (1 + fraction / 1024) * 2 ** (exponent - 15));
      });
    }
    if (dtype === 'b1') return bytes.map((value) => (value ? 1 : 0));
    const types = {
      i1: Int8Array,
      u1: Uint8Array,
      i2: Int16Array,
      u2: Uint16Array,
      i4: Int32Array,
      u4: Uint32Array,
      i8: BigInt64Array,
      u8: BigUint64Array,
      f4: Float32Array,
      f8: Float64Array,
    };
    const Type = types[dtype as keyof typeof types];
    return new Type(bytes.buffer);
  }

  toNpy(): Uint8Array {
    return encodeNpy({ descr: this.descr, shape: this.shape, fortranOrder: this.fortranOrder, data: this.#data });
  }

  static fromNpy(bytes: Uint8Array): CatalogArray {
    return new CatalogArray(decodeNpy(bytes));
  }
}

export function catalogArray(values: CatalogNumericArray, shape: readonly number[] = [values.length]): CatalogArray {
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
