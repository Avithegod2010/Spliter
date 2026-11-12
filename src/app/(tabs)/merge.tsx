import React, { useCallback, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { StorageAccessFramework, readAsStringAsync, writeAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { Alert, Share, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import { stripPartSuffix, buildManifest, manifestName as manifestFileName, isManifest } from '@/lib/manifest';
import { buildRejoinKit } from '@/lib/pc-commands';
import { useHistory } from '@/state/history';
import { useSettings } from '@/state/settings';

interface MergeCandidate {
  /** Source folder (null when parts were picked by hand). */
  dirUri: string | null;
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
  const { colors, accent } = useTheme();
  const addJob = useHistory((s) => s.addJob);
  const lastOutputDirUri = useSettings((s) => s.lastOutputDirUri);

  const [candidate, setCandidate] = useState<MergeCandidate | null>(null);
  const [scanning, setScanning] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [partsOpen, setPartsOpen] = useState(false);

  const movePart = useCallback((index: number, dir: -1 | 1) => {
    setCandidate((prev) => {
      if (!prev) return prev;
      const to = index + dir;
      if (to < 0 || to >= prev.group.partUris.length) return prev;
      const swap = <T,>(arr: T[]): T[] => {
        const copy = [...arr];
        [copy[index], copy[to]] = [copy[to], copy[index]];
        return copy;
      };
      return { ...prev, group: { ...prev.group, partNames: swap(prev.group.partNames), partSizes: swap(prev.group.partSizes), partUris: swap(prev.group.partUris) } };
    });
  }, []);

  const verifyOnly = useCallback(async () => {
    if (!candidate) return;
    const sizes = await Promise.all(
      candidate.group.partUris.map((uri) => splIo.fileInfo(uri).then((f) => f.sizeBytes).catch(() => 0))
    );
    const problem = validatePartSequence(
      sizes,
      candidate.group.manifest?.originalSize ?? 0,
      candidate.group.manifest?.partSizeBytes ?? 0
    );
    if (problem) {
      Alert.alert('Verification failed', problem);
      return;
    }
    const sha = candidate.group.manifest?.sha256;
    Alert.alert(
      'Parts verified',
      [
        `All ${sizes.length} parts present and in order.`,
        `Total ${formatBytes(sizes.reduce((a, b) => a + b, 0))}.`,
        sha
          ? 'The manifest carries a SHA-256 fingerprint — rejoin with verification to confirm the rebuilt file.'
          : 'No manifest fingerprint available — rejoin to produce the file.',
      ].join('\n')
    );
  }, [candidate]);

  const exportManifest = useCallback(async () => {
    if (!candidate?.dirUri) return;
    try {
      const sizes = await Promise.all(
        candidate.group.partUris.map((uri) => splIo.fileInfo(uri).then((f) => f.sizeBytes).catch(() => 0))
      );
      const m = buildManifest({
        originalName: candidate.group.baseName,
        originalSize: sizes.reduce((a, b) => a + b, 0),
        partCount: candidate.group.partUris.length,
        partSizeBytes: candidate.group.manifest?.partSizeBytes ?? sizes[0] ?? 0,
      });
      const fileUri = await StorageAccessFramework.createFileAsync(
        candidate.dirUri,
        manifestFileName(candidate.group.baseName),
        'application/json'
      );
      await writeAsStringAsync(fileUri, JSON.stringify(m, null, 2), { encoding: EncodingType.UTF8 });
      Alert.alert('Manifest saved', manifestFileName(candidate.group.baseName) + ' written next to the parts.');
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : 'Could not write the manifest.');
    }
  }, [candidate]);

  const importManifest = useCallback(async () => {
    if (!candidate) return;
    const res = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      multiple: false,
      copyToCacheDirectory: true,
    }).catch(() => null);
    if (!res || res.canceled || !res.assets?.length) return;
    try {
      const text = await readAsStringAsync(res.assets[0].uri, { encoding: EncodingType.UTF8 });
      const parsed = JSON.parse(text);
      if (!isManifest(parsed)) {
        Alert.alert('Not a Spliter manifest', 'That JSON file is not a Spliter manifest.');
        return;
      }
      if (parsed.originalName && parsed.originalName !== candidate.group.baseName) {
        Alert.alert(
          'Manifest mismatch',
          `This manifest belongs to "${parsed.originalName}", but the loaded parts are "${candidate.group.baseName}".`
        );
        return;
      }
      setCandidate({
        ...candidate,
        group: {
          ...candidate.group,
          manifest: {
            originalName: parsed.originalName,
            originalSize: parsed.originalSize,
            partCount: parsed.partCount,
            partSizeBytes: parsed.partSizeBytes,
            sha256: parsed.sha256 ?? null,
          },
        },
      });
      Alert.alert('Manifest imported', 'Fingerprint verification is now available for these parts.');
    } catch {
      Alert.alert('Import failed', 'Could not read that file as JSON.');
    }
  }, [candidate]);

  const shareKit = useCallback(() => {
    if (!candidate) return;
    const outputName = candidate.group.manifest?.originalName || candidate.group.baseName;
    const kit = buildRejoinKit(candidate.group.partNames, outputName);
    Share.share({
      message: `Rejoin "${outputName}" (${formatBytes(candidate.group.partSizes.reduce((a, b) => a + b, 0))}, ${candidate.group.partNames.length} parts) on any PC:\n\nWindows:\n${kit.windows}\n\nmacOS / Linux:\n${kit.unix}\n\n${kit.note}`,
    }).catch(() => {});
  }, [candidate]);

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

  const pickPartsManually = useCallback(async () => {
    setUiError(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      multiple: true,
      copyToCacheDirectory: false,
    }).catch(() => null);
    if (!res || res.canceled || !res.assets?.length) return;
    const assets = [...res.assets].sort((a, b) =>
      (a.name ?? '').localeCompare(b.name ?? '', undefined, { numeric: true })
    );
    const firstName = assets[0].name || assets[0].uri.split('/').pop() || '';
    const baseName = stripPartSuffix(firstName);
    if (!baseName) {
      setUiError('Those files do not look like split parts — expected names like movie.mp4.001, movie.mp4.002.');
      return;
    }
    setScanning(true);
    try {
      const partNames = assets.map((a) => a.name || a.uri.split('/').pop() || 'part');
      const partSizes = await Promise.all(
        assets.map((a) => splIo.fileInfo(a.uri).then((f) => f.sizeBytes).catch(() => 0))
      );
      setCandidate({
        dirUri: null,
        dirName: 'selected by hand',
        group: {
          baseName,
          partNames,
          partSizes,
          partUris: assets.map((a) => a.uri),
          manifest: null,
        },
      });
    } catch (e) {
      setUiError(e instanceof Error ? e.message : 'Could not read the selected parts');
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
      let outputDirUri = cand.dirUri;
      if (!outputDirUri) {
        const dir = await StorageAccessFramework.requestDirectoryPermissionsAsync().catch(() => null);
        if (!dir?.granted) return;
        outputDirUri = dir.directoryUri;
      }
      const manifest = cand.group.manifest;
      const outputName = manifest?.originalName || cand.group.baseName;
      const res = await engine.start({
        partUris: cand.group.partUris,
        outputDirUri,
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
          outputDirUri,
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
                {g.partUris.length} parts {candidate.dirUri ? `in ${candidate.dirName}` : candidate.dirName}
              </Text>
            </View>
            <Pressable onPress={() => setPartsOpen((v) => !v)} accessibilityRole="button" accessibilityLabel={partsOpen ? 'Hide all parts' : 'Show all parts'}>
              <Text style={[styles.partsToggle, { color: accent.accentSoft }]}>
                {partsOpen ? 'Hide all parts' : `Show all parts (${g.partNames.length})`}
              </Text>
            </Pressable>
            {partsOpen && (
              <View style={styles.partsList}>
                {g.partNames.map((name, idx) => (
                  <View key={`${name}-${idx}`} style={styles.partRow}>
                    <Text style={[styles.partRowName, { color: colors.text }]} numberOfLines={1}>
                      {idx + 1}. {name}
                    </Text>
                    <Pressable
                      onPress={() => movePart(idx, -1)}
                      disabled={idx === 0}
                      accessibilityRole="button"
                      accessibilityLabel={`Move ${name} up`}
                      style={[styles.partMove, idx === 0 && { opacity: 0.3 }]}
                    >
                      <Ionicons name="chevron-up" size={16} color={colors.textDim} />
                    </Pressable>
                    <Pressable
                      onPress={() => movePart(idx, 1)}
                      disabled={idx === g.partNames.length - 1}
                      accessibilityRole="button"
                      accessibilityLabel={`Move ${name} down`}
                      style={[styles.partMove, idx === g.partNames.length - 1 && { opacity: 0.3 }]}
                    >
                      <Ionicons name="chevron-down" size={16} color={colors.textDim} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
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
            <AppButton
              label={candidate.dirUri ? 'Pick a different folder' : 'Select different parts'}
              variant="ghost"
              onPress={candidate.dirUri ? scanFolder : pickPartsManually}
            />
            <AppButton label="Verify parts only" variant="ghost" icon="checkmark-circle-outline" onPress={verifyOnly} />
            <View style={styles.utilRow}>
              {candidate.dirUri && (
                <Pressable onPress={exportManifest} accessibilityRole="button" accessibilityLabel="Export manifest" style={[styles.utilBtn, { borderColor: colors.surfaceBorder }]}>
                  <Ionicons name="save-outline" size={16} color={accent.accentSoft} />
                  <Text style={[styles.utilText, { color: colors.textDim }]}>Export manifest</Text>
                </Pressable>
              )}
              <Pressable onPress={importManifest} accessibilityRole="button" accessibilityLabel="Import manifest" style={[styles.utilBtn, { borderColor: colors.surfaceBorder }]}>
                <Ionicons name="document-text-outline" size={16} color={accent.accentSoft} />
                <Text style={[styles.utilText, { color: colors.textDim }]}>Import manifest</Text>
              </Pressable>
              <Pressable onPress={shareKit} accessibilityRole="button" accessibilityLabel="Share rejoin kit" style={[styles.utilBtn, { borderColor: colors.surfaceBorder }]}>
                <Ionicons name="share-outline" size={16} color={accent.accentSoft} />
                <Text style={[styles.utilText, { color: colors.textDim }]}>Share kit</Text>
              </Pressable>
            </View>
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
              Scan the folder that holds the parts, or pick them by hand. Spliter sorts them, validates the sequence,
              and rebuilds the file — manifests unlock fingerprint verification.
            </Text>
          </View>
        </GlassCard>
        <AppButton label="Scan a folder" icon="folder-open" onPress={scanFolder} loading={scanning} />
        <AppButton label="Select parts manually" icon="documents-outline" variant="ghost" onPress={pickPartsManually} />
        {lastOutputDirUri && !scanning && (
          <Text style={[styles.lastDir, { color: colors.textFaint }]} numberOfLines={1}>
            Last used: {dirNameOf(lastOutputDirUri)}
          </Text>
        )}
        {banner && <Text style={[styles.error, { color: colors.danger, textAlign: 'center' }]}>{banner}</Text>}
        <EmptyState
          icon="git-merge"
          title="Nothing loaded yet"
          hint="Parts are found by their .001, .002… extensions — or pick the files yourself. A .spliter.json manifest unlocks fingerprint verification."
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
  partsToggle: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  partsList: {
    gap: 2,
  },
  partRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  partRowName: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: 'monospace',
  },
  partMove: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(128,128,160,0.10)',
  },
  utilRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  utilBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  utilText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
