import React, { useEffect } from 'react';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, { useAnimatedProps, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { formatBytes } from '@/lib/format';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ProgressRingProps {
  /** 0..1 */
  progress: number;
  size?: number;
  stroke?: number;
  label?: string;
  bytesDone?: number;
  bytesTotal?: number;
}

export function ProgressRing({ progress, size = 220, stroke = 14, label, bytesDone, bytesTotal }: ProgressRingProps) {
  const { accent, colors, motion } = useTheme();
  const clamped = Math.min(1, Math.max(0, progress));
  const target = useSharedValue(0);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    target.value = motion === 'off' ? clamped : withTiming(clamped, { duration: 240 });
  }, [clamped, motion, target]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - target.value),
  }));

  useDerivedValue(() => {
    // Keep the shared value in sync when motion is off (no timing tween).
    return target.value;
  });

  const percent = Math.round(clamped * 100);

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        <Defs>
          <LinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={accent.accent} />
            <Stop offset="1" stopColor={accent.accentSoft} />
          </LinearGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.surfaceBorder}
          strokeWidth={stroke}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#ringGrad)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={[styles.percent, { color: colors.text }]}>{percent}%</Text>
        {bytesDone !== undefined && bytesTotal ? (
          <Text style={[styles.bytes, { color: colors.textDim }]}>
            {formatBytes(bytesDone)} / {formatBytes(bytesTotal)}
          </Text>
        ) : null}
        {label ? (
          <Text style={[styles.label, { color: accent.accentSoft }]} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  svg: {
    position: 'absolute',
  },
  center: {
    alignItems: 'center',
    gap: 4,
  },
  percent: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1.2,
    fontVariant: ['tabular-nums'],
  },
  bytes: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
});
