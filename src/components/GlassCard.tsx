import React from 'react';
import { BlurView } from 'expo-blur';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  /** Disable blur even when glass is enabled (nested cards). */
  flat?: boolean;
}

export function GlassCard({ children, style, flat }: GlassCardProps) {
  const { colors, glassLevel, isDark } = useTheme();
  const blurOn = !flat && glassLevel > 0;

  return (
    <View style={[styles.wrap, style]}>
      {blurOn && (
        <BlurView
          intensity={glassLevel === 2 ? 42 : 24}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      )}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: blurOn ? colors.glassTint : colors.surface }]}
      />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.border, { borderColor: colors.surfaceBorder }]} />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  border: {
    borderWidth: 1,
    borderRadius: 24,
  },
  content: {
    padding: 16,
  },
});
