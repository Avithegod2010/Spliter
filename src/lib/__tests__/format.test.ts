import { formatBytes, formatDuration, parseSizeInput } from '../format';

describe('formatBytes', () => {
  it('formats each unit range', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatBytes(1024 ** 3)).toBe('1 GB');
    expect(formatBytes(2.25 * 1024 ** 3)).toBe('2.25 GB');
  });

  it('handles garbage gracefully', () => {
    expect(formatBytes(-5)).toBe('—');
    expect(formatBytes(NaN)).toBe('—');
  });
});

describe('parseSizeInput', () => {
  it('parses MB and GB with 1024 base', () => {
    expect(parseSizeInput('10', 'MB')).toBe(10 * 1024 * 1024);
    expect(parseSizeInput('2', 'GB')).toBe(2 * 1024 ** 3);
    expect(parseSizeInput('2.5', 'GB')).toBe(2.5 * 1024 ** 3);
    expect(parseSizeInput('1,5', 'MB')).toBe(1.5 * 1024 * 1024);
  });

  it('rejects junk', () => {
    expect(parseSizeInput('', 'MB')).toBeNull();
    expect(parseSizeInput('abc', 'MB')).toBeNull();
    expect(parseSizeInput('0', 'MB')).toBeNull();
    expect(parseSizeInput('-3', 'MB')).toBeNull();
    expect(parseSizeInput('1e9', 'GB')).toBeNull();
  });
});

describe('formatDuration', () => {
  it('formats seconds, minutes, hours', () => {
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(90_000)).toBe('1m 30s');
    expect(formatDuration(3_600_000 + 120_000)).toBe('1h 2m');
    expect(formatDuration(-1)).toBe('—');
  });
});
