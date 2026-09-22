export const proxyProtocolVersion = 4;
export const proxySchemaVersion = 56;

export function encodeProxyFrame(head: Uint8Array, parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const lengths = [head.length, parts.length, ...parts.map((part) => part.length)];
  if (lengths.some((length) => length > 0xffffffff)) throw new RangeError('Proxy frame exceeds uint32 limits');
  const output = new Uint8Array(8 + head.length + parts.reduce((size, part) => size + 4 + part.length, 0));
  const view = new DataView(output.buffer);
  let offset = 0;
  const writeLength = (length: number): void => {
    view.setUint32(offset, length);
    offset += 4;
  };
  const write = (value: Uint8Array): void => {
    output.set(value, offset);
    offset += value.length;
  };
  writeLength(head.length);
  write(head);
  writeLength(parts.length);
  for (const part of parts) {
    writeLength(part.length);
    write(part);
  }
  return output;
}

export function decodeProxyFrame(frame: Uint8Array): { head: Uint8Array; parts: Uint8Array[] } {
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  let offset = 0;
  const take = (length: number): Uint8Array => {
    if (length > frame.length - offset) throw new TypeError('Truncated proxy frame');
    const value = frame.slice(offset, offset + length);
    offset += length;
    return value;
  };
  const readLength = (): number => {
    if (frame.length - offset < 4) throw new TypeError('Truncated proxy frame');
    const length = view.getUint32(offset);
    offset += 4;
    return length;
  };
  const head = take(readLength());
  const count = readLength();
  if (count > Math.floor((frame.length - offset) / 4)) throw new TypeError('Truncated proxy frame');
  const parts = Array.from({ length: count }, () => take(readLength()));
  if (offset !== frame.length) throw new TypeError('Trailing bytes after proxy frame');
  return { head, parts };
}
