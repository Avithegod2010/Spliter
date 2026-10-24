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
