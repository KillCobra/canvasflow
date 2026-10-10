import { Canvas, Group, Path, type Transforms3d, rect } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  type SharedValue,
  cancelAnimation,
  useDerivedValue,
  useSharedValue,
  withDecay,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useEditorPrefs } from '@/lib/editor-prefs';
import { smoothStroke } from '@/lib/smooth';
import { type Doc, type Stroke, canvasSize } from '@/lib/types';
import { C, PALETTE, T } from '@/theme';

import { BrandColors } from './brand-colors';
import { ColorWell } from './color-well';
import { StrokeLine, strokePath } from './drawing-node';
import { viewMetrics } from './editor-canvas';
import { HScroll, Icon, IconButton, PressableScale, Swatch } from './ui';

export type Brush = { color: string; width: number };

/** Line widths in canvas px (a slide is 1080 wide), with the dot each shows as. */
const WIDTHS = [
  { width: 6, dot: 5 },
  { width: 14, dot: 9 },
  { width: 30, dot: 14 },
  { width: 56, dot: 20 },
];

export const DEFAULT_BRUSH_WIDTH = WIDTHS[1].width;

/**
 * Captures ink over the editor canvas while drawing. One finger draws, two
 * fingers scroll. Strokes are kept in canvas coordinates until Done.
 */
export function DrawOverlay({
  doc,
  width,
  height,
  scrollX,
  strokes,
  brush,
  onStroke,
}: {
  doc: Doc;
  width: number;
  height: number;
  scrollX: SharedValue<number>;
  strokes: Stroke[];
  brush: Brush;
  onStroke: (stroke: Stroke) => void;
}) {
  // Gesture worklets; see EditorCanvas for why this opts out of the compiler.
  'use no memo';
  const { width: W, height: H } = canvasSize(doc);
  const { vs, offsetX, offsetY, maxScroll } = viewMetrics(doc, width, height);
  /** The stroke under the finger, as flat x,y canvas points. */
  const live = useSharedValue<number[]>([]);
  const inking = useSharedValue(false);
  const scrollStart = useSharedValue(0);
  // Samples closer than this (2.5 screen points) are jitter, not shape.
  const minStep = 2.5 / vs;

  // The finished stroke is now drawn from props; drop the live copy (unless a new one has begun).
  useEffect(() => {
    if (!inking.get()) live.set([]);
  }, [strokes, inking, live]);

  const smoothInk = useEditorPrefs((s) => s.smoothInk);
  // With Smooth on, the stroke is tidied as the finger lifts: steadied, straightened
  // when it was meant to be straight, closed when it comes back round.
  // Finger wobble is measured in screen points, so it's told the zoom.
  const finish = (points: number[]) =>
    onStroke({
      points: smoothInk ? smoothStroke(points, brush.width, { scale: 1 / vs }) : points,
      color: brush.color,
      width: brush.width,
    });

  const toCanvas = (sx: number, sy: number) => {
    'worklet';
    return [(sx - offsetX + scrollX.get()) / vs, (sy - offsetY) / vs];
  };

  const ink = Gesture.Pan()
    .maxPointers(1)
    .minDistance(0)
    .onBegin((e) => {
      inking.set(true);
      live.set(toCanvas(e.x, e.y));
    })
    .onUpdate((e) => {
      if (!inking.get()) return;
      const [x, y] = toCanvas(e.x, e.y);
      const pts = live.get();
      const dx = x - pts[pts.length - 2];
      const dy = y - pts[pts.length - 1];
      if (dx * dx + dy * dy < minStep * minStep) return;
      live.modify((p) => {
        'worklet';
        p.push(x, y);
        return p;
      });
    })
    .onFinalize((_, success) => {
      if (!inking.get()) return;
      inking.set(false);
      // Cancelled (a second finger landed): that was the start of a scroll, not a mark.
      if (!success) {
        live.set([]);
        return;
      }
      scheduleOnRN(finish, live.get().slice());
    });

  const scroll = Gesture.Pan()
    .minPointers(2)
    .onStart(() => {
      inking.set(false);
      live.set([]);
      cancelAnimation(scrollX);
      scrollStart.set(scrollX.get());
    })
    .onUpdate((e) => {
      scrollX.set(Math.max(0, Math.min(maxScroll, scrollStart.get() - e.translationX)));
    })
    .onEnd((e) => {
      scrollX.set(withDecay({ velocity: -e.velocityX, clamp: [0, maxScroll] }));
    });

  const view = useDerivedValue<Transforms3d>(() => [
    { translateX: offsetX - scrollX.get() },
    { translateY: offsetY },
    { scale: vs },
  ]);
  const livePath = useDerivedValue(() => strokePath(live.get()));

  return (
    <View style={StyleSheet.absoluteFill}>
      <GestureDetector gesture={Gesture.Simultaneous(ink, scroll)}>
        <Canvas style={{ width, height }}>
          <Group transform={view}>
            {/* Same clip as the editor: ink past the canvas edge isn't part of the post. */}
            <Group clip={rect(0, 0, W, H)}>
              {strokes.map((s, i) => (
                <StrokeLine key={i} stroke={s} />
              ))}
              <Path
                path={livePath}
                style="stroke"
                strokeWidth={brush.width}
                strokeCap="round"
                strokeJoin="round"
                color={brush.color}
              />
            </Group>
          </Group>
        </Canvas>
      </GestureDetector>
      <Animated.View entering={FadeIn.delay(150)} style={styles.hint} pointerEvents="none">
        <Text style={styles.hintText}>
          One finger draws · two fingers scroll{smoothInk ? ' · strokes smooth as you lift' : ''}
        </Text>
      </Animated.View>
    </View>
  );
}

/** Brush controls shown in the bottom panel while drawing. */
export function DrawToolbar({
  brush,
  onBrush,
  canUndo,
  onUndo,
  onCancel,
  onDone,
}: {
  brush: Brush;
  onBrush: (brush: Brush) => void;
  canUndo: boolean;
  onUndo: () => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  const smoothInk = useEditorPrefs((s) => s.smoothInk);
  const setSmoothInk = useEditorPrefs((s) => s.setSmoothInk);
  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>Draw</Text>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setSmoothInk(!smoothInk);
          }}
          accessibilityRole="switch"
          accessibilityState={{ checked: smoothInk }}
          accessibilityLabel="Smooth strokes"
          style={[styles.smooth, smoothInk && styles.smoothOn]}>
          <Icon name={{ ios: 'scribble.variable', android: 'gesture' }} size={14} color={smoothInk ? C.accentInk : C.textDim} />
          <Text style={[styles.smoothText, smoothInk && { color: C.accentInk }]}>Smooth</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <IconButton
          label="Undo stroke"
          icon={{ ios: 'arrow.uturn.backward', android: 'undo' }}
          disabled={!canUndo}
          onPress={onUndo}
        />
        <IconButton label="Cancel" icon={{ ios: 'xmark', android: 'close' }} onPress={onCancel} />
        <IconButton label="Done" tone="accent" icon={{ ios: 'checkmark', android: 'check' }} onPress={onDone} />
      </View>
      <View style={styles.widths}>
        {WIDTHS.map((w) => {
          const on = brush.width === w.width;
          return (
            <PressableScale
              key={w.width}
              accessibilityRole="button"
              accessibilityLabel={`Line width ${w.width}`}
              scaleTo={0.9}
              onPress={() => {
                Haptics.selectionAsync();
                onBrush({ ...brush, width: w.width });
              }}
              style={[styles.width, on && styles.widthOn]}>
              <View style={[styles.dot, { width: w.dot, height: w.dot, borderRadius: w.dot / 2, backgroundColor: brush.color }]} />
            </PressableScale>
          );
        })}
      </View>
      <HScroll gap={2}>
        <ColorWell value={brush.color} onChange={(color) => onBrush({ ...brush, color })} />
        <BrandColors current={brush.color} size={26} onPick={(color) => onBrush({ ...brush, color })} />
        {PALETTE.map((c) => (
          <Swatch key={c} color={c} size={26} selected={brush.color === c} onPress={() => onBrush({ ...brush, color: c })} />
        ))}
      </HScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#000000A0',
  },
  hintText: { ...T.medium, color: C.text, fontSize: 12 },
  panel: { flex: 1, gap: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 18, paddingRight: 8, height: 44 },
  title: { ...T.display, fontSize: 22 },
  smooth: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginLeft: 12,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.surface,
  },
  smoothOn: { backgroundColor: C.accent },
  smoothText: { ...T.semibold, color: C.textDim, fontSize: 12 },
  widths: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  width: {
    width: 40,
    height: 34,
    borderRadius: 12,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  widthOn: { borderColor: C.text },
  // A faint rim keeps dark ink visible on the dark tile.
  dot: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#FFFFFF40' },
});
