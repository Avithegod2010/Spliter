export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  pill: 999,
} as const;

export interface Palette {
  id: string;
  name: string;
  accent: string;
  accentSoft: string;
  glow: string;
}

/** Curated accents for the Theme Studio. */
export const PALETTES: Palette[] = [
  { id: 'violet', name: 'Ultraviolet', accent: '#8B5CF6', accentSoft: '#A78BFA', glow: 'rgba(139, 92, 246, 0.35)' },
  { id: 'cyan', name: 'Ionwave', accent: '#22D3EE', accentSoft: '#67E8F9', glow: 'rgba(34, 211, 238, 0.32)' },
  { id: 'mint', name: 'Mint Split', accent: '#34D399', accentSoft: '#6EE7B7', glow: 'rgba(52, 211, 153, 0.30)' },
  { id: 'amber', name: 'Turbo', accent: '#F59E0B', accentSoft: '#FCD34D', glow: 'rgba(245, 158, 11, 0.30)' },
  { id: 'rose', name: 'Neon Rose', accent: '#FB7185', accentSoft: '#FDA4AF', glow: 'rgba(251, 113, 133, 0.30)' },
  { id: 'blue', name: 'Deep Signal', accent: '#60A5FA', accentSoft: '#93C5FD', glow: 'rgba(96, 165, 250, 0.30)' },
];

export interface ColorSet {
  background: string;
  backgroundAlt: string;
  surface: string;
  surfaceBorder: string;
  glassTint: string;
  text: string;
  textDim: string;
  textFaint: string;
  danger: string;
  success: string;
  warning: string;
}

export const DARK: ColorSet = {
  background: '#0A0A10',
  backgroundAlt: '#101018',
  surface: 'rgba(255, 255, 255, 0.05)',
  surfaceBorder: 'rgba(255, 255, 255, 0.09)',
  glassTint: 'rgba(20, 20, 32, 0.72)',
  text: '#F4F4F8',
  textDim: '#A8A8BC',
  textFaint: '#62627A',
  danger: '#F87171',
  success: '#4ADE80',
  warning: '#FBBF24',
};

export const LIGHT: ColorSet = {
  background: '#F4F4F9',
  backgroundAlt: '#FFFFFF',
  surface: 'rgba(16, 16, 30, 0.04)',
  surfaceBorder: 'rgba(16, 16, 30, 0.08)',
  glassTint: 'rgba(255, 255, 255, 0.78)',
  text: '#16161F',
  textDim: '#55556A',
  textFaint: '#9A9AB0',
  danger: '#DC2626',
  success: '#16A34A',
  warning: '#D97706',
};

export const type = {
  display: { fontSize: 30, fontWeight: '700' as const, letterSpacing: -0.8 },
  title: { fontSize: 21, fontWeight: '700' as const, letterSpacing: -0.4 },
  body: { fontSize: 15, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '600' as const },
  small: { fontSize: 12, fontWeight: '500' as const },
  mono: { fontFamily: 'monospace' },
};

export const spring = {
  gentle: { damping: 18, stiffness: 160, mass: 0.9 },
  snappy: { damping: 22, stiffness: 320, mass: 0.8 },
  bouncy: { damping: 12, stiffness: 200, mass: 0.9 },
} as const;
