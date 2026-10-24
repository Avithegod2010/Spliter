import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { GlassCard } from './GlassCard';
import { useTheme } from '@/theme/ThemeProvider';
import { formatBytes } from '@/lib/format';

export function fileTypeIcon(name: string): keyof typeof Ionicons.glyphMap {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'mkv', 'mov', 'avi', 'webm', 'm4v'].includes(ext)) return 'film';
  if (['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'].includes(ext)) return 'musical-notes';
  if (['zip', '7z', 'rar', 'tar', 'gz', 'iso'].includes(ext)) return 'file-tray-full';
  if (['apk'].includes(ext)) return 'logo-android';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic'].includes(ext)) return 'image';
  if (['pdf'].includes(ext)) return 'document-text';
  return 'document-attach';
}

export function fileTypeLabel(name: string): string {
  const ext = name.split('.').pop()?.toUpperCase() ?? 'FILE';
  return ext.length <= 5 ? ext : 'FILE';
}

interface FileCardProps {
  name: string;
  sizeBytes: number;
  removing?: boolean;
  compact?: boolean;
}

export function FileCard({ name, sizeBytes, compact }: FileCardProps) {
  const { colors, accent, motion } = useTheme();
  return (
    <Animated.View entering={motion === 'off' ? undefined : FadeInUp.springify().damping(16)}>
      <GlassCard style={compact ? styles.compact : undefined}>
        <View style={styles.row}>
          <View style={[styles.iconWrap, { backgroundColor: accent.glow }]}>
            <Ionicons name={fileTypeIcon(name)} size={22} color={accent.accentSoft} />
          </View>
          <View style={styles.meta}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {name}
            </Text>
            <Text style={[styles.sub, { color: colors.textDim }]}>
              {formatBytes(sizeBytes)} · {fileTypeLabel(name)}
            </Text>
          </View>
        </View>
      </GlassCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  compact: {
    padding: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
  },
  sub: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
});
