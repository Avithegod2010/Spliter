import React, { useCallback, useState } from 'react';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { GlassCard } from '@/components/GlassCard';
import { AppButton } from '@/components/AppButton';
import { FileCard } from '@/components/FileCard';
import { ProgressRing } from '@/components/ProgressRing';
import { SuccessBurst } from '@/components/SuccessBurst';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { useJobEngine } from '@/lib/job-engine';
import { splIo, type SplMergeOptions, type SplMergeResult, type SplPartGroup } from '@/lib/native-io';
import { formatBytes, formatDuration } from '@/lib/format';
import { validatePartSequence } from '@/lib/split-math';
import { useHistory } from '@/state/history';
import { useSettings } from '@/state/settings';

interface MergeCandidate {
  dirUri: string;
  dirName: string;
  group: SplPartGroup;
}

interface RejoinState {
  candidate: MergeCandidate;
  validate: boolean;
}

function dirNameOf(uri: string): string {
  const decoded = decodeURIComponent(uri);
  const tail = decoded.split('/').pop() ?? uri;
  return tail.split(':').pop() || 'selected folder';
}

export default function MergeScreen() {
  const { colors } = useTheme();
  const addJob = useHistory((s) => s.addJob);
  const lastOutputDirUri = useSettings((s) => s.lastOutputDirUri);

  const [candidate, setCandidate] = useState<MergeCandidate | null>(null);
  const [scanning, setScanning] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [duration, setDuration] = useState(0);

  const engine = useJobEngine<Omit<SplMergeOptions, 'jobId'>, SplMergeResult>((args, jobId) =>
    splIo.merge({ ...args, jobId })
  );

  const scanFolder = useCallback(async () => {
    setUiError(null);
    setScanning(true);
    try {
      const res = await StorageAccessFramework.requestDirectoryPermissionsAsync().catch(() => null);
      const dirUri = res?.granted ? res.directoryUri : null;
      if (!dirUri) return;
      const { groups } = await splIo.listSplitParts(dirUri);
      if (!groups.length) {
        setUiError('No split parts in that folder — pick the folder that holds name.ext.001 style files.');
        return;
      }
      if (groups.length > 1) {
        setCandidate({ dirUri, dirName: dirNameOf(dirUri), group: groups[0] });
        setUiError(
          `${groups.length} different splits found — starting with "${groups[0].baseName}". Re-run again for the others.`
        );
        return;
      }
      setCandidate({ dirUri, dirName: dirNameOf(dirUri), group: groups[0] });
    } catch (e) {
      setUiError(e instanceof Error ? e.message : 'Could not read that folder');
    } finally {
      setScanning(false);
    }
  }, []);

  const startMerge = async (state: RejoinState) => {
    const { candidate: cand, validate } = state;
    setUiError(null);
    setPreparing(true);
    try {
      const sizes = await Promise.all(cand.group.partUris.map((uri) => splIo.fileInfo(uri).then((f) => f.sizeBytes)));
      const mismatch = validatePartSequence(sizes, cand.group.manifest?.originalSize ?? 0, cand.group.manifest?.partSizeBytes ?? 0);
      if (mismatch) {
        setUiError(mismatch);
        return;
      }
      const free = await splIo.freeDiskSpace().catch(() => -1);
      const total = cand.group.manifest?.originalSize ?? sizes.reduce((a, b) => a + b, 0);
      if (free >= 0 && free < total + 1024 * 1024) {
        setUiError(
          `Not enough free space — the rebuilt file needs about ${formatBytes(total)}, only ${formatBytes(free)} available.`
        );
        return;
      }
      const manifest = cand.group.manifest;
      const outputName = manifest?.originalName || cand.group.baseName;
      const res = await engine.start({
        partUris: cand.group.partUris,
        outputDirUri: cand.dirUri,
        outputName,
        expectedSizeBytes: manifest?.originalSize ?? -1,
        expectedSha256: validate ? manifest?.sha256 ?? null : null,
      });
      if (res) {
        setDuration(engine.durationMs.current);
        addJob({
          id: `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          type: 'merge',
          name: res.name,
          sizeBytes: res.sizeBytes,
          partsCount: cand.group.partUris.length,
          partSizeBytes: manifest?.partSizeBytes ?? null,
          sha256: res.sha256,
          verified: res.verified,
          outputDirUri: cand.dirUri,
          sourceUri: null,
          integrity: validate,
          partUris: cand.group.partUris,
          manifestName: manifest ? `${cand.group.baseName}.spliter.json` : null,
          durationMs: engine.durationMs.current,
          createdAt: Date.now(),
        });
      }
    } catch (e) {
      setUiError(e instanceof Error ? e.message : 'Rejoin failed');
    } finally {
      setPreparing(false);
    }
  };

  const resetAll = () => {
    engine.reset();
    setCandidate(null);
    setUiError(null);
    setDuration(0);
  };

  const banner = uiError ?? (engine.phase === 'cancelled' ? 'Rejoin cancelled — the partial output was removed.' : engine.error);

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
          {candidate?.group.baseName}
        </Text>
        <AppButton label="Cancel rejoin" variant="ghost" icon="close-circle-outline" onPress={engine.cancel} />
      </View>
    );
  } else if (engine.phase === 'done' && engine.result && candidate) {
    const res = engine.result;
    body = (
      <View style={styles.stack}>
        <View style={styles.burstWrap}>
          <SuccessBurst />
        </View>
        <Text style={[styles.doneTitle, { color: colors.text }]}>Rebuilt successfully</Text>
        <FileCard name={res.name} sizeBytes={res.sizeBytes} />
        <GlassCard>
          <View style={styles.verifyRow}>
            <VerifiedBadge verified={res.verified} showUnverified />
            <Text style={[styles.verifyNote, { color: colors.textDim }]}>
              {res.verified
                ? 'SHA-256 fingerprint matches the original — byte-for-byte identical.'
                : 'Size matches the manifest. Pick a folder scan with a manifest to verify by fingerprint.'}
            </Text>
          </View>
          <Text style={[styles.metaLine, { color: colors.textDim }]}>
            {candidate.group.partUris.length} parts · {formatDuration(duration)}
          </Text>
        </GlassCard>
        <AppButton label="Rejoin another split" icon="repeat" onPress={resetAll} />
      </View>
    );
  } else if (candidate) {
    const g = candidate.group;
    const manifest = g.manifest;
    const expectedTotal = manifest?.originalSize ?? g.partSizes.reduce((a, b) => a + b, 0);
    const shaKnown = !!manifest?.sha256;
    body = (
      <View style={styles.stack}>
        <FileCard name={manifest?.originalName || g.baseName} sizeBytes={expectedTotal} />
        <GlassCard>
          <View style={styles.configStack}>
            <View style={styles.titleRow}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {g.partUris.length} parts in {candidate.dirName}
              </Text>
            </View>
            <Text style={[styles.partsLine, { color: colors.textDim }]}>
              {g.partNames
                .slice(0, 4)
                .map((n) => n.split('.').slice(-1)[0])
                .join(' + ')}
              {g.partNames.length > 4 ? ` + ${g.partNames.length - 4} more` : ''}
            </Text>
            {manifest && (
              <View style={styles.manifestBox}>
                <Text style={[styles.manifestItem, { color: colors.text }]}>
                  Manifest: {manifest.partCount} parts of {formatBytes(manifest.partSizeBytes)}
                </Text>
                {manifest.originalSize > 0 && (
                  <Text style={[styles.manifestItem, { color: colors.text }]}>
                    Original: {manifest.originalName} · {formatBytes(manifest.originalSize)}
                  </Text>
                )}
              </View>
            )}
            {shaKnown ? (
              <AppButton
                label="Verify fingerprint & rejoin"
                icon="shield-checkmark"
                onPress={() => startMerge({ candidate, validate: true })}
                loading={preparing}
              />
            ) : (
              <AppButton
                label="Rejoin now"
                icon="git-merge"
                onPress={() => startMerge({ candidate, validate: false })}
                loading={preparing}
              />
            )}
            <AppButton label="Pick a different folder" variant="ghost" onPress={scanFolder} />
            {banner && <Text style={[styles.error, { color: colors.danger }]}>{banner}</Text>}
          </View>
        </GlassCard>
      </View>
    );
  } else {
    body = (
      <View style={styles.stack}>
        <GlassCard>
          <View style={styles.heroStack}>
            <Text style={[styles.heroLine, { color: colors.text }]}>Rejoin split parts into the original file</Text>
            <Text style={[styles.heroSub, { color: colors.textDim }]}>
              Pick the folder that holds the parts — Spliter detects them, validates the sequence, and rebuilds the file.
              Manifests written by the split are used for fingerprint verification.
            </Text>
          </View>
        </GlassCard>
        <AppButton label="Scan a folder" icon="folder-open" onPress={scanFolder} loading={scanning} />
        {lastOutputDirUri && !scanning && (
          <Text style={[styles.lastDir, { color: colors.textFaint }]} numberOfLines={1}>
            Last used: {dirNameOf(lastOutputDirUri)}
          </Text>
        )}
        {banner && <Text style={[styles.error, { color: colors.danger, textAlign: 'center' }]}>{banner}</Text>}
        <EmptyState
          icon="git-merge"
          title="No folder scanned yet"
          hint="Parts are found by their .001, .002… extensions. A .spliter.json manifest unlocks fingerprint verification."
        />
      </View>
    );
  }

  return (
    <Screen title="Rejoin" subtitle="From parts · back to the original" entranceKey={engine.phase === 'idle' ? 'idle' : engine.phase}>
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
    flexShrink: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  partsLine: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  manifestBox: {
    gap: 4,
    backgroundColor: 'rgba(128,128,160,0.10)',
    borderRadius: 12,
    padding: spacing.md,
  },
  manifestItem: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  error: {
    fontSize: 13,
    lineHeight: 18,
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
  verifyRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  verifyNote: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },
  metaLine: {
    fontSize: 12,
    marginTop: spacing.sm,
    fontVariant: ['tabular-nums'],
  },
  lastDir: {
    fontSize: 12,
  },
});
