import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { spring } from '@/theme/tokens';
import type { BottomTabBarProps } from 'expo-router/build/layouts/Tabs';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'cut',
  merge: 'git-merge',
  history: 'time',
  settings: 'settings',
};

const LABELS: Record<string, string> = {
  index: 'Split',
  merge: 'Rejoin',
  history: 'History',
  settings: 'Settings',
};

function TabItem({
  routeName,
  focused,
  onPress,
}: {
  routeName: string;
  focused: boolean;
  onPress: () => void;
}) {
  const { accent, colors, motion } = useTheme();
  const pop = useSharedValue(focused ? 1 : 0.92);
  const lift = useSharedValue(focused ? -4 : 0);

  React.useEffect(() => {
    pop.value = withSpring(focused ? 1 : 0.92, spring.snappy);
    lift.value = withSpring(focused && motion !== 'off' ? -4 : 0, spring.snappy);
  }, [focused, motion, pop, lift]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: lift.value }, { scale: pop.value }],
  }));

  const color = focused ? accent.accentSoft : colors.textFaint;

  return (
    <Pressable
      onPress={() => {
        if (!focused && motion !== 'off') Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={styles.item}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={LABELS[routeName] ?? routeName}
    >
      <Animated.View style={style}>
        <Ionicons name={ICONS[routeName] ?? 'ellipse'} size={21} color={color} />
      </Animated.View>
      <Text style={[styles.label, { color }]}>{LABELS[routeName] ?? routeName}</Text>
      {focused && motion !== 'off' && (
        <Animated.View
          entering={undefined}
          style={[styles.dot, { backgroundColor: accent.accent }]}
        />
      )}
    </Pressable>
  );
}

export function AppTabBar({ state, navigateToTab, insets }: BottomTabBarProps) {
  const { colors, glassLevel } = useTheme();

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: glassLevel > 0 ? colors.glassTint : colors.backgroundAlt,
          borderColor: colors.surfaceBorder,
          paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 10 : 12),
        },
      ]}
    >
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        return (
          <TabItem
            key={route.key}
            routeName={route.name}
            focused={focused}
            onPress={() => navigateToTab(route.key)}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 8,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  label: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 1,
  },
});
