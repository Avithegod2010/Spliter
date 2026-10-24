export interface PartPlan {
  index: number; // 1-based
  sizeBytes: number;
}

export const MIN_PART_SIZE = 1024; // 1 KB — below this, splitting is meaningless
export const MAX_PARTS = 9999;
export const MIN_FILE_SIZE = 1; // reject empty files

/**
 * Compute the exact byte size of every part so that:
 *  - all parts except the last are exactly `partSizeBytes`
 *  - the last part carries the remainder (>= 1 byte)
 *  - part sizes sum to exactly totalSize
 */
export function computeParts(totalSize: number, partSizeBytes: number): PartPlan[] {
  validateTotal(totalSize);
  validatePartSize(partSizeBytes);
  if (partSizeBytes >= totalSize) return [{ index: 1, sizeBytes: totalSize }];

  const fullParts = Math.floor(totalSize / partSizeBytes);
  const remainder = totalSize % partSizeBytes;
  const parts: PartPlan[] = [];
  for (let i = 0; i < fullParts; i++) parts.push({ index: i + 1, sizeBytes: partSizeBytes });
  if (remainder > 0) parts.push({ index: fullParts + 1, sizeBytes: remainder });
  return parts;
}

/** Derive a part size (bytes) that produces exactly `count` parts. */
export function partSizeForCount(totalSize: number, count: number): number {
  validateTotal(totalSize);
  if (!Number.isInteger(count) || count < 1) throw new Error('Part count must be a whole number of at least 1');
  if (count > MAX_PARTS) throw new Error(`Cannot split into more than ${MAX_PARTS} parts`);
  if (count > totalSize) throw new Error('More parts than bytes in the file');
  const perPart = Math.floor(totalSize / count);
  if (perPart < MIN_PART_SIZE) throw new Error(`Parts would be smaller than the ${MIN_PART_SIZE} byte minimum`);
  // Steady state: first (count-1) parts get perPart, last gets the remainder.
  return perPart;
}

/**
 * Count-based plan: floor(total/count) per part, last part absorbs the
 * remainder — same scheme the native module writes for count-based splits.
 */
export function computePartsForCount(totalSize: number, count: number): PartPlan[] {
  const partSize = partSizeForCount(totalSize, count);
  return computeParts(totalSize, partSize);
}

export function previewPartCount(totalSize: number, partSizeBytes: number): number {
  validateTotal(totalSize);
  validatePartSize(partSizeBytes);
  if (partSizeBytes >= totalSize) return 1;
  return Math.ceil(totalSize / partSizeBytes);
}

export function validateTotal(totalSize: number): void {
  if (!Number.isFinite(totalSize) || totalSize < MIN_FILE_SIZE) {
    throw new Error('File is empty — there is nothing to split');
  }
  if (!Number.isSafeInteger(totalSize)) throw new Error('File size is too large for this device');
}

export function validatePartSize(partSizeBytes: number): void {
  if (!Number.isInteger(partSizeBytes) || partSizeBytes < MIN_PART_SIZE) {
    throw new Error('Part size must be at least 1 KB');
  }
}

/** True when every part except the last matches size and total matches. */
export function validatePartSequence(sizes: number[], expectedTotal?: number, expectedPartSize?: number): string | null {
  if (sizes.length === 0) return 'No parts found';
  for (let i = 0; i < sizes.length; i++) {
    if (sizes[i] <= 0) return `Part ${i + 1} is empty or unreadable`;
    if (i < sizes.length - 1 && expectedPartSize && sizes[i] !== expectedPartSize) {
      return `Part ${i + 1} is ${sizes[i]} bytes — expected ${expectedPartSize}. It may be corrupted or from a different split.`;
    }
  }
  const total = sizes.reduce((a, b) => a + b, 0);
  if (expectedTotal && total !== expectedTotal) {
    return `Parts sum to ${total} bytes — expected ${expectedTotal}. Parts may be missing or corrupted.`;
  }
  return null;
}
