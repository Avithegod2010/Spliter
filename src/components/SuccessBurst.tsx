import React from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { PALETTES } from '@/theme/tokens';

const PARTICLE_COUNT = 26;
const DURATION = 1100;

interface ParticleSpec {
  angle: number;
  distance: number;
  size: number;
  color: string;
  delay: number;
}

function Particle({ spec }: { spec: ParticleSpec }) {
  const progress = useSharedValue(0);
  const fade = useSharedValue(1);

  React.useEffect(() => {
    progress.value = withDelay(spec.delay, withTiming(1, { duration: DURATION, easing: Easing.out(Easing.quad) }));
    fade.value = withDelay(spec.delay + DURATION * 0.55, withTiming(0, { duration: DURATION * 0.45 }));
  }, [progress, fade, spec.delay]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.cos(spec.angle) * spec.distance * progress.value },
      { translateY: Math.sin(spec.angle) * spec.distance * progress.value },
      { scale: 1 - 0.55 * progress.value },
    ],
    opacity: fade.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        style,
        {
          position: 'absolute',
          width: spec.size,
          height: spec.size,
          borderRadius: spec.size / 2,
          backgroundColor: spec.color,
        },
      ]}
    />
  );
}

/** Deterministic pseudo-random in [0,1) from a seed — keeps render pure while varying every burst. */
function pseudoRandom(seed: number, n: number): number {
  const x = Math.sin(seed * 127.1 + n * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function makeParticles(seed: number, size: number): ParticleSpec[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + pseudoRandom(seed, i) * 0.4;
    return {
      angle,
      distance: size * (0.34 + pseudoRandom(seed, i + 100) * 0.22),
      size: 5 + pseudoRandom(seed, i + 200) * 7,
      color: PALETTES[Math.floor(pseudoRandom(seed, i + 300) * PALETTES.length)].accent,
      delay: pseudoRandom(seed, i + 400) * 140,
    };
  });
}

export function SuccessBurst({ size = 320 }: { size?: number }) {
  const { celebrate } = useTheme();
  const rawId = React.useId();
  const seed = React.useMemo(() => parseInt(rawId.replace(/[^0-9]/g, ''), 10) || 1, [rawId]);
  const particles = React.useMemo(() => (celebrate ? makeParticles(seed, size) : []), [celebrate, seed, size]);

  if (particles.length === 0) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { width: size, height: size }]}>
      {particles.map((spec, i) => (
        <Particle key={i} spec={spec} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
  },
});
