declare const uuidValue: unique symbol;
export type CatalogUuid = string & { readonly [uuidValue]: true };

export function catalogUuid(value: string): CatalogUuid {
  if (typeof value !== 'string') throw new TypeError('UUIDs require a string');
  let text = value;
  if (text.startsWith('urn:uuid:')) text = text.slice(9);
  if (text.startsWith('{') && text.endsWith('}')) text = text.slice(1, -1);
  if (!/^(?:[a-fA-F0-9]{32}|[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})$/.test(text))
    throw new TypeError('Invalid UUID');
  const hex = text.replaceAll('-', '').toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as CatalogUuid;
}
