import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSettings } from '@/state/settings';
import { DARK, LIGHT, PALETTES, type ColorSet, type Palette } from './tokens';

export type ResolvedMotion = 'full' | 'reduced' | 'off';

interface ThemeValue {
  colors: ColorSet;
  isDark: boolean;
  accent: Palette;
  glassLevel: 0 | 1 | 2;
  /** Effective motion: user setting capped by OS reduce-motion. */
  motion: ResolvedMotion;
  /** Whether entrance/ambient animations may run at all. */
  animate: boolean;
  /** Whether big celebratory effects may run. */
  celebrate: boolean;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const osReduceMotion = useReducedMotion();
  const themeMode = useSettings((s) => s.themeMode);
  const accentId = useSettings((s) => s.accentId);
  const glassLevel = useSettings((s) => s.glassLevel);
  const motionSetting = useSettings((s) => s.motion);

  const value = useMemo<ThemeValue>(() => {
    const isDark = themeMode === 'auto' ? systemScheme !== 'light' : themeMode === 'dark';
    const colors = isDark ? DARK : LIGHT;
    const accent = PALETTES.find((p) => p.id === accentId) ?? PALETTES[0];
    // OS reduce-motion caps the level: 'off' stays off, anything else drops to 'reduced'.
    const motion: ResolvedMotion = osReduceMotion
      ? motionSetting === 'off' ? 'off' : 'reduced'
      : motionSetting;
    return {
      colors,
      isDark,
      accent,
      glassLevel,
      motion,
      animate: motion !== 'off',
      celebrate: motion === 'full',
    };
  }, [themeMode, systemScheme, osReduceMotion, accentId, glassLevel, motionSetting]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}

export { PALETTES };
