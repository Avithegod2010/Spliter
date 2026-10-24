import React, { useMemo, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { Switch, StyleSheet, Text, View } from 'react-native';
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
import { splIo, type SplSplitOptions, type SplSplitResult } from '@/lib/native-io';
import { parseSizeInput, formatBytes, formatDuration } from '@/lib/format';
import { findPreset } from '@/lib/presets';
import { partSizeForCount, previewPartCount, MAX_PARTS } from '@/lib/split-math';
import { useHistory } from '@/state/history';
import { useSettings } from '@/state/settings';

interface PickedFile {
  uri: string;
  name: string;
  sizeBytes: number;
}

type SplitPlan = { ok: true; partSizeBytes: number; partsCount: number } | { ok: false; error: string };

function resolvePlan(fileSize: number, mode: SizeMode, value: string, unit: SizeUnit): SplitPlan {
  try {
    if (mode === 'size') {
      const bytes = parseSizeInput(value, unit);
      if (!bytes) return { ok: false, error: 'Enter a part size first' };
      return { ok: true, partSizeBytes: bytes, partsCount: previewPartCount(fileSize, bytes) };
    }
    const cleaned = value.trim().replace(',', '.');
    if (!/^\d+$/.test(cleaned)) return { ok: false, error: 'Enter the number of parts' };
    const count = Number.parseInt(cleaned, 10);
    if (count < 1) return { ok: false, error: 'Need at least 1 part' };
    if (count > MAX_PARTS) return { ok: false, error: `At most ${MAX_PARTS} parts` };
    return { ok: true, partSizeBytes: partSizeForCount(fileSize, count), partsCount: count };
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
  const [mode, setMode] = useState<SizeMode>('size');
  const [unit, setUnit] = useState<SizeUnit>('GB');
  const [value, setValue] = useState('2');
  const [presetId, setPresetId] = useState<string | null>(null);
  const [integrity, setIntegrity] = useState(integrityDefault);
  const [uiError, setUiError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  const engine = useJobEngine<Omit<SplSplitOptions, 'jobId'>, SplSplitResult>((args, jobId) =>
    splIo.split({ ...args, jobId })
  );

  const plan = useMemo<SplitPlan | null>(
    () => (file ? resolvePlan(file.sizeBytes, mode, value, unit) : null),
    [file, mode, value, unit]
  );
  const planError = plan && !plan.ok ? plan.error : null;
  const partsCount = plan?.ok ? plan.partsCount : null;
  const ready = !!file && !!plan?.ok;

  const pickFile = async () => {
    setUiError(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      multiple: false,
      copyToCacheDirectory: false,
    }).catch(() => null);
    if (!res || res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    let sizeBytes = asset.size ?? 0;
    if (sizeBytes <= 0) {
      try {
        sizeBytes = (await splIo.fileInfo(asset.uri)).sizeBytes;
      } catch {
        sizeBytes = 0;
      }
    }
    if (sizeBytes <= 0) {
      setUiError('That file is empty or unreadable — pick another one.');
      return;
    }
    setFile({
      uri: asset.uri,
      name: asset.name || asset.uri.split('/').pop() || 'file',
      sizeBytes,
    });
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
      const partSizeBytes = plan.partSizeBytes;
      const res = await engine.start({
        sourceUri: file.uri,
        outputDirUri: dirUri,
        baseName: file.name,
        partSizeBytes,
        computeSha256: integrity,
      });
      if (res) {
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
      }
    } finally {
      setPreparing(false);
    }
  };

  const resetAll = () => {
    engine.reset();
    setFile(null);
    setValue('2');
    setMode('size');
    setUnit('GB');
    setPresetId(null);
    setIntegrity(integrityDefault);
    setUiError(null);
  };

  const banner = uiError ?? (engine.phase === 'cancelled' ? 'Split cancelled — partial parts were removed.' : engine.error);

  let body: React.ReactNode;
  if (engine.phase === 'running') {
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
            {plan?.ok && (
              <Text style={[styles.preview, { color: accent.accentSoft }]}>
                {plan.partsCount === 1
                  ? 'Whole file fits in one part'
                  : `${plan.partsCount} parts · about ${formatBytes(plan.partSizeBytes)} each`}
              </Text>
            )}
            {planError && <Text style={[styles.error, { color: colors.danger }]}>{planError}</Text>}
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
          </View>
        </GlassCard>
        <AppButton
          label={partsCount ? `Split into ${partsCount} part${partsCount > 1 ? 's' : ''}` : 'Split file'}
          icon="cut"
          onPress={startSplit}
          disabled={!ready}
          loading={preparing}
        />
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
