import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

export type SizeMode = 'size' | 'parts';
export type SizeUnit = 'MB' | 'GB';

interface SizeFieldProps {
  mode: SizeMode;
  onModeChange: (mode: SizeMode) => void;
  unit: SizeUnit;
  onUnitChange: (unit: SizeUnit) => void;
  value: string;
  onValueChange: (value: string) => void;
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { accent, colors } = useTheme();
  return (
    <View style={[styles.segment, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[styles.segmentItem, active && { backgroundColor: accent.accent }]}
            accessibilityRole="button"
            accessibilityLabel={opt.label}
          >
            <Text style={[styles.segmentText, { color: active ? '#FFFFFF' : colors.textDim }]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SizeField({ mode, onModeChange, unit, onUnitChange, value, onValueChange }: SizeFieldProps) {
  const { colors, accent } = useTheme();
  return (
    <View style={styles.wrap}>
      <Segmented
        value={mode}
        onChange={onModeChange}
        options={[
          { value: 'size', label: 'Part size' },
          { value: 'parts', label: 'Number of parts' },
        ]}
      />
      <View style={[styles.inputRow, { borderColor: colors.surfaceBorder, backgroundColor: colors.surface }]}>
        <TextInput
          style={[styles.input, { color: colors.text }]}
          value={value}
          onChangeText={onValueChange}
          keyboardType="decimal-pad"
          placeholder={mode === 'size' ? '2' : '5'}
          placeholderTextColor={colors.textFaint}
          accessibilityLabel={mode === 'size' ? 'Part size value' : 'Number of parts'}
        />
        {mode === 'size' ? (
          <Segmented
            value={unit}
            onChange={onUnitChange}
            options={[
              { value: 'MB', label: 'MB' },
              { value: 'GB', label: 'GB' },
            ]}
          />
        ) : (
          <Text style={[styles.unitText, { color: accent.accentSoft }]}>parts</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 3,
    gap: 3,
    alignSelf: 'flex-start',
  },
  segmentItem: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 11,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingRight: 10,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 28,
    fontWeight: '800',
    paddingVertical: 14,
    paddingHorizontal: 16,
    letterSpacing: -0.5,
  },
  unitText: {
    fontSize: 15,
    fontWeight: '700',
    marginRight: 6,
  },
});
