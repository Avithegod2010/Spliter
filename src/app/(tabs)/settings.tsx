import React from 'react';
import { Pressable, Switch, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { GlassCard } from '@/components/GlassCard';
import { useTheme, PALETTES } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { useSettings, type MotionLevel, type ThemeMode } from '@/state/settings';

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
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.segmentText, { color: active ? '#FFFFFF' : colors.textDim }]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
        {hint ? <Text style={[styles.rowHint, { color: colors.textDim }]}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export default function SettingsScreen() {
  const { colors, accent, motion } = useTheme();
  const settings = useSettings();

  return (
    <Screen title="Settings" subtitle="Make it yours">
      <View style={styles.stack}>
        <Text style={[styles.section, { color: colors.textDim }]}>THEME STUDIO</Text>

        <GlassCard>
          <View style={styles.cardStack}>
            <SettingRow label="Accent" hint="Applies instantly across the app">
              <View style={styles.swatchRow}>
                {PALETTES.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => settings.setAccentId(p.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${p.name} accent`}
                    accessibilityState={{ selected: settings.accentId === p.id }}
                    style={[
                      styles.swatch,
                      { backgroundColor: p.accent, borderColor: '#FFFFFF' },
                      settings.accentId === p.id && styles.swatchActive,
                    ]}
                  />
                ))}
              </View>
            </SettingRow>
            <Text style={[styles.accentName, { color: accent.accentSoft }]}>{accent.name}</Text>
            <SettingRow label="Appearance">
              <Segmented<ThemeMode>
                value={settings.themeMode}
                onChange={settings.setThemeMode}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'dark', label: 'Dark' },
                  { value: 'light', label: 'Light' },
                ]}
              />
            </SettingRow>
            <SettingRow label="Glass intensity" hint="Blur strength on cards and the tab bar">
              <Segmented<'0' | '1' | '2'>
                value={String(settings.glassLevel) as '0' | '1' | '2'}
                onChange={(v) => settings.setGlassLevel(Number(v) as 0 | 1 | 2)}
                options={[
                  { value: '0', label: 'Off' },
                  { value: '1', label: 'Soft' },
                  { value: '2', label: 'Full' },
                ]}
              />
            </SettingRow>
            <SettingRow label="Animations" hint="Reduce or freeze motion; the OS setting caps this too">
              <Segmented<MotionLevel>
                value={settings.motion}
                onChange={settings.setMotion}
                options={[
                  { value: 'full', label: 'Full' },
                  { value: 'reduced', label: 'Reduced' },
                  { value: 'off', label: 'Off' },
                ]}
              />
            </SettingRow>
          </View>
        </GlassCard>

        <Text style={[styles.section, { color: colors.textDim }]}>DEFAULTS</Text>

        <GlassCard>
          <View style={styles.cardStack}>
            <SettingRow
              label="SHA-256 fingerprint"
              hint="Pre-enabled on every new split — verifiable rejoins by default"
            >
              <Switch
                value={settings.integrityDefault}
                onValueChange={settings.setIntegrityDefault}
                trackColor={{ false: colors.surfaceBorder, true: accent.accent }}
                thumbColor="#FFFFFF"
              />
            </SettingRow>
          </View>
        </GlassCard>

        <Text style={[styles.section, { color: colors.textDim }]}>ABOUT</Text>

        <GlassCard>
          <View style={styles.cardStack}>
            <Text style={[styles.aboutLine, { color: colors.text }]}>Spliter 1.0</Text>
            <Text style={[styles.aboutSub, { color: colors.textDim }]}>
              Byte-perfect file splitting and rejoining — in-app or on any PC with one shell command. Parts follow the
              name.ext.001 convention; manifests carry the SHA-256 fingerprint. Motion now: {motion}.
            </Text>
          </View>
        </GlassCard>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  cardStack: {
    gap: spacing.lg,
  },
  section: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  rowText: {
    flex: 1,
    gap: 3,
  },
  rowLabel: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  rowHint: {
    fontSize: 12,
    lineHeight: 16,
  },
  swatchRow: {
    flexDirection: 'row',
    gap: 10,
  },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchActive: {
    borderWidth: 2.5,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.35,
    shadowRadius: 4,
  },
  accentName: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: -spacing.md + 2,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 3,
    gap: 3,
  },
  segmentItem: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 11,
  },
  segmentText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  aboutLine: {
    fontSize: 15,
    fontWeight: '700',
  },
  aboutSub: {
    fontSize: 12.5,
    lineHeight: 18,
  },
});
