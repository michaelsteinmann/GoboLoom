import { crc32, zip } from './zip';

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('hello'))).toBe(0x3610a686);
  });

  it('writes local headers, a central directory and an end record', () => {
    const out = zip([
      { name: 'a.txt', data: 'hello' },
      { name: 'slides/b.bin', data: new Uint8Array([1, 2, 3]) },
    ]);
    const v = new DataView(out.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    const end = out.length - 22;
    expect(v.getUint32(end, true)).toBe(0x06054b50);
    expect(v.getUint16(end + 10, true)).toBe(2);
    const cdOffset = v.getUint32(end + 16, true);
    expect(v.getUint32(cdOffset, true)).toBe(0x02014b50);
    expect(cdOffset + v.getUint32(end + 12, true)).toBe(end);
  });
});
