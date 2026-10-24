import React, { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  hint: string;
}

export function EmptyState({ icon, title, hint }: EmptyStateProps) {
  const { colors, accent, motion } = useTheme();
  const float = useSharedValue(0);

  useEffect(() => {
    if (motion !== 'full') return;
    float.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [motion, float]);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -6 * float.value }],
  }));

  return (
    <View style={styles.wrap}>
      <Animated.View style={floatStyle}>
        <View style={[styles.iconWrap, { backgroundColor: accent.glow }]}>
          <Ionicons name={icon} size={30} color={accent.accentSoft} />
        </View>
      </Animated.View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.hint, { color: colors.textDim }]}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: spacing.xxl * 1.6,
    gap: 10,
    paddingHorizontal: spacing.xl,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 280,
  },
});
