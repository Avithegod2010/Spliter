import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemeMode = 'auto' | 'dark' | 'light';
export type MotionLevel = 'full' | 'reduced' | 'off';

interface SettingsState {
  themeMode: ThemeMode;
  accentId: string;
  glassLevel: 0 | 1 | 2;
  motion: MotionLevel;
  integrityDefault: boolean;
  lastOutputDirUri: string | null;
  setThemeMode: (mode: ThemeMode) => void;
  setAccentId: (id: string) => void;
  setGlassLevel: (level: 0 | 1 | 2) => void;
  setMotion: (level: MotionLevel) => void;
  setIntegrityDefault: (value: boolean) => void;
  setLastOutputDirUri: (uri: string | null) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: 'dark',
      accentId: 'violet',
      glassLevel: 2,
      motion: 'full',
      integrityDefault: true,
      lastOutputDirUri: null,
      setThemeMode: (themeMode) => set({ themeMode }),
      setAccentId: (accentId) => set({ accentId }),
      setGlassLevel: (glassLevel) => set({ glassLevel }),
      setMotion: (motion) => set({ motion }),
      setIntegrityDefault: (integrityDefault) => set({ integrityDefault }),
      setLastOutputDirUri: (lastOutputDirUri) => set({ lastOutputDirUri }),
    }),
    {
      name: 'spliter.settings.v1',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
