import {
  Canvas,
  Circle,
  Group,
  Image,
  LinearGradient,
  Path,
  Rect,
  RoundedRect,
  Skia,
  rect,
  rrect,
  vec,
} from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TemplateStrip } from '@/components/template-thumb';
import { Icon, type IconName, PressableScale } from '@/components/ui';
import { isScene, useSceneImage } from '@/lib/samples';
import { requestSample, setInterests, setOnboarded } from '@/lib/settings';
import { INTERESTS, type Interest, TEMPLATES } from '@/lib/templates';
import { C, R, T } from '@/theme';

const PAGES = [
  {
    title: 'One picture,\nmany slides.',
    body: 'Seam gives you one wide canvas. Swipe through it on Instagram and the photo flows across every edge.',
  },
  {
    title: 'Start from\na template.',
    body: 'Drop photos into frames, or let Magic arrange them for you. Polaroids, arches, grids and more.',
  },
  {
    title: 'Post it\nyour way.',
    body: 'Save the slides in swipe order, the whole panorama, or a swipe video for Reels. No watermark, ever.',
  },
  {
    title: 'What will\nyou make?',
    body: 'Pick a few and we’ll put the right templates up front.',
  },
];

const INTERESTS_PAGE = 3;

/** First-run introduction. Skippable from every page; shown once. */
export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const [picks, setPicks] = useState<string[]>([]);
  // The interests page scrolls on short screens, so it needs the pager's height.
  const [pageHeight, setPageHeight] = useState(0);
  const list = useRef<FlatList>(null);
  const last = page === PAGES.length - 1;

  const toggle = (id: string) => {
    Haptics.selectionAsync();
    setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const finish = (sample = false) => {
    // Skipping keeps whatever was picked so far.
    setInterests(picks);
    setOnboarded();
    if (sample) requestSample();
    router.back();
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.top}>
        <View style={styles.dots}>
          {PAGES.map((_, i) => (
            <View key={i} style={[styles.dot, i === page && styles.dotOn]} />
          ))}
        </View>
        <Pressable onPress={() => finish()} hitSlop={12} accessibilityRole="button">
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      <FlatList
        ref={list}
        data={PAGES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => String(i)}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        onLayout={(e) => setPageHeight(e.nativeEvent.layout.height)}
        extraData={[picks, pageHeight]}
        renderItem={({ item, index }) =>
          index === INTERESTS_PAGE ? (
            <ScrollView
              style={{ width, height: pageHeight || undefined }}
              contentContainerStyle={{ paddingHorizontal: 28, gap: 22, paddingBottom: 12 }}>
              <View style={{ gap: 12 }}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.body}>{item.body}</Text>
              </View>
              <View style={styles.tiles}>
                {INTERESTS.map((interest) => (
                  <InterestTile
                    key={interest.id}
                    interest={interest}
                    width={(width - 56 - 12) / 2}
                    selected={picks.includes(interest.id)}
                    onPress={() => toggle(interest.id)}
                  />
                ))}
              </View>
            </ScrollView>
          ) : (
            <View style={{ width, paddingHorizontal: 28, gap: 28 }}>
              <View style={styles.art}>
                {index === 0 && <SwipeDemo width={width - 56} />}
                {index === 1 && <TemplatesDemo width={width - 56} />}
                {index === 2 && <ExportDemo />}
              </View>
              <View style={{ gap: 12 }}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.body}>{item.body}</Text>
              </View>
            </View>
          )
        }
      />

      <View style={styles.footer}>
        <PressableScale
          onPress={() => {
            Haptics.selectionAsync();
            if (last) finish();
            else list.current?.scrollToIndex({ index: page + 1 });
          }}
          style={styles.cta}>
          <Text style={styles.ctaText}>{last ? 'Start creating' : 'Continue'}</Text>
        </PressableScale>
        {last && (
          <Animated.View entering={FadeIn}>
            <Pressable onPress={() => finish(true)} hitSlop={8}>
              <Text style={styles.secondary}>Open a sample to play with</Text>
            </Pressable>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

/**
 * A landscape spread across three slides, with a phone-sized window
 * swiping across it: the whole idea of the app in one loop.
 */
function SwipeDemo({ width }: { width: number }) {
  // Worklet-driven; see EditorCanvas for why this opts out of the compiler.
  'use no memo';
  const slide = width * 0.5;
  const H = slide * 1.25;
  const W = slide * 3;
  const scale = width / W;
  const t = useSharedValue(0);

  useEffect(() => {
    const ease = Easing.inOut(Easing.cubic);
    t.set(
      withRepeat(
        withSequence(
          withDelay(700, withTiming(1, { duration: 700, easing: ease })),
          withDelay(700, withTiming(2, { duration: 700, easing: ease })),
          withDelay(900, withTiming(0, { duration: 900, easing: ease })),
        ),
        -1,
      ),
    );
  }, [t]);

  const hills = Skia.PathBuilder.Make()
    .moveTo(0, H * 0.72)
    .cubicTo(W * 0.2, H * 0.55, W * 0.35, H * 0.8, W * 0.55, H * 0.62)
    .cubicTo(W * 0.72, H * 0.48, W * 0.85, H * 0.7, W, H * 0.6)
    .lineTo(W, H)
    .lineTo(0, H)
    .close()
    .build();
  const near = Skia.PathBuilder.Make()
    .moveTo(0, H * 0.86)
    .cubicTo(W * 0.3, H * 0.74, W * 0.6, H * 0.95, W, H * 0.8)
    .lineTo(W, H)
    .lineTo(0, H)
    .close()
    .build();

  const windowX = useDerivedValue(() => t.get() * slide);
  const shadeLeft = useDerivedValue(() => t.get() * slide);
  const shadeRightX = useDerivedValue(() => t.get() * slide + slide);
  const shadeRightW = useDerivedValue(() => W - (t.get() * slide + slide));

  return (
    <Canvas style={{ width, height: H * scale + 8 }}>
      <Group transform={[{ scale }, { translateY: 4 / scale }]}>
        <Group clip={rrect(rect(0, 0, W, H), 18, 18)}>
          <Rect x={0} y={0} width={W} height={H}>
            <LinearGradient start={vec(0, 0)} end={vec(0, H)} colors={['#F6D5C4', '#E8DDCB']} />
          </Rect>
          <Circle cx={W * 0.62} cy={H * 0.38} r={slide * 0.22} color="#E07A5F" />
          <Path path={hills} color="#9C8B73" />
          <Path path={near} color="#5B5650" />
          {/* Everything outside the "phone" is dimmed. */}
          <Rect x={0} y={0} width={shadeLeft} height={H} color="#0A0A0AB0" />
          <Rect x={shadeRightX} y={0} width={shadeRightW} height={H} color="#0A0A0AB0" />
        </Group>
        <RoundedRect x={windowX} y={0} width={slide} height={H} r={16} color={C.text} style="stroke" strokeWidth={5} />
      </Group>
    </Canvas>
  );
}

function TemplatesDemo({ width }: { width: number }) {
  const picks = ['polaroid-wall', 'arches', 'circles']
    .map((id) => TEMPLATES.find((t) => t.id === id))
    .filter((t) => !!t);
  return (
    <View style={{ gap: 12, alignItems: 'center' }}>
      {picks.map((t, i) => (
        <Animated.View key={t.id} entering={FadeIn.delay(i * 140)}>
          <TemplateStrip template={t} height={104} maxWidth={width} />
        </Animated.View>
      ))}
    </View>
  );
}

/** A pickable interest, shown over one of the sample scenes. */
function InterestTile({
  interest,
  width,
  selected,
  onPress,
}: {
  interest: Interest;
  width: number;
  selected: boolean;
  onPress: () => void;
}) {
  const image = useSceneImage(isScene(interest.scene) ? interest.scene : 'sunset');
  const height = 96;
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.95}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={interest.label}
      style={[styles.tile, { width, height }, selected && styles.tileOn]}>
      <Canvas style={StyleSheet.absoluteFill}>
        {image && <Image image={image} x={0} y={0} width={width} height={height} fit="cover" />}
        <Rect x={0} y={0} width={width} height={height}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, height)}
            colors={selected ? ['#0A0A0A10', '#0A0A0AB0'] : ['#0A0A0A40', '#0A0A0AD0']}
          />
        </Rect>
      </Canvas>
      <Text style={styles.tileLabel} numberOfLines={2}>
        {interest.label}
      </Text>
      <View style={[styles.check, selected && styles.checkOn]}>
        {selected && <Icon name={{ ios: 'checkmark', android: 'check' }} size={12} color={C.accentInk} />}
      </View>
    </PressableScale>
  );
}

function ExportDemo() {
  const rows: { icon: IconName; title: string; detail: string }[] = [
    { icon: { ios: 'rectangle.split.3x1', android: 'view_carousel' }, title: 'Carousel', detail: 'Slides in swipe order' },
    { icon: { ios: 'pano', android: 'panorama' }, title: 'Panorama', detail: 'One wide image' },
    { icon: { ios: 'play.rectangle', android: 'movie' }, title: 'Swipe video', detail: 'For Reels and TikTok' },
  ];
  return (
    <View style={{ gap: 10, alignSelf: 'stretch' }}>
      {rows.map((r, i) => (
        <Animated.View key={r.title} entering={FadeIn.delay(i * 140)} style={styles.exportRow}>
          <View style={styles.exportIcon}>
            <Icon name={r.icon} size={22} color={C.accent} />
          </View>
          <View>
            <Text style={styles.exportTitle}>{r.title}</Text>
            <Text style={styles.exportDetail}>{r.detail}</Text>
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 28, height: 44 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.line },
  dotOn: { width: 20, backgroundColor: C.text },
  skip: { ...T.medium, color: C.textDim, fontSize: 15 },
  art: { minHeight: 300, alignItems: 'center', justifyContent: 'center' },
  title: { ...T.display, fontSize: 46, lineHeight: 50, letterSpacing: -0.5 },
  body: { ...T.body, color: C.textDim, fontSize: 16, lineHeight: 24 },
  footer: { paddingHorizontal: 28, gap: 16 },
  cta: { height: 54, borderRadius: R.pill, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },
  ctaText: { ...T.semibold, color: C.bg, fontSize: 16 },
  secondary: { ...T.medium, color: C.accent, fontSize: 15, textAlign: 'center' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    borderRadius: R.md,
    overflow: 'hidden',
    backgroundColor: C.surfaceHi,
    borderWidth: 2,
    borderColor: 'transparent',
    justifyContent: 'flex-end',
    padding: 12,
  },
  tileOn: { borderColor: C.accent },
  tileLabel: { ...T.semibold, fontSize: 15, lineHeight: 19 },
  check: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#F2EFE9B3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: C.accent, borderColor: C.accent },
  exportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: R.lg,
    backgroundColor: C.surface,
  },
  exportIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  exportTitle: { ...T.semibold, fontSize: 16 },
  exportDetail: { ...T.body, color: C.textDim, fontSize: 13, marginTop: 2 },
});
