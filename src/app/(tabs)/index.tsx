import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { Linking, Switch, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { GlassCard } from '@/components/GlassCard';
import { AppButton } from '@/components/AppButton';
import { FileCard } from '@/components/FileCard';
import { PresetChips } from '@/components/PresetChips';
import { SizeField, type SizeMode, type SizeUnit } from '@/components/SizeField';
import { ProgressRing } from '@/components/ProgressRing';
import { SuccessBurst } from '@/components/SuccessBurst';
import { CopyCommandCard } from '@/components/CopyCommandCard';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { useJobEngine } from '@/lib/job-engine';
import {
  splIo,
  type SplMediaSplitOptions,
  type SplResumeOptions,
  type SplSplitOptions,
  type SplSplitResult,
} from '@/lib/native-io';
import { parseSizeInput, formatBytes, formatDuration } from '@/lib/format';
import { DURATION_PRESETS, findDurationPreset, findPreset } from '@/lib/presets';
import {
  computeResumePoint,
  MINUTES_MS,
  partSizeForCount,
  previewPartCount,
  previewPartCountByDuration,
  validateDurationMs,
  MAX_PARTS,
} from '@/lib/split-math';
import { useHistory } from '@/state/history';
import { useSettings } from '@/state/settings';

interface PickedFile {
  uri: string;
  name: string;
  sizeBytes: number;
}

type SplitEngineArgs =
  | Omit<SplSplitOptions, 'jobId'>
  | Omit<SplResumeOptions, 'jobId'>
  | Omit<SplMediaSplitOptions, 'jobId'>;

/** A split that ended in cancel/error — its parts stay on disk, ready to resume. */
interface FailedSplit {
  sourceUri: string;
  outputDirUri: string;
  baseName: string;
  partSizeBytes: number;
  computeSha256: boolean;
  bytesDone: number;
  bytesTotal: number;
}

type SplitPlan =
  | { ok: true; kind: 'bytes'; partSizeBytes: number; partsCount: number }
  | { ok: true; kind: 'duration'; durationMs: number; partsCount: number }
  | { ok: false; error: string };

function resolvePlan(
  fileSize: number,
  mode: SizeMode,
  value: string,
  unit: SizeUnit,
  mediaDurationMs?: number | null
): SplitPlan {
  try {
    if (mode === 'duration') {
      if (mediaDurationMs == null) return { ok: false, error: 'Reading the media length…' };
      if (mediaDurationMs <= 0) {
        return { ok: false, error: 'Could not read the media length — pick an MP4, MOV, WebM or 3GP video.' };
      }
      const cleaned = value.trim().replace(',', '.');
      if (!/^\d+(\.\d+)?$/.test(cleaned)) return { ok: false, error: 'Enter the segment length in minutes' };
      const minutes = Number.parseFloat(cleaned);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        return { ok: false, error: 'Enter the segment length in minutes' };
      }
      const durationMs = Math.round(minutes * MINUTES_MS);
      validateDurationMs(durationMs);
      return {
        ok: true,
        kind: 'duration',
        durationMs,
        partsCount: previewPartCountByDuration(mediaDurationMs, durationMs),
      };
    }
    if (mode === 'size') {
      const bytes = parseSizeInput(value, unit);
      if (!bytes) return { ok: false, error: 'Enter a part size first' };
      return { ok: true, kind: 'bytes', partSizeBytes: bytes, partsCount: previewPartCount(fileSize, bytes) };
    }
    const cleaned = value.trim().replace(',', '.');
    if (!/^\d+$/.test(cleaned)) return { ok: false, error: 'Enter the number of parts' };
    const count = Number.parseInt(cleaned, 10);
    if (count < 1) return { ok: false, error: 'Need at least 1 part' };
    if (count > MAX_PARTS) return { ok: false, error: `At most ${MAX_PARTS} parts` };
    return { ok: true, kind: 'bytes', partSizeBytes: partSizeForCount(fileSize, count), partsCount: count };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid split settings' };
  }
}

async function pickDirectory(): Promise<string | null> {
  const res = await StorageAccessFramework.requestDirectoryPermissionsAsync().catch(() => null);
  if (!res || !res.granted) return null;
  return res.directoryUri;
}

export default function SplitScreen() {
  const { colors, accent } = useTheme();
  const addJob = useHistory((s) => s.addJob);
  const integrityDefault = useSettings((s) => s.integrityDefault);
  const setLastOutputDirUri = useSettings((s) => s.setLastOutputDirUri);

  const [file, setFile] = useState<PickedFile | null>(null);
  const [queue, setQueue] = useState<PickedFile[] | null>(null);
  const [batch, setBatch] = useState<{ files: PickedFile[]; index: number } | null>(null);
  const [mode, setMode] = useState<SizeMode>('size');
  const [unit, setUnit] = useState<SizeUnit>('GB');
  const [value, setValue] = useState('2');
  const [presetId, setPresetId] = useState<string | null>(null);
  const [integrity, setIntegrity] = useState(integrityDefault);
  const [uiError, setUiError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [failedSplit, setFailedSplit] = useState<FailedSplit | null>(null);
  const [mediaDuration, setMediaDuration] = useState<{ uri: string; ms: number } | null>(null);

  const engine = useJobEngine<SplitEngineArgs, SplSplitResult>((args, jobId) => {
    if ('resumeFromPartIndex' in args) return splIo.resume({ ...args, jobId });
    if ('durationMs' in args) return splIo.splitMedia({ ...args, jobId });
    return splIo.split({ ...args, jobId });
  });

  // Duration mode needs the media timeline up front for the segment preview.
  useEffect(() => {
    if (!file || mode !== 'duration') return;
    let active = true;
    const uri = file.uri;
    splIo
      .mediaDuration(uri)
      .then((ms) => {
        if (active) setMediaDuration({ uri, ms: ms > 0 ? ms : -1 });
      })
      .catch(() => {
        if (active) setMediaDuration({ uri, ms: -1 });
      });
    return () => {
      active = false;
    };
  }, [file, mode]);

  // Null while loading a new file's timeline; -1 when it is not readable as media.
  const mediaDurationMs = file && mediaDuration?.uri === file.uri ? mediaDuration.ms : null;

  // Handle files sent from other apps (ACTION_VIEW / ACTION_SEND with a content:// URI).
  const acceptIncomingUri = useCallback(async (url: string | null | undefined) => {
    if (!url || !url.startsWith('content://')) return;
    try {
      const info = await splIo.fileInfo(url);
      if (info.sizeBytes <= 0) return;
      setQueue(null);
      setBatch(null);
      setUiError(null);
      setFailedSplit(null);
      setFile({ uri: url, name: info.name, sizeBytes: info.sizeBytes });
    } catch {
      // Unreadable intent payload — ignore; the user can pick a file manually.
    }
  }, []);

  useEffect(() => {
    Linking.getInitialURL().then(acceptIncomingUri);
    const sub = Linking.addEventListener('url', (e) => acceptIncomingUri(e.url));
    return () => sub.remove();
  }, [acceptIncomingUri]);

  const plan = useMemo<SplitPlan | null>(
    () => (file ? resolvePlan(file.sizeBytes, mode, value, unit, mediaDurationMs) : null),
    [file, mode, value, unit, mediaDurationMs]
  );
  const planError = plan && !plan.ok ? plan.error : null;
  const partsCount = plan?.ok ? plan.partsCount : null;
  const ready = !!file && !!plan?.ok;

  const pickFile = async () => {
    setUiError(null);
    setFailedSplit(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      multiple: true,
      copyToCacheDirectory: false,
    }).catch(() => null);
    if (!res || res.canceled || !res.assets?.length) return;
    const checked: PickedFile[] = [];
    for (const asset of res.assets) {
      let sizeBytes = asset.size ?? 0;
      if (sizeBytes <= 0) {
        try {
          sizeBytes = (await splIo.fileInfo(asset.uri)).sizeBytes;
        } catch {
          sizeBytes = 0;
        }
      }
      if (sizeBytes <= 0) continue;
      checked.push({
        uri: asset.uri,
        name: asset.name || asset.uri.split('/').pop() || 'file',
        sizeBytes,
      });
    }
    if (!checked.length) {
      setUiError('Those files are empty or unreadable — pick other ones.');
      return;
    }
    if (checked.length === 1) {
      setQueue(null);
      setFile(checked[0]);
    } else {
      setFile(null);
      setQueue(checked);
    }
  };

  const startBatch = async () => {
    if (!queue?.length) return;
    setUiError(null);
    setPreparing(true);
    try {
      const free = await splIo.freeDiskSpace().catch(() => -1);
      const needed = queue.reduce((a, f) => a + f.sizeBytes, 0);
      if (free >= 0 && free < needed + 1024 * 1024) {
        setUiError(
          `Not enough free space — this batch needs about ${formatBytes(needed)}, only ${formatBytes(free)} available.`
        );
        return;
      }
      const dirUri = await pickDirectory();
      if (!dirUri) return;
      setLastOutputDirUri(dirUri);
      setBatch({ files: queue, index: 0 });
      const files = queue;
      setQueue(null);
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setBatch({ files, index: i });
        const fileDurationMs = mode === 'duration' ? await splIo.mediaDuration(f.uri).catch(() => -1) : null;
        const batchPlan = resolvePlan(f.sizeBytes, mode, value, unit, fileDurationMs);
        if (!batchPlan.ok) {
          setUiError(`${f.name}: ${batchPlan.error}`);
          setBatch(null);
          return;
        }
        const res = await engine.start(
          batchPlan.kind === 'duration'
            ? {
                sourceUri: f.uri,
                outputDirUri: dirUri,
                baseName: f.name,
                durationMs: batchPlan.durationMs,
              }
            : {
                sourceUri: f.uri,
                outputDirUri: dirUri,
                baseName: f.name,
                partSizeBytes: batchPlan.partSizeBytes,
                computeSha256: integrity,
              }
        );
        if (!res) {
          if (batchPlan.kind === 'bytes') {
            setFailedSplit({
              sourceUri: f.uri,
              outputDirUri: dirUri,
              baseName: f.name,
              partSizeBytes: batchPlan.partSizeBytes,
              computeSha256: integrity,
              bytesDone: engine.progressRef.current.bytesDone,
              bytesTotal: engine.progressRef.current.bytesTotal || f.sizeBytes,
            });
          } else {
            setFailedSplit(null);
          }
          setBatch(null);
          return;
        }
        setFailedSplit(null);
        addJob({
          id: `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          type: 'split',
          name: f.name,
          sizeBytes: res.totalSize,
          partsCount: res.parts.length,
          partSizeBytes: batchPlan.kind === 'bytes' ? batchPlan.partSizeBytes : null,
          sha256: res.sha256,
          verified: !!res.sha256,
          outputDirUri: dirUri,
          sourceUri: f.uri,
          integrity: batchPlan.kind === 'bytes' ? integrity : false,
          partUris: null,
          manifestName: res.manifestName,
          durationMs: engine.durationMs.current,
          createdAt: Date.now(),
        });
      }
      setBatch(null);
    } finally {
      setPreparing(false);
    }
  };

  const startSplit = async () => {
    if (!file || !plan?.ok) return;
    setUiError(null);
    setPreparing(true);
    try {
      const free = await splIo.freeDiskSpace().catch(() => -1);
      if (free >= 0 && free < file.sizeBytes + 1024 * 1024) {
        setUiError(
          `Not enough free space — this split needs about ${formatBytes(file.sizeBytes)}, only ${formatBytes(free)} available.`
        );
        return;
      }
      const dirUri = await pickDirectory();
      if (!dirUri) return;
      setLastOutputDirUri(dirUri);
      if (plan.kind === 'duration') {
        const mediaRes = await engine.start({
          sourceUri: file.uri,
          outputDirUri: dirUri,
          baseName: file.name,
          durationMs: plan.durationMs,
        });
        if (mediaRes) {
          setFailedSplit(null);
          addJob({
            id: `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            type: 'split',
            name: file.name,
            sizeBytes: mediaRes.totalSize,
            partsCount: mediaRes.parts.length,
            partSizeBytes: null,
            sha256: mediaRes.sha256,
            verified: false,
            outputDirUri: dirUri,
            sourceUri: file.uri,
            integrity: false,
            partUris: null,
            manifestName: mediaRes.manifestName,
            durationMs: engine.durationMs.current,
            createdAt: Date.now(),
          });
        } else {
          // Media segments cannot be resumed — no resume checkpoint.
          setFailedSplit(null);
        }
        return;
      }
      const partSizeBytes = plan.partSizeBytes;
      const res = await engine.start({
        sourceUri: file.uri,
        outputDirUri: dirUri,
        baseName: file.name,
        partSizeBytes,
        computeSha256: integrity,
      });
      if (res) {
        setFailedSplit(null);
        addJob({
          id: `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          type: 'split',
          name: file.name,
          sizeBytes: res.totalSize,
          partsCount: res.parts.length,
          partSizeBytes,
          sha256: res.sha256,
          verified: !!res.sha256,
          outputDirUri: dirUri,
          sourceUri: file.uri,
          integrity,
          partUris: null,
          manifestName: res.manifestName,
          durationMs: engine.durationMs.current,
          createdAt: Date.now(),
        });
      } else {
        setFailedSplit({
          sourceUri: file.uri,
          outputDirUri: dirUri,
          baseName: file.name,
          partSizeBytes,
          computeSha256: integrity,
          bytesDone: engine.progressRef.current.bytesDone,
          bytesTotal: engine.progressRef.current.bytesTotal || file.sizeBytes,
        });
      }
    } finally {
      setPreparing(false);
    }
  };

  const resumeSplit = async () => {
    const failed = failedSplit;
    if (!failed) return;
    setUiError(null);
    setPreparing(true);
    try {
      const point = computeResumePoint(failed.bytesDone, failed.partSizeBytes);
      const remaining = Math.max(failed.bytesTotal - failed.bytesDone, 0);
      const free = await splIo.freeDiskSpace().catch(() => -1);
      if (free >= 0 && free < remaining + 1024 * 1024) {
        setUiError(
          `Not enough free space — about ${formatBytes(remaining)} still to write, only ${formatBytes(free)} available.`
        );
        return;
      }
      if (!file) {
        // Batch remnant: restore the file card so the success view can render.
        setFile({ uri: failed.sourceUri, name: failed.baseName, sizeBytes: failed.bytesTotal });
      }
      const res = await engine.resume({
        sourceUri: failed.sourceUri,
        outputDirUri: failed.outputDirUri,
        baseName: failed.baseName,
        partSizeBytes: failed.partSizeBytes,
        computeSha256: failed.computeSha256,
        resumeFromPartIndex: point.partIndex,
        resumeFromByteOffset: point.byteOffset,
      });
      if (res) {
        setFailedSplit(null);
        addJob({
          id: `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          type: 'split',
          name: failed.baseName,
          sizeBytes: res.totalSize,
          partsCount: res.parts.length,
          partSizeBytes: failed.partSizeBytes,
          sha256: res.sha256,
          verified: !!res.sha256,
          outputDirUri: failed.outputDirUri,
          sourceUri: failed.sourceUri,
          integrity: failed.computeSha256,
          partUris: null,
          manifestName: res.manifestName,
          durationMs: engine.durationMs.current,
          createdAt: Date.now(),
        });
      } else {
        // Still stuck — remember the newer progress for the next resume attempt.
        setFailedSplit({
          ...failed,
          bytesDone: engine.progressRef.current.bytesDone,
          bytesTotal: engine.progressRef.current.bytesTotal || failed.bytesTotal,
        });
      }
    } finally {
      setPreparing(false);
    }
  };

  const resetAll = () => {
    engine.reset();
    setFile(null);
    setQueue(null);
    setBatch(null);
    setValue('2');
    setMode('size');
    setUnit('GB');
    setPresetId(null);
    setIntegrity(integrityDefault);
    setUiError(null);
    setFailedSplit(null);
  };

  const banner =
    uiError ??
    (engine.phase === 'cancelled'
      ? failedSplit
        ? 'Split cancelled — completed parts were kept. You can resume.'
        : 'Split cancelled — partial segments were removed.'
      : engine.error);

  const resumePoint = failedSplit ? computeResumePoint(failedSplit.bytesDone, failedSplit.partSizeBytes) : null;
  const showResume = !!failedSplit && (engine.phase === 'cancelled' || engine.phase === 'error');
  const resumeButton = showResume && resumePoint ? (
    <AppButton
      label={`Resume split from part ${resumePoint.partIndex}`}
      icon="play-circle-outline"
      onPress={resumeSplit}
      loading={preparing}
    />
  ) : null;

  let body: React.ReactNode;
  if (batch) {
    const cur = batch.files[batch.index];
    body = (
      <View style={styles.centerCol}>
        <ProgressRing
          progress={engine.progress.bytesTotal ? engine.progress.bytesDone / engine.progress.bytesTotal : 0}
          label={`File ${batch.index + 1} of ${batch.files.length}`}
          bytesDone={engine.progress.bytesDone}
          bytesTotal={engine.progress.bytesTotal}
        />
        <Text style={[styles.runningFile, { color: colors.text }]} numberOfLines={1}>
          {cur.name}
        </Text>
        {engine.phase === 'done' && <Text style={[styles.batchSaved, { color: colors.success }]}>Saved ✓ — next file…</Text>}
        <AppButton label="Cancel current file" variant="ghost" icon="close-circle-outline" onPress={engine.cancel} />
      </View>
    );
  } else if (engine.phase === 'running' || engine.phase === 'resumed') {
    body = (
      <View style={styles.centerCol}>
        <ProgressRing
          progress={engine.progress.bytesTotal ? engine.progress.bytesDone / engine.progress.bytesTotal : 0}
          label={`Part ${engine.progress.partIndex} of ${engine.progress.partsTotal}`}
          bytesDone={engine.progress.bytesDone}
          bytesTotal={engine.progress.bytesTotal}
        />
        <Text style={[styles.runningFile, { color: colors.textDim }]} numberOfLines={1}>
          {file?.name}
        </Text>
        <AppButton label="Cancel split" variant="ghost" icon="close-circle-outline" onPress={engine.cancel} />
      </View>
    );
  } else if (engine.phase === 'done' && engine.result && file) {
    const res = engine.result;
    body = (
      <View style={styles.stack}>
        <View style={styles.burstWrap}>
          <SuccessBurst />
        </View>
        <Text style={[styles.doneTitle, { color: colors.text }]}>Split complete</Text>
        <GlassCard>
          <View style={styles.summaryRows}>
            <Text style={[styles.summaryLabel, { color: colors.textDim }]}>Parts written</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{res.parts.length}</Text>
            {res.parts.length > 1 && (
              <>
                <Text style={[styles.summaryLabel, { color: colors.textDim }]}>Part size</Text>
                <Text style={[styles.summaryValue, { color: colors.text }]}>
                  {formatBytes(res.partSizeBytes)} · last part {formatBytes(res.parts[res.parts.length - 1].sizeBytes)}
                </Text>
              </>
            )}
            <Text style={[styles.summaryLabel, { color: colors.textDim }]}>Duration</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{formatDuration(engine.durationMs.current)}</Text>
            {res.sha256 && (
              <>
                <Text style={[styles.summaryLabel, { color: colors.textDim }]}>SHA-256 fingerprint</Text>
                <Text style={[styles.summarySha, { color: accent.accentSoft }]} selectable>
                  {res.sha256}
                </Text>
              </>
            )}
          </View>
        </GlassCard>
        <CopyCommandCard partNames={res.parts.map((p) => p.name)} outputName={file.name} />
        <AppButton label="Split another file" icon="add-circle-outline" onPress={resetAll} />
      </View>
    );
  } else if (queue) {
    const totalBytes = queue.reduce((a, f) => a + f.sizeBytes, 0);
    body = (
      <View style={styles.stack}>
        <Text style={[styles.batchTitle, { color: colors.text }]}>
          {queue.length} files · {formatBytes(totalBytes)}
        </Text>
        {queue.map((f) => (
          <FileCard key={f.uri} name={f.name} sizeBytes={f.sizeBytes} compact />
        ))}
        <AppButton
          label={`Split all ${queue.length} files`}
          icon="layers"
          onPress={startBatch}
          loading={preparing}
        />
        <AppButton label="Clear list" variant="ghost" onPress={() => setQueue(null)} />
        {resumeButton}
        {banner && <Text style={[styles.error, { color: colors.danger, textAlign: 'center' }]}>{banner}</Text>}
      </View>
    );
  } else {
    body = file ? (
      <View style={styles.stack}>
        <FileCard name={file.name} sizeBytes={file.sizeBytes} />
        <GlassCard>
          <View style={styles.configStack}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Output parts</Text>
            <SizeField
              mode={mode}
              onModeChange={(m) => {
                setMode(m);
                setPresetId(null);
              }}
              unit={unit}
              onUnitChange={setUnit}
              value={value}
              onValueChange={(v) => {
                setValue(v);
                setPresetId(null);
              }}
            />
            {mode === 'duration' ? (
              <PresetChips
                presets={DURATION_PRESETS}
                selectedId={presetId}
                onSelect={(id) => {
                  const preset = findDurationPreset(id);
                  if (!preset) return;
                  setValue(String(preset.minutes));
                  setPresetId(id);
                }}
              />
            ) : (
              <PresetChips
                selectedId={presetId}
                onSelect={(id) => {
                  const preset = findPreset(id);
                  if (!preset) return;
                  setMode('size');
                  setUnit('MB');
                  setValue(String(Math.round(preset.bytes / (1024 * 1024))));
                  setPresetId(id);
                }}
              />
            )}
            {plan?.ok && (
              <Text style={[styles.preview, { color: accent.accentSoft }]}>
                {plan.kind === 'duration'
                  ? plan.partsCount === 1
                    ? 'Whole video fits in one segment'
                    : `${plan.partsCount} segments of ~${plan.durationMs / MINUTES_MS} min`
                  : plan.partsCount === 1
                    ? 'Whole file fits in one part'
                    : `${plan.partsCount} parts · about ${formatBytes(plan.partSizeBytes)} each`}
              </Text>
            )}
            {planError && <Text style={[styles.error, { color: colors.danger }]}>{planError}</Text>}
            {mode !== 'duration' && (
              <View style={[styles.toggleRow, { borderColor: colors.surfaceBorder }]}>
                <View style={styles.toggleText}>
                  <Text style={[styles.toggleTitle, { color: colors.text }]}>SHA-256 fingerprint</Text>
                  <Text style={[styles.toggleSub, { color: colors.textDim }]}>
                    Verify integrity when rejoining — adds a moment at the end
                  </Text>
                </View>
                <Switch
                  value={integrity}
                  onValueChange={setIntegrity}
                  trackColor={{ false: colors.surfaceBorder, true: accent.accent }}
                  thumbColor="#FFFFFF"
                />
              </View>
            )}
          </View>
        </GlassCard>
        <AppButton
          label={
            partsCount
              ? mode === 'duration'
                ? `Split into ${partsCount} segment${partsCount > 1 ? 's' : ''}`
                : `Split into ${partsCount} part${partsCount > 1 ? 's' : ''}`
              : 'Split file'
          }
          icon="cut"
          onPress={startSplit}
          disabled={!ready}
          loading={preparing}
        />
        {resumeButton}
        <AppButton label="Choose a different file" variant="ghost" onPress={pickFile} />
        {banner && <Text style={[styles.error, { color: colors.danger, textAlign: 'center' }]}>{banner}</Text>}
      </View>
    ) : (
      <View style={styles.stack}>
        <GlassCard>
          <View style={styles.heroStack}>
            <Text style={[styles.heroLine, { color: colors.text }]}>Split any file into byte-perfect parts</Text>
            <Text style={[styles.heroSub, { color: colors.textDim }]}>
              Videos, archives, APKs — anything. Parts rejoin in-app or on any PC, no software needed.
            </Text>
          </View>
        </GlassCard>
        <AppButton label="Choose a file" icon="document-attach" onPress={pickFile} />
        {resumeButton}
        {banner && <Text style={[styles.error, { color: colors.danger, textAlign: 'center' }]}>{banner}</Text>}
      </View>
    );
  }

  return (
    <Screen title="Split" subtitle="Any file · any size" entranceKey={engine.phase === 'idle' ? 'idle' : engine.phase}>
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.lg,
  },
  configStack: {
    gap: spacing.md,
  },
  heroStack: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  heroLine: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  heroSub: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  preview: {
    fontSize: 13,
    fontWeight: '600',
  },
  error: {
    fontSize: 13,
    lineHeight: 18,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: 1,
    paddingTop: spacing.md,
  },
  toggleText: {
    flex: 1,
    gap: 2,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  toggleSub: {
    fontSize: 12,
    lineHeight: 16,
  },
  centerCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingBottom: 80,
  },
  runningFile: {
    fontSize: 13,
  },
  batchSaved: {
    fontSize: 13,
    fontWeight: '700',
  },
  batchTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  burstWrap: {
    alignItems: 'center',
  },
  doneTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  summaryRows: {
    gap: spacing.xs + 2,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  summarySha: {
    fontSize: 11.5,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
});
