import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { type ReactNode, useEffect } from 'react';
import { Pressable, type PressableProps, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { C, R, T } from '@/theme';

export type IconName = SymbolViewProps['name'];

const SPRING = { damping: 18, stiffness: 420, mass: 0.6 };

const LIQUID_GLASS = isLiquidGlassAvailable();

/**
 * Floating material: Liquid Glass on iOS 26+, a dark blur elsewhere. Children
 * sit on top; pass the shape (radius, padding) through `style`.
 */
export function Glass({
  style,
  children,
  interactive = false,
}: {
  style?: ViewStyle | ViewStyle[];
  children?: ReactNode;
  interactive?: boolean;
}) {
  if (LIQUID_GLASS) {
    return (
      <GlassView glassEffectStyle="regular" colorScheme="dark" isInteractive={interactive} style={[styles.glass, style]}>
        {children}
      </GlassView>
    );
  }
  return (
    <BlurView intensity={50} tint="systemChromeMaterialDark" style={[styles.glass, styles.glassFallback, style]}>
      {children}
    </BlurView>
  );
}

/** Pressable that settles in slightly under the finger, for a tactile feel. */
export function PressableScale({
  style,
  children,
  scaleTo = 0.96,
  onPressIn,
  onPressOut,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  scaleTo?: number;
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        scale.set(withSpring(scaleTo, SPRING));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, SPRING));
        onPressOut?.(e);
      }}>
      <Animated.View style={[style, animated]}>{children}</Animated.View>
    </Pressable>
  );
}

export function Icon({ name, size = 22, color = C.text }: { name: IconName; size?: number; color?: string }) {
  return <SymbolView name={name} size={size} tintColor={color} weight="regular" />;
}

export function IconButton({
  icon,
  onPress,
  disabled,
  label,
  tone = 'plain',
}: {
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
  label: string;
  tone?: 'plain' | 'filled' | 'accent';
}) {
  return (
    <PressableScale
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={[
        styles.iconButton,
        tone === 'filled' && { backgroundColor: C.surfaceHi },
        tone === 'accent' && { backgroundColor: C.accent },
        { opacity: disabled ? 0.28 : 1 },
      ].filter(Boolean) as ViewStyle[]}>
      <Icon name={icon} size={19} color={tone === 'accent' ? C.accentInk : C.text} />
    </PressableScale>
  );
}

export function ToolButton({
  icon,
  label,
  onPress,
  active,
  danger,
  bare,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
  /** No tile behind the icon (for buttons that already sit on glass). */
  bare?: boolean;
}) {
  const color = danger ? C.danger : active ? C.accent : C.text;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={styles.tool}>
      <View style={[styles.toolIcon, bare && styles.toolIconBare]}>
        <Icon name={icon} size={bare ? 23 : 21} color={color} />
      </View>
      <Text style={[styles.toolLabel, { color: danger ? C.danger : active ? C.accent : C.textDim }]}>{label}</Text>
    </PressableScale>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  style,
}: {
  label: ReactNode;
  selected?: boolean;
  onPress: () => void;
  style?: ViewStyle;
}) {
  return (
    <PressableScale
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={[styles.chip, selected ? styles.chipOn : null, style].filter(Boolean) as ViewStyle[]}>
      {typeof label === 'string' ? (
        <Text style={[styles.chipText, selected && { color: C.bg }]}>{label}</Text>
      ) : (
        label
      )}
    </PressableScale>
  );
}

export function HScroll({ children, gap = 8 }: { children: ReactNode; gap?: number }) {
  return (
    <ScrollView
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap, paddingHorizontal: 16, alignItems: 'center' }}>
      {children}
    </ScrollView>
  );
}

export function Swatch({
  color,
  colors,
  selected,
  onPress,
  size = 32,
}: {
  color?: string;
  colors?: [string, string];
  selected?: boolean;
  onPress: () => void;
  size?: number;
}) {
  return (
    <PressableScale
      scaleTo={0.9}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={[styles.swatchRing, { width: size + 10, height: size + 10, borderColor: selected ? C.text : 'transparent' }]}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: 'hidden',
          backgroundColor: color ?? colors?.[0],
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: '#ffffff26',
        }}>
        {colors && (
          <View
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: size / 2,
              backgroundColor: colors[1],
            }}
          />
        )}
      </View>
    </PressableScale>
  );
}

/** Section label in small caps style. */
export function Eyebrow({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[styles.eyebrow, style]}>{children}</Text>;
}

/** Minimal slider: drag or tap anywhere on the track. */
export function Slider({
  label,
  value,
  min,
  max,
  onChange,
  format = (v) => String(Math.round(v)),
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  // Gesture worklets + React Compiler memoization don't mix (see EditorCanvas).
  'use no memo';
  const width = useSharedValue(1);
  const ratio = useSharedValue(Math.max(0, Math.min(1, (value - min) / (max - min))));
  const dragging = useSharedValue(false);
  const lastEmit = useSharedValue(-1);

  // Follow outside changes (undo, another layer) unless the finger is down.
  useEffect(() => {
    if (!dragging.get()) ratio.set(Math.max(0, Math.min(1, (value - min) / (max - min))));
  }, [value, min, max, ratio, dragging]);

  // The fill tracks the finger on the UI thread; the store only hears about
  // it every 1% of travel plus once on release.
  const fill = useAnimatedStyle(() => ({ width: ratio.get() * width.get() }));
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: ratio.get() * width.get() - 9 }] }));

  const move = (x: number, force: boolean) => {
    'worklet';
    const r = Math.max(0, Math.min(1, x / width.get()));
    ratio.set(r);
    if (force || Math.abs(r - lastEmit.get()) >= 0.01) {
      lastEmit.set(r);
      scheduleOnRN(onChange, min + r * (max - min));
    }
  };

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      dragging.set(true);
      move(e.x, true);
    })
    .onUpdate((e) => move(e.x, false))
    .onEnd((e) => move(e.x, true))
    .onFinalize(() => dragging.set(false));

  return (
    <View style={styles.sliderRow}>
      <Text style={styles.sliderLabel}>{label}</Text>
      <GestureDetector gesture={pan}>
        <View
          style={styles.sliderHit}
          onLayout={(e) => {
            width.set(e.nativeEvent.layout.width);
          }}>
          <View style={styles.sliderTrack}>
            <Animated.View style={[styles.sliderFill, fill]} />
          </View>
          <Animated.View style={[styles.sliderKnob, knob]} />
        </View>
      </GestureDetector>
      <Text style={styles.sliderValue}>{format(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: R.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tool: { minWidth: 52, alignItems: 'center', gap: 7, paddingVertical: 4 },
  toolIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: C.surfaceHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolIconBare: { backgroundColor: 'transparent', height: 30 },
  toolLabel: { ...T.medium, fontSize: 11, letterSpacing: 0.2 },
  glass: { overflow: 'hidden' },
  glassFallback: { backgroundColor: '#1D1D1DB3' },
  chip: {
    paddingHorizontal: 14,
    height: 32,
    borderRadius: R.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: C.text, borderColor: C.text },
  chipText: { ...T.medium, fontSize: 13 },
  swatchRing: { borderWidth: 1.5, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center' },
  eyebrow: {
    ...T.semibold,
    color: C.textDim,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, height: 44 },
  sliderLabel: { ...T.medium, color: C.textDim, fontSize: 13, width: 64 },
  sliderHit: { flex: 1, height: 44, justifyContent: 'center' },
  sliderTrack: { height: 3, borderRadius: 2, backgroundColor: C.line, overflow: 'hidden' },
  sliderFill: { height: 3, backgroundColor: C.accent },
  sliderKnob: {
    position: 'absolute',
    left: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.text,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  sliderValue: {
    ...T.medium,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    width: 44,
    textAlign: 'right',
  },
});
