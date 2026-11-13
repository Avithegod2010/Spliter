import {
  computeParts,
  computePartsForCount,
  computeResumePoint,
  MIN_SEGMENT_MS,
  partSizeForCount,
  previewPartCount,
  previewPartCountByDuration,
  validateDurationMs,
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

describe('computeResumePoint', () => {
  it('starts fresh when nothing was written', () => {
    expect(computeResumePoint(0, MB)).toEqual({ partIndex: 1, byteOffset: 0 });
  });

  it('skips completed parts and resumes inside the partial one', () => {
    expect(computeResumePoint(2 * MB + 512 * KB, MB)).toEqual({ partIndex: 3, byteOffset: 512 * KB });
    expect(computeResumePoint(1, MB)).toEqual({ partIndex: 1, byteOffset: 1 });
    expect(computeResumePoint(MB - 1, MB)).toEqual({ partIndex: 1, byteOffset: MB - 1 });
  });

  it('moves to a fresh part when the last write completed a part exactly', () => {
    expect(computeResumePoint(2 * MB, MB)).toEqual({ partIndex: 3, byteOffset: 0 });
    expect(computeResumePoint(MB, MB)).toEqual({ partIndex: 2, byteOffset: 0 });
  });

  it('resuming at any cut point stays consistent with the uninterrupted plan', () => {
    const total = 10 * MB + 123;
    const size = 3 * MB;
    const plan = computeParts(total, size);
    const cutPoints = [0, 1, size - 1, size, size + 1, 2 * size, 3 * size + 17, total - size, total - 1];
    for (const x of cutPoints) {
      const { partIndex, byteOffset } = computeResumePoint(x, size);
      const written = (partIndex - 1) * size + byteOffset;
      expect(written).toBe(x);
      const rest = plan.slice(partIndex - 1);
      expect(rest[0].sizeBytes).toBeGreaterThanOrEqual(byteOffset);
      const remaining = rest[0].sizeBytes - byteOffset + rest.slice(1).reduce((a, p) => a + p.sizeBytes, 0);
      expect(remaining).toBe(total - x);
    }
  });

  it('rejects invalid positions and part sizes', () => {
    expect(() => computeResumePoint(-1, MB)).toThrow();
    expect(() => computeResumePoint(1.5, MB)).toThrow();
    expect(() => computeResumePoint(MB, 512)).toThrow(/1 KB/i);
  });
});

describe('duration splitting', () => {
  const MIN = 60_000;

  it('ceil-divides the media timeline into segments', () => {
    expect(previewPartCountByDuration(30 * MIN, 5 * MIN)).toBe(6);
    expect(previewPartCountByDuration(31 * MIN, 5 * MIN)).toBe(7);
    expect(previewPartCountByDuration(4 * MIN, 5 * MIN)).toBe(1);
    expect(previewPartCountByDuration(5 * MIN, 5 * MIN)).toBe(1);
    expect(previewPartCountByDuration(5 * MIN + 1, 5 * MIN)).toBe(2);
  });

  it('validates segment lengths', () => {
    expect(() => validateDurationMs(0)).toThrow(/1 second/i);
    expect(() => validateDurationMs(MIN_SEGMENT_MS - 1)).toThrow();
    expect(() => validateDurationMs(1500.5)).toThrow();
    expect(() => validateDurationMs(NaN)).toThrow();
    expect(() => validateDurationMs(MIN)).not.toThrow();
  });

  it('rejects unreadable timelines and too many segments', () => {
    expect(() => previewPartCountByDuration(0, MIN)).toThrow(/duration/i);
    expect(() => previewPartCountByDuration(-5, MIN)).toThrow();
    expect(() => previewPartCountByDuration(600_000, 999)).toThrow();
    expect(() => previewPartCountByDuration(10_000_000, 1000)).toThrow(/9999/);
    expect(previewPartCountByDuration(9_999_000, 1000)).toBe(9999);
  });
});
