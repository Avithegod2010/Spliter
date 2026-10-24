import {
  computeParts,
  computePartsForCount,
  partSizeForCount,
  previewPartCount,
  validatePartSequence,
  MIN_PART_SIZE,
} from '../split-math';

const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;

describe('computeParts', () => {
  it('returns a single part when part size >= file size', () => {
    expect(computeParts(5 * MB, 2 * GB)).toEqual([{ index: 1, sizeBytes: 5 * MB }]);
  });

  it('splits evenly with remainder on the last part', () => {
    const parts = computeParts(10 * MB, 3 * MB);
    expect(parts.map((p) => p.sizeBytes)).toEqual([3 * MB, 3 * MB, 3 * MB, MB]);
    expect(parts.map((p) => p.index)).toEqual([1, 2, 3, 4]);
  });

  it('handles an exact division (no remainder part)', () => {
    const parts = computeParts(9 * MB, 3 * MB);
    expect(parts).toHaveLength(3);
    expect(parts.every((p) => p.sizeBytes === 3 * MB)).toBe(true);
  });

  it('sums to exactly the total for odd sizes', () => {
    const total = 9_999_999_123;
    const parts = computeParts(total, 2_147_483_648); // 2 GB
    const sum = parts.reduce((acc, p) => acc + p.sizeBytes, 0);
    expect(sum).toBe(total);
    expect(parts.slice(0, -1).every((p) => p.sizeBytes === 2_147_483_648)).toBe(true);
    expect(parts[parts.length - 1].sizeBytes).toBeLessThan(2_147_483_648);
  });

  it('rejects empty files and tiny part sizes', () => {
    expect(() => computeParts(0, MB)).toThrow(/empty/i);
    expect(() => computeParts(MB, 512)).toThrow(/1 KB/i);
    expect(() => computeParts(MB, MB + 0.5)).toThrow(); // non-integer part size
  });
});

describe('partSizeForCount / computePartsForCount', () => {
  it('produces exactly n parts', () => {
    const parts = computePartsForCount(10 * MB, 4);
    expect(parts).toHaveLength(4);
    const sum = parts.reduce((a, p) => a + p.sizeBytes, 0);
    expect(sum).toBe(10 * MB);
  });

  it('keeps every part at or above the minimum size', () => {
    expect(() => partSizeForCount(3 * KB, 4)).toThrow(/minimum/i);
    expect(partSizeForCount(8 * KB, 4)).toBe(2 * KB);
  });

  it('rejects invalid counts', () => {
    expect(() => partSizeForCount(MB, 0)).toThrow();
    expect(() => partSizeForCount(MB, 2.5)).toThrow();
    expect(() => partSizeForCount(MB, 10000)).toThrow(/9999/);
  });
});

describe('previewPartCount', () => {
  it('ceil-divides', () => {
    expect(previewPartCount(10 * MB, 3 * MB)).toBe(4);
    expect(previewPartCount(9 * MB, 3 * MB)).toBe(3);
    expect(previewPartCount(MB, 2 * MB)).toBe(1);
  });
});

describe('validatePartSequence', () => {
  it('accepts a healthy sequence', () => {
    expect(validatePartSequence([MB, MB, 512 * KB], 2.5 * MB, MB)).toBeNull();
  });

  it('detects wrong part size, empty parts, and wrong total', () => {
    expect(validatePartSequence([MB, 999 * KB, 512 * KB], 2.5 * MB, MB)).toMatch(/Part 2/);
    expect(validatePartSequence([0], 0, MB)).toMatch(/empty/i);
    expect(validatePartSequence([MB, MB], 3 * MB, MB)).toMatch(/sum/i);
    expect(validatePartSequence([], 0)).toMatch(/No parts/);
  });

  it('allows flexible sizes when no expected part size is known', () => {
    expect(validatePartSequence([123, 456, 789])).toBeNull();
  });
});

describe('constants', () => {
  it('minimum part size is 1 KB', () => {
    expect(MIN_PART_SIZE).toBe(1024);
  });
});
