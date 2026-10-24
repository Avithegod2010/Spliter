import { NativeModule, requireOptionalNativeModule } from 'expo-modules-core';

export interface SplPartInfo {
  name: string;
  index: number;
  sizeBytes: number;
}

export interface SplSplitOptions {
  sourceUri: string;
  outputDirUri: string;
  baseName: string;
  partSizeBytes: number;
  computeSha256: boolean;
  jobId: string;
}

export interface SplSplitResult {
  parts: SplPartInfo[];
  totalSize: number;
  partSizeBytes: number;
  sha256: string | null;
  manifestName: string;
}

export interface SplMergeOptions {
  partUris: string[];
  outputDirUri: string;
  outputName: string;
  expectedSizeBytes: number;
  expectedSha256?: string | null;
  jobId: string;
}

export interface SplMergeResult {
  name: string;
  sizeBytes: number;
  sha256: string;
  verified: boolean;
}

export interface SplJobEvent {
  jobId: string;
  phase: 'running' | 'done' | 'cancelled' | 'error';
  bytesDone: number;
  bytesTotal: number;
  partIndex: number;
  partsTotal: number;
  message: string | null;
}

export interface SplFileInfo {
  sizeBytes: number;
  name: string;
}

export interface SplManifestSummary {
  originalName: string;
  originalSize: number;
  partCount: number;
  partSizeBytes: number;
  sha256: string | null;
}

export interface SplPartGroup {
  baseName: string;
  partNames: string[];
  partSizes: number[];
  partUris: string[];
  manifest: SplManifestSummary | null;
}

type SplIOEvents = { onJobEvent: (event: SplJobEvent) => void };

declare class SplIOModule extends NativeModule<SplIOEvents> {
  splitAsync(options: SplSplitOptions): Promise<SplSplitResult>;
  mergeAsync(options: SplMergeOptions): Promise<SplMergeResult>;
  cancelJob(jobId: string): Promise<boolean>;
  lastJobEvent(jobId: string): Promise<SplJobEvent | null>;
  fileInfo(uri: string): Promise<SplFileInfo>;
  freeDiskSpace(): Promise<number>;
  listSplitParts(dirUri: string): Promise<{ groups: SplPartGroup[] }>;
}

const nativeModule = requireOptionalNativeModule<SplIOModule>('spl-io');

export function isNativeIoAvailable(): boolean {
  return nativeModule != null;
}

function requireModule(): SplIOModule {
  if (!nativeModule) {
    throw new Error(
      'The Spliter native module is not available. This app needs a development-client or release build — it cannot run inside Expo Go.'
    );
  }
  return nativeModule;
}

export const splIo = {
  get module(): SplIOModule {
    return requireModule();
  },
  split(options: SplSplitOptions) {
    return requireModule().splitAsync(options);
  },
  merge(options: SplMergeOptions) {
    return requireModule().mergeAsync(options);
  },
  cancel(jobId: string) {
    return requireModule().cancelJob(jobId);
  },
  lastJobEvent(jobId: string) {
    return requireModule().lastJobEvent(jobId);
  },
  fileInfo(uri: string) {
    return requireModule().fileInfo(uri);
  },
  freeDiskSpace() {
    return requireModule().freeDiskSpace();
  },
  listSplitParts(dirUri: string) {
    return requireModule().listSplitParts(dirUri);
  },
  addJobListener(listener: (event: SplJobEvent) => void) {
    return requireModule().addListener('onJobEvent', listener);
  },
};
