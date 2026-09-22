declare const dateValue: unique symbol;
declare const timestampValue: unique symbol;
export type CatalogDate = string & { readonly [dateValue]: true };
export type CatalogTimestamp = string & { readonly [timestampValue]: true };

export function catalogDate(value: string): CatalogDate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError('Dates require YYYY-MM-DD');
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]!)
    throw new TypeError('Invalid calendar date');
  return value as CatalogDate;
}

export function catalogTimestamp(value: string): CatalogTimestamp {
  const match =
    typeof value === 'string'
      ? /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value)
      : null;
  if (!match) throw new TypeError('Timestamps require an ISO date/time, timezone, and at most six fractional digits');
  catalogDate(match[1]!);
  const [hour, minute, second] = match.slice(2, 5).map(Number) as [number, number, number];
  const zone = match[6]!;
  const zoneHour = zone === 'Z' ? 0 : Number(zone.slice(1, 3));
  const zoneMinute = zone === 'Z' ? 0 : Number(zone.slice(4, 6));
  if (hour > 23 || minute > 59 || second > 59 || zoneHour > 23 || zoneMinute > 59)
    throw new TypeError('Invalid timestamp time or timezone');
  const milliseconds = Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}${zone}`);
  const utc = new Date(milliseconds).toISOString().slice(0, 19);
  catalogDate(utc.slice(0, 10));
  const fraction = (match[5] ?? '').padEnd(6, '0');
  return `${utc}${fraction === '000000' ? '' : `.${fraction}`}+00:00` as CatalogTimestamp;
}
