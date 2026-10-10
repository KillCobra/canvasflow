import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { C, R } from '@/theme';

const BAND = 140;

/** A placeholder block with a soft highlight sweeping across it while content loads. */
export function Skeleton({ style }: { style?: ViewStyle | ViewStyle[] }) {
  // Worklet closure; see EditorCanvas for why this opts out of the compiler.
  'use no memo';
  const width = useSharedValue(0);
  const t = useSharedValue(0);

  useEffect(() => {
    t.set(withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1));
  }, [t]);

  const sweep = useAnimatedStyle(() => ({
    transform: [{ translateX: -BAND + t.get() * (width.get() + BAND) }],
  }));

  return (
    <View
      style={[styles.base, style]}
      onLayout={(e) => {
        width.set(e.nativeEvent.layout.width);
      }}>
      <Animated.View style={[styles.band, sweep]} />
    </View>
  );
}

/** Stand-in for the two-column grid of projects. */
export function ProjectGridSkeleton({ cardWidth, gap, count = 4 }: { cardWidth: number; gap: number; count?: number }) {
  return (
    <View style={[styles.grid, { columnGap: gap, rowGap: 22 }]}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ width: cardWidth, gap: 8 }}>
          <Skeleton style={{ height: cardWidth * 1.25, borderRadius: R.md }} />
          <Skeleton style={{ width: cardWidth * 0.6, height: 14, borderRadius: 7, marginTop: 4 }} />
          <Skeleton style={{ width: cardWidth * 0.4, height: 10, borderRadius: 5 }} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: C.surface, overflow: 'hidden' },
  band: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: BAND,
    experimental_backgroundImage:
      'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0) 100%)',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
});
