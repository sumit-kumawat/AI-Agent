/**
 * Reads a ZIP's central directory without inflating anything, so Office files
 * that would expand to gigabytes are refused before a parser loads them.
 */
export function inspectZip(buffer: Buffer): { ok: true; entries: string[]; uncompressed: number } | { ok: false } {
  const EOCD = 0x06054b50;
  const CENTRAL = 0x02014b50;
  const start = Math.max(0, buffer.length - 22 - 0xffff);
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) return { ok: false };
  const count = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  if (count === 0xffff || cursor === 0xffffffff || count > 20_000) return { ok: false };
  const entries: string[] = [];
  let uncompressed = 0;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== CENTRAL) return { ok: false };
    const size = buffer.readUInt32LE(cursor + 24);
    if (size === 0xffffffff) return { ok: false };
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    entries.push(buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength));
    uncompressed += size;
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return { ok: true, entries, uncompressed };
}
