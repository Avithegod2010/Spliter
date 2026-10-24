const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;

export function formatBytes(bytes: number, precision?: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < KB) return `${Math.round(bytes)} B`;
  if (bytes < MB) return trim(bytes / KB, precision ?? (bytes / KB < 10 ? 1 : 0)) + ' KB';
  if (bytes < GB) return trim(bytes / MB, precision ?? (bytes / MB < 10 ? 2 : 1)) + ' MB';
  return trim(bytes / GB, precision ?? (bytes / GB < 10 ? 2 : 1)) + ' GB';
}

function trim(value: number, precision: number): string {
  const fixed = value.toFixed(precision);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function parseSizeInput(raw: string, unit: 'MB' | 'GB'): number | null {
  const cleaned = raw.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  const bytes = unit === 'MB' ? value * MB : value * GB;
  return Number.isSafeInteger(Math.round(bytes)) ? Math.round(bytes) : null;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
