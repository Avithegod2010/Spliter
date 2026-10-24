import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { GlassCard } from './GlassCard';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/**
 * Shown when the spl-io native module is missing (e.g. the JS bundle is run
 * inside Expo Go, which cannot load local native modules).
 */
export function FallbackScreen() {
  const { colors } = useTheme();
  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.center}>
        <View style={styles.iconWrap}>
          <Ionicons name="construct" size={34} color={colors.warning} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Native engine not loaded</Text>
        <GlassCard style={styles.card}>
          <Text style={[styles.body, { color: colors.textDim }]}>
            Spliter splits files with a native engine that ships inside the app build.{' '}
            <Text style={{ color: colors.text, fontWeight: '700' }}>Expo Go can&apos;t run it.</Text>
          </Text>
          <Text style={[styles.body, { color: colors.textDim, marginTop: 8 }]}>
            Use a development-client build or the release APK:
          </Text>
          <Text style={[styles.code, { color: colors.text, backgroundColor: colors.backgroundAlt }]}>
            eas build -p android --profile dev-client
          </Text>
        </GlassCard>
        <AppButton
          label="Open EAS builds docs"
          icon="open-outline"
          variant="ghost"
          onPress={() => Linking.openURL('https://docs.expo.dev/build/introduction/').catch(() => {})}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  iconWrap: {
    width: 68,
    height: 68,
    borderRadius: 24,
    backgroundColor: 'rgba(251, 191, 36, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  card: {
    width: '100%',
  },
  body: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  code: {
    marginTop: 10,
    fontFamily: 'monospace',
    fontSize: 12.5,
    padding: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
});
