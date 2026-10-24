import React from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { AppButton } from '@/components/AppButton';
import { JobCard } from '@/components/JobCard';
import { EmptyState } from '@/components/EmptyState';
import { ProgressRing } from '@/components/ProgressRing';
import { GlassCard } from '@/components/GlassCard';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { useJobEngine } from '@/lib/job-engine';
import { splIo, type SplMergeOptions, type SplMergeResult, type SplSplitOptions, type SplSplitResult } from '@/lib/native-io';
import { buildRejoinKit } from '@/lib/pc-commands';
import { partName } from '@/lib/manifest';
import { formatBytes } from '@/lib/format';
import { useHistory, type HistoryJob } from '@/state/history';

export default function HistoryScreen() {
  const { colors } = useTheme();
  const jobs = useHistory((s) => s.jobs);
  const removeJob = useHistory((s) => s.removeJob);
  const clearAll = useHistory((s) => s.clearAll);

  const splitEngine = useJobEngine<Omit<SplSplitOptions, 'jobId'>, SplSplitResult>((args, jobId) =>
    splIo.split({ ...args, jobId })
  );
  const mergeEngine = useJobEngine<Omit<SplMergeOptions, 'jobId'>, SplMergeResult>((args, jobId) =>
    splIo.merge({ ...args, jobId })
  );

  const busy = splitEngine.phase === 'running' || mergeEngine.phase === 'running';
  const activeEngine = splitEngine.phase === 'running' ? splitEngine : mergeEngine;

  const rerun = async (job: HistoryJob) => {
    if (busy) return;
    try {
      if (job.type === 'split') {
        if (!job.sourceUri || !job.outputDirUri || !job.partSizeBytes) {
          Alert.alert('Cannot re-run', 'The original file reference is missing for this job.');
          return;
        }
        const res = await splitEngine.start({
          sourceUri: job.sourceUri,
          outputDirUri: job.outputDirUri,
          baseName: job.name,
          partSizeBytes: job.partSizeBytes,
          computeSha256: job.integrity,
        });
        if (res) {
          useHistory.getState().addJob({
            ...job,
            id: `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            partsCount: res.parts.length,
            sha256: res.sha256,
            verified: !!res.sha256,
            durationMs: splitEngine.durationMs.current,
            createdAt: Date.now(),
          });
        }
      } else {
        if (!job.partUris?.length || !job.outputDirUri) {
          Alert.alert('Cannot re-run', 'The part files for this job are no longer referenced.');
          return;
        }
        const res = await mergeEngine.start({
          partUris: job.partUris,
          outputDirUri: job.outputDirUri,
          outputName: job.name,
          expectedSizeBytes: job.sizeBytes,
          expectedSha256: job.integrity ? job.sha256 : null,
        });
        if (res) {
          useHistory.getState().addJob({
            ...job,
            id: `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            sizeBytes: res.sizeBytes,
            sha256: res.sha256,
            verified: res.verified,
            durationMs: mergeEngine.durationMs.current,
            createdAt: Date.now(),
          });
        }
      }
    } catch (e) {
      Alert.alert('Re-run failed', e instanceof Error ? e.message : 'Something went wrong');
    }
  };

  const share = (job: HistoryJob) => {
    if (job.type !== 'split') return;
    const names = Array.from({ length: job.partsCount }, (_, i) => partName(job.name, i + 1));
    const kit = buildRejoinKit(names, job.name);
    Share.share({
      message: `Rejoin "${job.name}" (${formatBytes(job.sizeBytes)}, ${job.partsCount} parts) on any PC:\n\nWindows:\n${kit.windows}\n\nmacOS / Linux:\n${kit.unix}\n\n${kit.note}`,
    }).catch(() => {});
  };

  const confirmClear = () => {
    Alert.alert('Clear history?', 'All job entries will be removed. Your files are not touched.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => clearAll() },
    ]);
  };

  const confirmDelete = (job: HistoryJob) => {
    Alert.alert('Remove from history?', `"${job.name}" will disappear from this list. Your files are not touched.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeJob(job.id) },
    ]);
  };

  const engineError = splitEngine.phase === 'error' ? splitEngine.error : mergeEngine.phase === 'error' ? mergeEngine.error : null;
  const engineCancelled = splitEngine.phase === 'cancelled' || mergeEngine.phase === 'cancelled';

  return (
    <Screen title="History" subtitle={jobs.length ? `${jobs.length} job${jobs.length > 1 ? 's' : ''}` : 'Nothing yet'}>
      <View style={styles.stack}>
        {busy && activeEngine && (
          <GlassCard>
            <View style={styles.runningRow}>
              <ProgressRing
                progress={activeEngine.progress.bytesTotal ? activeEngine.progress.bytesDone / activeEngine.progress.bytesTotal : 0}
                size={92}
                stroke={9}
                label={`Part ${activeEngine.progress.partIndex}/${activeEngine.progress.partsTotal}`}
              />
              <View style={styles.runningMeta}>
                <Text style={[styles.runningTitle, { color: colors.text }]}>Re-running job…</Text>
                <Text style={[styles.runningSub, { color: colors.textDim }]}>
                  {formatBytes(activeEngine.progress.bytesDone)} of {formatBytes(activeEngine.progress.bytesTotal)}
                </Text>
                <AppButton
                  label="Cancel"
                  variant="ghost"
                  icon="close-circle-outline"
                  onPress={splitEngine.phase === 'running' ? splitEngine.cancel : mergeEngine.cancel}
                  style={styles.cancelBtn}
                />
              </View>
            </View>
          </GlassCard>
        )}
        {(engineError || engineCancelled) && !busy && (
          <Text style={[styles.notice, { color: engineError ? colors.danger : colors.textDim }]}>
            {engineError ?? 'Re-run cancelled — no changes were made.'}
          </Text>
        )}
        {jobs.map((job, i) => (
          <JobCard
            key={job.id}
            job={job}
            index={i}
            onRerun={busy ? undefined : rerun}
            onShare={job.type === 'split' ? share : undefined}
            onDelete={busy ? undefined : confirmDelete}
          />
        ))}
        {jobs.length === 0 && !busy ? (
          <EmptyState
            icon="time"
            title="No jobs yet"
            hint="Splits and rejoins land here with their sizes, timing, and verification status — re-run them in one tap."
          />
        ) : null}
        {jobs.length > 0 && !busy && <AppButton label="Clear history" variant="danger" icon="trash-outline" onPress={confirmClear} />}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  runningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  runningMeta: {
    flex: 1,
    gap: 6,
  },
  runningTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  runningSub: {
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
  },
  cancelBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  notice: {
    fontSize: 13,
    lineHeight: 18,
  },
});
