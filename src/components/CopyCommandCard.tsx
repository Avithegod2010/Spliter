import React, { useMemo, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassCard } from './GlassCard';
import { useTheme } from '@/theme/ThemeProvider';
import { buildRejoinKit } from '@/lib/pc-commands';

interface CopyCommandCardProps {
  partNames: string[];
  outputName: string;
}

type CmdPlatform = 'windows' | 'unix';

export function CopyCommandCard({ partNames, outputName }: CopyCommandCardProps) {
  const { colors, accent, motion } = useTheme();
  const [platform, setPlatform] = useState<CmdPlatform>('windows');
  const [copied, setCopied] = useState(false);
  const kit = useMemo(() => buildRejoinKit(partNames, outputName), [partNames, outputName]);
  const command = platform === 'windows' ? kit.windows : kit.unix;

  const copy = async () => {
    Clipboard.setStringAsync(command).catch(() => {});
    if (motion !== 'off') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <GlassCard>
      <Text style={[styles.title, { color: colors.text }]}>Rejoin on any PC</Text>
      <Text style={[styles.note, { color: colors.textDim }]}>{kit.note}</Text>
      <View style={styles.tabs}>
        {(['windows', 'unix'] as const).map((p) => (
          <Pressable
            key={p}
            onPress={() => setPlatform(p)}
            style={[styles.tab, platform === p && { backgroundColor: accent.accent }]}
            accessibilityRole="button"
            accessibilityLabel={p === 'windows' ? 'Windows command' : 'Mac and Linux command'}
          >
            <Text style={[styles.tabText, { color: platform === p ? '#FFFFFF' : colors.textDim }]}>
              {p === 'windows' ? 'Windows' : 'macOS / Linux'}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={copy} accessibilityRole="button" accessibilityLabel="Copy command">
        <Text style={[styles.command, { color: accent.accentSoft, backgroundColor: colors.backgroundAlt }]} selectable>
          {command}
        </Text>
      </Pressable>
      <View style={styles.copyRow}>
        <Ionicons
          name={copied ? 'checkmark-circle' : 'copy-outline'}
          size={15}
          color={copied ? colors.success : colors.textDim}
        />
        <Text style={[styles.copyText, { color: copied ? colors.success : colors.textDim }]}>
          {copied ? 'Copied — paste it into a terminal in the parts folder' : 'Tap the command to copy'}
        </Text>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  note: {
    fontSize: 12,
    marginTop: 2,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(128,128,160,0.14)',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
  },
  command: {
    marginTop: 10,
    fontFamily: Platform.select({ android: 'monospace', default: 'Menlo' }),
    fontSize: 12.5,
    lineHeight: 19,
    padding: 12,
    borderRadius: 12,
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  copyText: {
    fontSize: 11.5,
    flex: 1,
  },
});
