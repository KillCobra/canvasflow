import { Canvas, Group } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  type SharedValue,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { contrastInk } from '@/lib/color';
import { GRIDS } from '@/lib/layouts';
import { SLIDE_LAYOUTS, type SlideContent, slideContents } from '@/lib/slide-layouts';
import { ASPECTS, type Doc, SLIDE_WIDTH } from '@/lib/types';
import { C, R, T } from '@/theme';

import { DocRenderer } from './doc-renderer';
import { Eyebrow, Icon, PressableScale } from './ui';

const TILE = 64;

/** Ink for any text a layout adds, so it reads on the project's background. */
export function inkFor(doc: Pick<Doc, 'background'>) {
  return contrastInk(doc.background.kind === 'solid' ? doc.background.color : doc.background.colors[0]);
}

/**
 * Picks what a new slide starts with: blank, a single-slide layout or a grid
 * of empty cells. `index` is where it will be inserted (only used for the label).
 */
export function NewSlideSheet({
  doc,
  index,
  onPick,
  onClose,
}: {
  doc: Doc;
  index: number;
  onPick: (content: SlideContent) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const where =
    index >= doc.slideCount ? 'At the end' : index === 0 ? 'At the start' : `Between ${index} and ${index + 1}`;
  const pick = (content: SlideContent) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPick(content);
  };

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(160)}
      style={[StyleSheet.absoluteFill, styles.backdrop]}>
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      <Animated.View
        entering={SlideInDown.springify().damping(22).stiffness(220)}
        exiting={SlideOutDown.duration(200)}
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
        <View style={styles.grabber} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>New slide</Text>
          <Text style={styles.meta}>{where}</Text>
        </View>

        <PressableScale onPress={() => pick({ kind: 'blank' })} scaleTo={0.98} style={styles.blank}>
          <SlidePreview doc={doc} content={{ kind: 'blank' }} width={34} />
          <View style={{ flex: 1 }}>
            <Text style={styles.blankTitle}>Blank</Text>
            <Text style={styles.blankDetail}>Just the background</Text>
          </View>
          <Icon name={{ ios: 'chevron.right', android: 'chevron_right' }} size={14} color={C.textDim} />
        </PressableScale>

        <Eyebrow style={styles.eyebrow}>Layouts</Eyebrow>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.stripContent}>
          {SLIDE_LAYOUTS.map((l) => (
            <Option key={l.id} label={l.label} onPress={() => pick({ kind: 'layout', id: l.id })}>
              <SlidePreview doc={doc} content={{ kind: 'layout', id: l.id }} width={TILE} />
            </Option>
          ))}
        </ScrollView>

        <Eyebrow style={styles.eyebrow}>Grids</Eyebrow>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.stripContent}>
          {GRIDS.map((g) => (
            <Option key={g.id} label={g.label} onPress={() => pick({ kind: 'grid', id: g.id })}>
              <SlidePreview doc={doc} content={{ kind: 'grid', id: g.id }} width={TILE} />
            </Option>
          ))}
        </ScrollView>
      </Animated.View>
    </Animated.View>
  );
}

function Option({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={label} onPress={onPress} scaleTo={0.94} style={styles.option}>
      {children}
      <Text style={styles.optionLabel} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** The new slide drawn small, on the project's own background. */
function SlidePreview({ doc, content, width }: { doc: Doc; content: SlideContent; width: number }) {
  const H = ASPECTS[doc.aspect].height;
  const k = width / SLIDE_WIDTH;
  const preview: Doc = { ...doc, slideCount: 1, layers: slideContents(content, 0, doc.aspect, inkFor(doc)) };
  return (
    <View style={[styles.thumb, { width, height: H * k }]}>
      <Canvas style={{ width, height: H * k }}>
        <Group transform={[{ scale: k }]}>
          <DocRenderer doc={preview} images={{}} />
        </Group>
      </Canvas>
    </View>
  );
}

const TAB = 26;

/**
 * A quiet "+" just past the last slide in the editor, riding along with the
 * canvas scroll. `x`/`y` are its center in screen space at scroll 0.
 */
export function AddSlideTab({
  scrollX,
  x,
  y,
  onPress,
}: {
  scrollX: SharedValue<number>;
  x: number;
  y: number;
  onPress: () => void;
}) {
  // Worklet closure; see EditorCanvas for why this opts out of the compiler.
  'use no memo';
  const follow = useAnimatedStyle(() => ({ transform: [{ translateX: x - TAB / 2 - scrollX.get() }] }));
  return (
    <Animated.View style={[styles.tab, { top: y - TAB / 2 }, follow]}>
      <PressableScale accessibilityRole="button" accessibilityLabel="Add slide" hitSlop={10} scaleTo={0.85} onPress={onPress}>
        <View style={styles.tabCircle}>
          <Icon name={{ ios: 'plus', android: 'add' }} size={13} color={C.text} />
        </View>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: '#000000A6', zIndex: 20 },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 18,
    paddingTop: 10,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
  },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: C.line, marginBottom: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 2 },
  title: { ...T.display, fontSize: 32 },
  meta: { ...T.medium, color: C.textDim, fontSize: 12 },
  blank: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: R.lg,
    backgroundColor: C.surfaceHi,
  },
  blankTitle: { ...T.semibold, fontSize: 16 },
  blankDetail: { ...T.body, color: C.textDim, fontSize: 13, marginTop: 2 },
  eyebrow: { marginTop: 6, paddingHorizontal: 2 },
  // Strips run edge to edge while their first tile lines up with the sheet's padding.
  strip: { marginHorizontal: -18, flexGrow: 0 },
  stripContent: { gap: 12, paddingHorizontal: 18, alignItems: 'flex-end' },
  option: { width: TILE, alignItems: 'center', gap: 6 },
  optionLabel: { ...T.medium, color: C.textDim, fontSize: 11 },
  thumb: {
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
    backgroundColor: C.surfaceHi,
  },
  tab: { position: 'absolute', left: 0 },
  tabCircle: {
    width: TAB,
    height: TAB,
    borderRadius: TAB / 2,
    backgroundColor: '#FFFFFF1F',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FFFFFF33',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
