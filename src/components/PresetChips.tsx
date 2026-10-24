import React, { useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { spring } from '@/theme/tokens';
import { SIZE_PRESETS } from '@/lib/presets';

interface PresetChipsProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function Chip({ id, label, sublabel, selected, onSelect }: {
  id: string;
  label: string;
  sublabel: string;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { accent, colors, motion } = useTheme();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const pressIn = useCallback(() => {
    if (motion === 'off') return;
    // eslint-disable-next-line react-hooks/immutability -- reanimated shared values are handler-mutable by design
    scale.value = withSpring(0.94, spring.snappy);
  }, [motion, scale]);
  const pressOut = useCallback(() => {
    // eslint-disable-next-line react-hooks/immutability -- reanimated shared values are handler-mutable by design
    scale.value = withSpring(1, spring.snappy);
  }, [scale]);

  return (
    <Animated.View style={style}>
      <Pressable
        onPress={() => {
          if (motion !== 'off') Haptics.selectionAsync().catch(() => {});
          onSelect(id);
        }}
        onPressIn={pressIn}
        onPressOut={pressOut}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${sublabel}`}
        style={[styles.chip, selected && { backgroundColor: accent.accent, borderColor: accent.accent }]}
      >
        <Text style={[styles.label, { color: selected ? '#FFFFFF' : colors.text }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.sub, { color: selected ? 'rgba(255,255,255,0.85)' : colors.textDim }]}>{sublabel}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function PresetChips({ selectedId, onSelect }: PresetChipsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {SIZE_PRESETS.map((p) => (
        <Chip
          key={p.id}
          id={p.id}
          label={p.label}
          sublabel={p.sublabel}
          selected={selectedId === p.id}
          onSelect={onSelect}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 10,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(128,128,160,0.30)',
    backgroundColor: 'rgba(128,128,160,0.10)',
    alignItems: 'center',
    gap: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
  },
  sub: {
    fontSize: 11,
    fontWeight: '600',
  },
});
