import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface HistoryJob {
  id: string;
  type: 'split' | 'merge';
  /** Original file name (split) or rebuilt file name (merge). */
  name: string;
  sizeBytes: number;
  partsCount: number;
  partSizeBytes: number | null;
  sha256: string | null;
  verified: boolean;
  /** Output folder (SAF tree uri) — used for re-run. */
  outputDirUri: string | null;
  /** Split: source file uri. */
  sourceUri: string | null;
  /** Split: whether the SHA-256 fingerprint was computed. */
  integrity: boolean;
  /** Merge: ordered part uris. */
  partUris: string[] | null;
  manifestName: string | null;
  durationMs: number;
  createdAt: number;
}

interface HistoryState {
  jobs: HistoryJob[];
  addJob: (job: HistoryJob) => void;
  removeJob: (id: string) => void;
  clearAll: () => void;
}

const MAX_JOBS = 100;

export const useHistory = create<HistoryState>()(
  persist(
    (set) => ({
      jobs: [],
      addJob: (job) => set((state) => ({ jobs: [job, ...state.jobs].slice(0, MAX_JOBS) })),
      removeJob: (id) => set((state) => ({ jobs: state.jobs.filter((j) => j.id !== id) })),
      clearAll: () => set({ jobs: [] }),
    }),
    {
      name: 'spliter.history.v1',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
