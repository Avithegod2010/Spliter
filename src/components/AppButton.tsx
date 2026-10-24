import React, { useCallback } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { spring } from '@/theme/tokens';

interface AppButtonProps {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function AppButton({ label, onPress, icon, variant = 'primary', disabled, loading, style }: AppButtonProps) {
  const { colors, accent, motion } = useTheme();
  const scale = useSharedValue(1);

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const pressIn = useCallback(() => {
    if (motion === 'off') return;
    // eslint-disable-next-line react-hooks/immutability -- reanimated shared values are handler-mutable by design
    scale.value = withSpring(0.96, spring.snappy);
  }, [motion, scale]);

  const pressOut = useCallback(() => {
    // eslint-disable-next-line react-hooks/immutability -- reanimated shared values are handler-mutable by design
    scale.value = withSpring(1, spring.snappy);
  }, [scale]);

  const handlePress = useCallback(() => {
    if (motion !== 'off') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  }, [motion, onPress]);

  const blocked = disabled || loading;

  return (
    <Animated.View style={[animated, style]}>
      <Pressable
        onPress={handlePress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={blocked}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [styles.base, variant === 'ghost' && styles.ghost, pressed && blocked !== true && styles.pressed]}
      >
        {variant === 'primary' && !blocked && (
          <LinearGradient
            colors={[accent.accent, accent.accentSoft]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        {variant === 'primary' && blocked && <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceBorder }]} />}
        {variant === 'danger' && <View style={[StyleSheet.absoluteFill, { backgroundColor: `${colors.danger}26` }]} />}
        {icon && (
          <Ionicons
            name={icon}
            size={18}
            color={variant === 'ghost' ? accent.accentSoft : variant === 'danger' ? colors.danger : '#FFFFFF'}
            style={styles.icon}
          />
        )}
        <Text
          style={[
            styles.label,
            variant === 'ghost' && { color: accent.accentSoft },
            variant === 'danger' && { color: colors.danger },
            variant === 'primary' && { color: blocked ? colors.textDim : '#FFFFFF' },
          ]}
          numberOfLines={1}
        >
          {loading ? 'Working…' : label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(128,128,160,0.35)',
  },
  pressed: {
    opacity: 0.92,
  },
  icon: {
    marginRight: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
