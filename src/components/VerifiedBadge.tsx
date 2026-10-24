import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { spring } from '@/theme/tokens';

interface VerifiedBadgeProps {
  verified: boolean;
  delayed?: boolean;
  /** Renders a "not verified" neutral chip instead of hiding. */
  showUnverified?: boolean;
}

export function VerifiedBadge({ verified, delayed, showUnverified }: VerifiedBadgeProps) {
  const { colors, motion } = useTheme();
  const success = colors.success;
  const pop = useSharedValue(0.6);
  const opacity = useSharedValue(0);

  React.useEffect(() => {
    if (motion === 'off') {
      pop.value = 1;
      opacity.value = 1;
      return;
    }
    const delay = delayed ? 250 : 0;
    pop.value = withDelay(delay, withSpring(1, spring.bouncy));
    opacity.value = withDelay(delay, withSpring(1, spring.gentle));
  }, [delayed, motion, pop, opacity]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
    opacity: opacity.value,
  }));

  if (!verified && !showUnverified) return null;

  return (
    <Animated.View
      style={[
        style,
        styles.chip,
        { backgroundColor: verified ? `${success}22` : 'rgba(128,128,160,0.16)' },
      ]}
    >
      <Ionicons
        name={verified ? 'shield-checkmark' : 'shield-outline'}
        size={13}
        color={verified ? success : colors.textDim}
      />
      <Text style={[styles.text, { color: verified ? success : colors.textDim }]}>
        {verified ? 'Verified' : 'Not verified'}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11.5,
    fontWeight: '700',
  },
});
