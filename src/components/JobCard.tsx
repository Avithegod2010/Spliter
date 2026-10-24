import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { GlassCard } from './GlassCard';
import { VerifiedBadge } from './VerifiedBadge';
import { useTheme } from '@/theme/ThemeProvider';
import { formatBytes, formatDuration } from '@/lib/format';
import type { HistoryJob } from '@/state/history';

interface JobCardProps {
  job: HistoryJob;
  onRerun?: (job: HistoryJob) => void;
  onDelete?: (job: HistoryJob) => void;
  onShare?: (job: HistoryJob) => void;
  index?: number;
}

export function JobCard({ job, onRerun, onDelete, onShare, index = 0 }: JobCardProps) {
  const { colors, accent, motion } = useTheme();
  const date = new Date(job.createdAt);
  const when = `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <Animated.View entering={motion === 'off' ? undefined : FadeInDown.delay(index * 60).springify().damping(18)}>
      <GlassCard>
        <View style={styles.row}>
          <View style={[styles.iconWrap, { backgroundColor: accent.glow }]}>
            <Ionicons
              name={job.type === 'split' ? 'cut' : 'git-merge'}
              size={20}
              color={accent.accentSoft}
            />
          </View>
          <View style={styles.meta}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                {job.name}
              </Text>
              {job.verified ? <VerifiedBadge verified /> : null}
            </View>
            <Text style={[styles.sub, { color: colors.textDim }]} numberOfLines={2}>
              {job.type === 'split' ? `Split into ${job.partsCount}` : 'Rejoined from'}{' '}
              {job.type === 'split' ? `parts · ${formatBytes(job.sizeBytes)}` : `${job.partsCount} parts · ${formatBytes(job.sizeBytes)}`}
              {` · ${when}`}
              {job.durationMs > 0 ? ` · ${formatDuration(job.durationMs)}` : ''}
            </Text>
          </View>
          <View style={styles.actions}>
            {onRerun && (
              <Pressable
                onPress={() => {
                  if (motion !== 'off') Haptics.selectionAsync().catch(() => {});
                  onRerun(job);
                }}
                style={[styles.actionBtn, { borderColor: colors.surfaceBorder }]}
                accessibilityRole="button"
                accessibilityLabel="Run again"
              >
                <Ionicons name="refresh" size={16} color={accent.accentSoft} />
              </Pressable>
            )}
            {onShare && (
              <Pressable
                onPress={() => {
                  if (motion !== 'off') Haptics.selectionAsync().catch(() => {});
                  onShare(job);
                }}
                style={[styles.actionBtn, { borderColor: colors.surfaceBorder }]}
                accessibilityRole="button"
                accessibilityLabel="Share rejoin commands"
              >
                <Ionicons name="share-outline" size={16} color={accent.accentSoft} />
              </Pressable>
            )}
            {onDelete && (
              <Pressable
                onPress={() => onDelete(job)}
                style={[styles.actionBtn, { borderColor: colors.surfaceBorder }]}
                accessibilityRole="button"
                accessibilityLabel="Delete from history"
              >
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
              </Pressable>
            )}
          </View>
        </View>
      </GlassCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: 14.5,
    fontWeight: '700',
    flexShrink: 1,
  },
  sub: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
