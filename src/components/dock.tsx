import { Canvas, DashPathEffect, Group, Line, Path, RoundedRect, Skia, rect, rrect, vec } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LATEST_NEWS } from '@/lib/changelog';
import { useSettings } from '@/lib/settings';
import { useUi } from '@/lib/ui-state';
import { C } from '@/theme';

import { NewCarouselFan } from './new-carousel-fan';
import { Glass, Icon, type IconName } from './ui';

// The dock is the Seam mark: slide-shaped tiles with one horizon running
// across them. The active tab is a window onto that picture; switching tabs
// slides the window across the seams like swiping a carousel. The last tile
// is an empty, dashed slide: "add a slide" starts a new carousel.

const TILE_W = 46;
const TILE_H = 54;
const RADIUS = 13;
const GAP = 6;
const PLUS_GAP = 16;
const PAD = 7;
const tileX = (i: number) => i * (TILE_W + GAP);
const PLUS_X = tileX(3) - GAP + PLUS_GAP;
const ROW_W = PLUS_X + TILE_W;
export const DOCK_W = ROW_W + PAD * 2;
export const DOCK_H = TILE_H + PAD * 2;
/** Room to leave under scrolling content so the last row clears the dock. */
export const DOCK_SPACE = 108;

const IVORY = C.text;

const TABS: Record<string, { label: string; icon: IconName; active: IconName }> = {
  index: { label: 'Home', icon: { ios: 'house', android: 'home' }, active: { ios: 'house.fill', android: 'home' } },
  projects: {
    label: 'Projects',
    icon: { ios: 'square.stack', android: 'folder' },
    active: { ios: 'square.stack.fill', android: 'folder' },
  },
  profile: {
    label: 'You',
    icon: { ios: 'person.crop.circle', android: 'person' },
    active: { ios: 'person.crop.circle.fill', android: 'person' },
  },
};

const tileClip = (() => {
  const b = Skia.PathBuilder.Make();
  for (let i = 0; i < 3; i++) b.addRRect(rrect(rect(tileX(i), 0, TILE_W, TILE_H), RADIUS, RADIUS));
  return b.build();
})();
const plusRect = rrect(rect(PLUS_X, 0, TILE_W, TILE_H), RADIUS, RADIUS);
const plusOutline = rrect(rect(PLUS_X + 0.75, 0.75, TILE_W - 1.5, TILE_H - 1.5), RADIUS, RADIUS);

export function Dock({ state, navigation }: BottomTabBarProps) {
  // Worklet-driven paths; see EditorCanvas for why this opts out of the compiler.
  'use no memo';
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const open = useUi((s) => s.newProject);
  const setOpen = useUi((s) => s.setNewProject);
  const folder = useUi((s) => s.folder);
  const settings = useSettings();
  const bottom = Math.max(insets.bottom - 4, 12);

  // Two springs, one quick and one lazy: the window stretches across the
  // seam while it travels, then settles onto its tile.
  const lead = useSharedValue(tileX(state.index));
  const trail = useSharedValue(tileX(state.index));
  const phase = useSharedValue(0);
  const dealt = useSharedValue(0);

  useEffect(() => {
    lead.set(withSpring(tileX(state.index), { damping: 22, stiffness: 420, mass: 0.6 }));
    trail.set(withSpring(tileX(state.index), { damping: 20, stiffness: 150, mass: 0.8 }));
  }, [state.index, lead, trail]);

  useEffect(() => {
    phase.set(withRepeat(withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [phase]);

  useEffect(() => {
    dealt.set(withSpring(open ? 1 : 0, { damping: 18, stiffness: 220 }));
  }, [open, dealt]);

  const windowClip = useDerivedValue(() => {
    const a = lead.get();
    const b = trail.get();
    const left = Math.min(a, b);
    return rrect(rect(left, 0, Math.max(a, b) - left + TILE_W, TILE_H), RADIUS, RADIUS);
  });

  const horizon = useDerivedValue(() => {
    const t = phase.get();
    const y0 = TILE_H * (0.84 - t * 0.08);
    const y1 = TILE_H * (0.56 + t * 0.1);
    const y2 = TILE_H * (0.36 + t * 0.06);
    return Skia.PathBuilder.Make()
      .moveTo(0, y0)
      .cubicTo(ROW_W * 0.28, y0 + TILE_H * 0.03, ROW_W * 0.4, y1, ROW_W * 0.58, y1 - TILE_H * 0.12)
      .cubicTo(ROW_W * 0.76, y2 + TILE_H * 0.05, ROW_W * 0.88, y2, ROW_W, y2 - TILE_H * 0.04)
      .lineTo(ROW_W, TILE_H)
      .lineTo(0, TILE_H)
      .close()
      .build();
  });

  const plusFill = useDerivedValue(() => Math.min(1, Math.max(0, dealt.get())));
  const plusIcon = useAnimatedStyle(() => ({ transform: [{ rotate: `${dealt.get() * 135}deg` }] }));

  const unseenNews = settings.seenNews !== LATEST_NEWS;
  const current = state.routes[state.index]?.name;
  const origin = {
    x: screenW / 2 - DOCK_W / 2 + PAD + PLUS_X + TILE_W / 2,
    y: screenH - bottom - DOCK_H / 2,
  };

  return (
    <>
      <NewCarouselFan
        visible={open}
        origin={origin}
        dockTop={screenH - bottom - DOCK_H}
        folder={current === 'projects' ? folder : null}
        onClose={() => setOpen(false)}
      />
      <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
        <Glass style={styles.glass} interactive>
          <View style={{ width: ROW_W, height: TILE_H }}>
            <Canvas style={StyleSheet.absoluteFill}>
              {/* Resting tiles: dim panels with a ghost of the horizon. */}
              {[0, 1, 2].map((i) => (
                <RoundedRect key={i} x={tileX(i)} y={0} width={TILE_W} height={TILE_H} r={RADIUS} color="#FFFFFF10" />
              ))}
              <Group clip={tileClip}>
                <Path path={horizon} color={C.accent} opacity={0.16} />
              </Group>
              {/* Seams between the slides. */}
              {[1, 2].map((i) => (
                <Line
                  key={i}
                  p1={vec(tileX(i) - GAP / 2, 10)}
                  p2={vec(tileX(i) - GAP / 2, TILE_H - 10)}
                  color={C.accent}
                  opacity={0.32}
                  strokeWidth={1}>
                  <DashPathEffect intervals={[3, 4]} />
                </Line>
              ))}
              <Line p1={vec(PLUS_X - PLUS_GAP / 2, 4)} p2={vec(PLUS_X - PLUS_GAP / 2, TILE_H - 4)} color={C.accent} opacity={0.5} strokeWidth={1.2}>
                <DashPathEffect intervals={[3, 4]} />
              </Line>
              {/* The window: the full picture, seen through the active tab. */}
              <Group clip={windowClip}>
                <RoundedRect x={0} y={0} width={ROW_W} height={TILE_H} r={0} color={IVORY} />
                <Path path={horizon} color={C.accent} />
              </Group>
              {/* The empty slide; it fills in with the picture while the deck is out. */}
              <RoundedRect rect={plusOutline} color={C.textDim} style="stroke" strokeWidth={1.5}>
                <DashPathEffect intervals={[5, 4]} />
              </RoundedRect>
              <Group clip={plusRect} opacity={plusFill}>
                <RoundedRect x={PLUS_X} y={0} width={TILE_W} height={TILE_H} r={0} color={IVORY} />
                <Path path={horizon} color={C.accent} />
              </Group>
            </Canvas>

            {state.routes.map((route, i) => {
              const tab = TABS[route.name];
              if (!tab) return null;
              const focused = i === state.index;
              return (
                <Pressable
                  key={route.key}
                  accessibilityRole="tab"
                  accessibilityLabel={tab.label}
                  accessibilityState={{ selected: focused }}
                  onPress={() => {
                    if (open) setOpen(false);
                    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                    if (!focused && !event.defaultPrevented) {
                      Haptics.selectionAsync();
                      navigation.navigate(route.name, route.params);
                    }
                  }}
                  style={({ pressed }) => [styles.tile, { left: tileX(i) }, pressed && { opacity: 0.6 }]}>
                  <Icon name={focused ? tab.active : tab.icon} size={21} color={focused ? C.accentInk : C.textDim} />
                  {route.name === 'profile' && unseenNews && (
                    <View style={[styles.dot, focused && { borderColor: IVORY }]} />
                  )}
                </Pressable>
              );
            })}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={open ? 'Close' : 'New carousel'}
              onPress={() => {
                Haptics.impactAsync(open ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
                setOpen(!open);
              }}
              style={({ pressed }) => [styles.tile, { left: PLUS_X }, pressed && { transform: [{ scale: 0.92 }] }]}>
              <Animated.View style={plusIcon}>
                <Icon name={{ ios: 'plus', android: 'add' }} size={22} color={open ? C.accentInk : C.text} />
              </Animated.View>
            </Pressable>
          </View>
        </Glass>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  glass: {
    padding: PAD,
    borderRadius: RADIUS + PAD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
  },
  tile: {
    position: 'absolute',
    top: 0,
    width: TILE_W,
    height: TILE_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.accent,
    borderWidth: 1.5,
    borderColor: C.bg,
  },
});
