export interface SizePreset {
  id: string;
  label: string;
  sublabel: string;
  bytes: number;
}

const MB = 1024 * 1024;

/**
 * Values sit just under each platform's real limit so the produced parts
 * always upload / transfer cleanly.
 */
export const SIZE_PRESETS: SizePreset[] = [
  { id: 'telegram', label: 'Telegram', sublabel: '2 GB', bytes: 1950 * MB },
  { id: 'whatsapp', label: 'WhatsApp', sublabel: '2 GB', bytes: 1950 * MB },
  { id: 'discord', label: 'Discord', sublabel: '10 MB', bytes: 9 * MB },
  { id: 'gmail', label: 'Gmail', sublabel: '25 MB', bytes: 24 * MB },
  { id: 'fat32', label: 'FAT32 USB', sublabel: '4 GB', bytes: 4095 * MB },
  { id: 'email', label: 'Email-safe', sublabel: '10 MB', bytes: 9 * MB },
];

export function findPreset(id: string | null | undefined): SizePreset | undefined {
  if (!id) return undefined;
  return SIZE_PRESETS.find((p) => p.id === id);
}

export interface DurationPreset {
  id: string;
  label: string;
  sublabel: string;
  minutes: number;
}

/** Segment lengths for duration-based media splits. */
export const DURATION_PRESETS: DurationPreset[] = [
  { id: 'd-1', label: '1 min', sublabel: 'segment', minutes: 1 },
  { id: 'd-5', label: '5 min', sublabel: 'segment', minutes: 5 },
  { id: 'd-10', label: '10 min', sublabel: 'segment', minutes: 10 },
  { id: 'd-15', label: '15 min', sublabel: 'segment', minutes: 15 },
  { id: 'd-30', label: '30 min', sublabel: 'segment', minutes: 30 },
];

export function findDurationPreset(id: string | null | undefined): DurationPreset | undefined {
  if (!id) return undefined;
  return DURATION_PRESETS.find((p) => p.id === id);
}
