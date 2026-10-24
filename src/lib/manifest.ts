export const PART_EXTENSION_DIGITS = 3;
export const MANIFEST_SUFFIX = '.spliter.json';

export interface SplitManifest {
  app: 'Spliter';
  format: 1;
  originalName: string;
  originalSize: number;
  partCount: number;
  partSizeBytes: number;
  sha256?: string;
  createdAt: string;
  partPattern: string;
}

/** `movie.mp4` + index 3 -> `movie.mp4.003` */
export function partName(baseName: string, index: number): string {
  const digits = String(index).padStart(PART_EXTENSION_DIGITS, '0');
  return `${baseName}.${digits}`;
}

export function isPartName(name: string): boolean {
  return /\.\d{3}$/.test(name) && !name.endsWith(MANIFEST_SUFFIX);
}

/** `movie.mp4.003` -> `movie.mp4` (null when the name is not a part) */
export function stripPartSuffix(name: string): string | null {
  const match = name.match(/^(.+)\.\d{3}$/);
  return match ? match[1] : null;
}

export function manifestName(baseName: string): string {
  return `${baseName}${MANIFEST_SUFFIX}`;
}

export function isManifestName(name: string): boolean {
  return name.endsWith(MANIFEST_SUFFIX);
}

export function buildManifest(input: {
  originalName: string;
  originalSize: number;
  partCount: number;
  partSizeBytes: number;
  sha256?: string;
}): SplitManifest {
  return {
    app: 'Spliter',
    format: 1,
    originalName: input.originalName,
    originalSize: input.originalSize,
    partCount: input.partCount,
    partSizeBytes: input.partSizeBytes,
    ...(input.sha256 ? { sha256: input.sha256 } : {}),
    createdAt: new Date().toISOString(),
    partPattern: `%0${PART_EXTENSION_DIGITS}d`,
  };
}

/** Runtime validation (data arrives from JSON files on disk). */
export function isManifest(value: unknown): value is SplitManifest {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    m.app === 'Spliter' &&
    m.format === 1 &&
    typeof m.originalName === 'string' &&
    typeof m.originalSize === 'number' &&
    typeof m.partCount === 'number' &&
    typeof m.partSizeBytes === 'number'
  );
}
