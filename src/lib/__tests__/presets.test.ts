import { SIZE_PRESETS, findPreset } from '../presets';

describe('size presets', () => {
  it('contains the six approved presets', () => {
    expect(SIZE_PRESETS.map((p) => p.id)).toEqual([
      'telegram',
      'whatsapp',
      'discord',
      'gmail',
      'fat32',
      'email',
    ]);
  });

  it('preset sizes sit safely under their platform limits', () => {
    const MB = 1024 * 1024;
    const GB = 1024 * MB;
    const byId = Object.fromEntries(SIZE_PRESETS.map((p) => [p.id, p.bytes]));
    expect(byId['discord']).toBeLessThan(10 * MB);
    expect(byId['gmail']).toBeLessThan(25 * MB);
    expect(byId['telegram']).toBeLessThan(2 * GB);
    expect(byId['whatsapp']).toBeLessThan(2 * GB);
    expect(byId['fat32']).toBeLessThan(4 * GB); // FAT32 max file size
    expect(byId['email']).toBeLessThan(10 * MB);
  });

  it('all values are positive safe integers', () => {
    for (const p of SIZE_PRESETS) {
      expect(Number.isSafeInteger(p.bytes)).toBe(true);
      expect(p.bytes).toBeGreaterThan(0);
    }
  });

  it('findPreset returns undefined for unknown ids', () => {
    expect(findPreset('nope')).toBeUndefined();
    expect(findPreset(null)).toBeUndefined();
    expect(findPreset('gmail')?.label).toBe('Gmail');
  });
});
