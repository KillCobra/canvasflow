import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation,
  type SharedValue,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { addToPlan } from '@/lib/grid-plan';
import { createDoc, createGridDoc, listFolders, saveProject } from '@/lib/projects';
import { defaultAspect, defaultSlides } from '@/lib/settings';
import { ASPECTS, type AspectId, SLIDE_WIDTH } from '@/lib/types';
import { C, T } from '@/theme';

import { BrandMark } from './brand-mark';
import { Glass, Icon } from './ui';

// "Deal a carousel": the + fans out a hand of blank slides, one per shape,
// with the same horizon running across them. Tap a slide to start.

type Card = { kind: 'format'; aspect: AspectId; name: string } | { kind: 'grid' } | { kind: 'templates' };

const CARDS: Card[] = [
  { kind: 'format', aspect: '1:1', name: 'Square' },
  { kind: 'format', aspect: '4:5', name: 'Portrait' },
  { kind: 'format', aspect: '9:16', name: 'Story' },
  { kind: 'format', aspect: '3:4', name: 'Tall' },
  { kind: 'grid' },
  { kind: 'templates' },
];
const MID = (CARDS.length - 1) / 2;
const STAGGER = 0.07;
const PAPER = '#F4EFE6';

export function NewCarouselFan({
  visible,
  origin,
  dockTop,
  folder,
  onClose,
}: {
  visible: boolean;
  /** Where the + sits; the cards are dealt from (and return to) here. */
  origin: { x: number; y: number };
  dockTop: number;
  folder: string | null;
  onClose: () => void;
}) {
  // Worklet-driven; see EditorCanvas for why this opts out of the compiler.
  'use no memo';
  const { width: screenW } = useWindowDimensions();
  // Rendered while open, and while the cards are gathered back after closing.
  const [closing, setClosing] = useState(false);
  const [slides, setSlides] = useState(defaultSlides);
  const progress = useSharedValue(0);

  // Each opening starts at the default slide count.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setSlides(defaultSlides());
    setClosing(!visible);
  }
  useEffect(() => {
    if (visible) {
      progress.set(withSpring(1, { damping: 16, stiffness: 170, mass: 0.9 }));
    } else {
      progress.set(
        withTiming(0, { duration: 200 }, (done) => {
          if (done) scheduleOnRN(setClosing, false);
        }),
      );
    }
  }, [visible, progress]);

  const scrim = useAnimatedStyle(() => ({ opacity: Math.min(1, progress.get()) }));
  const header = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, progress.get()));
    return { opacity: p, transform: [{ translateY: (1 - p) * 18 }] };
  });

  if (!visible && !closing) return null;

  const folderName = folder ? listFolders().find((f) => f.id === folder)?.name : undefined;
  const preferred = defaultAspect();
  const step = Math.min(78, (screenW - 36) / CARDS.length);
  const cardW = step - 8;
  const baseline = dockTop - 46;
  const tallest = cardW * (ASPECTS['9:16'].height / SLIDE_WIDTH);

  const create = (aspect: AspectId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const doc = createDoc(aspect, slides);
    if (folderName) doc.folder = folder!;
    saveProject(doc, { create: true });
    onClose();
    router.push(`/editor/${doc.id}`);
  };

  /** A grid puzzle (two rows to start), queued on the grid planner. */
  const createGrid = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const doc = createGridDoc(2);
    if (folderName) doc.folder = folder!;
    saveProject(doc, { create: true });
    addToPlan(doc.id);
    onClose();
    router.push(`/editor/${doc.id}`);
  };

  const change = (d: number) => {
    const next = Math.max(1, Math.min(10, slides + d));
    if (next !== slides) Haptics.selectionAsync();
    setSlides(next);
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, scrim]}>
        <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.scrim]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>

      <Animated.View
        pointerEvents="box-none"
        style={[styles.header, { top: baseline - tallest - 178 }, header]}>
        <Text style={styles.title}>Deal a new carousel</Text>
        <Text style={styles.subtitle}>{folderName ? `Pick a shape · it goes in ${folderName}` : 'Pick a shape to start'}</Text>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            onClose();
            router.push('/photos');
          }}
          hitSlop={8}
          style={styles.photosLink}
          accessibilityRole="button">
          <Icon name={{ ios: 'photo.on.rectangle.angled', android: 'add_photo_alternate' }} size={14} color={C.accent} />
          <Text style={styles.photosLinkText}>Start from photos</Text>
        </Pressable>
        <Glass style={styles.stepper}>
          <Pressable onPress={() => change(-1)} hitSlop={10} disabled={slides <= 1} accessibilityLabel="Fewer slides">
            <Icon name={{ ios: 'minus', android: 'remove' }} size={15} color={slides <= 1 ? C.textFaint : C.text} />
          </Pressable>
          <Text style={styles.stepText}>
            {slides} {slides === 1 ? 'slide' : 'slides'}
          </Text>
          <Pressable onPress={() => change(1)} hitSlop={10} disabled={slides >= 10} accessibilityLabel="More slides">
            <Icon name={{ ios: 'plus', android: 'add' }} size={15} color={slides >= 10 ? C.textFaint : C.text} />
          </Pressable>
        </Glass>
      </Animated.View>

      {CARDS.map((card, i) => {
        const offset = i - MID;
        const h = card.kind === 'format' ? cardW * (ASPECTS[card.aspect].height / SLIDE_WIDTH) : cardW * (card.kind === 'grid' ? 1.1 : 1.25);
        const cx = screenW / 2 + offset * step;
        return (
          <DealtCard
            key={i}
            index={i}
            progress={progress}
            x={cx - cardW / 2}
            y={baseline - h + offset * offset * 6}
            w={cardW}
            h={h}
            rotate={offset * 5.5}
            from={{ x: origin.x - cx, y: origin.y - (baseline - h / 2) }}
            onPress={() => {
              if (card.kind === 'templates') {
                Haptics.selectionAsync();
                onClose();
                router.push('/templates');
              } else if (card.kind === 'grid') createGrid();
              else create(card.aspect);
            }}
            label={
              card.kind === 'format'
                ? `New ${card.name} ${card.aspect} carousel`
                : card.kind === 'grid'
                  ? 'New grid puzzle for your profile'
                  : 'Start from a template'
            }>
            {card.kind === 'format' ? (
              <BlankSlide aspect={card.aspect} name={card.name} w={cardW} h={h} seamX={cx - cardW / 2} preferred={card.aspect === preferred} />
            ) : card.kind === 'grid' ? (
              <GridCard w={cardW} h={h} />
            ) : (
              <View style={[styles.card, styles.templates, { width: cardW, height: h }]}>
                <BrandMark width={cardW * 0.62} />
                <Text style={styles.templatesText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  Templates
                </Text>
              </View>
            )}
          </DealtCard>
        );
      })}
    </View>
  );
}

function DealtCard({
  index,
  progress,
  x,
  y,
  w,
  h,
  rotate,
  from,
  onPress,
  label,
  children,
}: {
  index: number;
  progress: SharedValue<number>;
  x: number;
  y: number;
  w: number;
  h: number;
  rotate: number;
  from: { x: number; y: number };
  onPress: () => void;
  label: string;
  children: ReactNode;
}) {
  // Gesture-free but animated per frame; see EditorCanvas for the compiler opt-out.
  'use no memo';
  const start = index * STAGGER;
  const style = useAnimatedStyle(() => {
    // Each card leaves a beat after the one before it, and all land together
    // (t = 1 when the spring reaches 1; it may overshoot a little past that).
    const t = Math.max(0, (progress.get() - start) / (1 - start));
    const k = interpolate(t, [0, 1], [0, 1], Extrapolation.EXTEND);
    return {
      opacity: Math.min(1, t * 2.5),
      transform: [
        { translateX: from.x * (1 - k) },
        { translateY: from.y * (1 - k) },
        // Pivot at the bottom edge, like cards held in a hand.
        { translateY: h / 2 },
        { rotate: `${rotate * k}deg` },
        { translateY: -h / 2 },
        { scale: 0.35 + 0.65 * Math.min(k, 1.06) },
      ],
    };
  });
  return (
    <Animated.View style={[styles.dealt, { left: x, top: y, width: w, height: h }, style]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [{ width: w, height: h }, pressed && { transform: [{ translateY: -10 }, { scale: 1.04 }] }]}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

/** A blank slide in its true shape, with its share of the horizon across the hand. */
function BlankSlide({
  aspect,
  name,
  w,
  h,
  seamX,
  preferred,
}: {
  aspect: AspectId;
  name: string;
  w: number;
  h: number;
  /** The card's left edge on screen, so the horizon continues from card to card. */
  seamX: number;
  preferred: boolean;
}) {
  const b = Skia.PathBuilder.Make();
  const at = (lx: number) => {
    const gx = seamX + lx;
    return h - (h * 0.24 + Math.sin(gx / 46) * 5 + Math.sin(gx / 19 + 1) * 2.5);
  };
  b.moveTo(0, at(0));
  for (let lx = 4; lx <= w; lx += 4) b.lineTo(lx, at(lx));
  b.lineTo(w, h).lineTo(0, h).close();
  const horizon = b.build();
  return (
    <View style={[styles.card, { width: w, height: h, backgroundColor: PAPER }, preferred && styles.preferred]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Path path={horizon} color={C.accent} />
      </Canvas>
      <Text style={styles.cardRatio}>{aspect}</Text>
      <Text style={styles.cardName}>{name}</Text>
      {preferred && <View style={styles.preferredDot} />}
    </View>
  );
}

/** A grid puzzle: one picture cut into profile tiles. */
function GridCard({ w, h }: { w: number; h: number }) {
  const pad = 6;
  const gap = 2;
  const cell = (w - pad * 2 - gap * 2) / 3;
  const cellH = cell * (4 / 3);
  const gridH = cellH * 2 + gap;
  const top = 8;
  return (
    <View style={[styles.card, { width: w, height: h, backgroundColor: PAPER }]}>
      <View style={{ position: 'absolute', left: pad, top, width: w - pad * 2, height: gridH }}>
        {Array.from({ length: 6 }, (_, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: (i % 3) * (cell + gap),
              top: Math.floor(i / 3) * (cellH + gap),
              width: cell,
              height: cellH,
              borderRadius: 2,
              overflow: 'hidden',
              backgroundColor: '#E6DDCC',
            }}>
            {/* The same horizon runs through every tile. */}
            <View
              style={{
                position: 'absolute',
                left: -(i % 3) * (cell + gap),
                top: -Math.floor(i / 3) * (cellH + gap) + gridH * 0.55,
                width: w,
                height: gridH,
                backgroundColor: C.accent,
                transform: [{ rotate: '-8deg' }],
              }}
            />
          </View>
        ))}
      </View>
      <Text style={[styles.cardName, { position: 'absolute', left: 0, bottom: 6, marginTop: 0 }]}>Grid</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: '#050505C7' },
  header: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 6 },
  title: { ...T.display, fontSize: 34, letterSpacing: -0.3 },
  subtitle: { ...T.body, color: C.textDim, fontSize: 14 },
  photosLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  photosLinkText: { ...T.medium, color: C.accent, fontSize: 14 },
  stepper: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 18,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
  },
  stepText: { ...T.semibold, fontSize: 14, minWidth: 64, textAlign: 'center', fontVariant: ['tabular-nums'] },
  // The shadow sits on the moving wrapper: the card itself clips its contents.
  dealt: {
    position: 'absolute',
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  card: { borderRadius: 10, overflow: 'hidden' },
  preferred: { borderWidth: 2, borderColor: C.accent },
  preferredDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: C.accentInk,
  },
  cardRatio: { ...T.display, color: C.accentInk, fontSize: 21, marginTop: 6, marginLeft: 8 },
  cardName: { ...T.medium, color: '#16120B99', fontSize: 10, marginLeft: 8, marginTop: -2 },
  templates: {
    backgroundColor: C.surfaceHi,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
  },
  templatesText: { ...T.medium, color: C.text, fontSize: 11 },
});
