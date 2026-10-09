import { Canvas, Group } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { layersOnSlide } from '@/lib/geometry';
import type { ImageMap } from '@/lib/images';
import { useEditor } from '@/lib/store';
import { ASPECTS, type Doc, MAX_SLIDES, SLIDE_WIDTH } from '@/lib/types';
import { C, T } from '@/theme';

import { DocRenderer } from './doc-renderer';
import { IconButton } from './ui';

const TILE_W = 62;
const GAP = 10;
const STEP = TILE_W + GAP;
const SPRING = { damping: 20, stiffness: 300 };

/** Slide strip: tap to jump, long-press and drag to reorder. */
export function SlidesPanel({
  images,
  focused,
  onFocus,
  onClose,
}: {
  images: ImageMap;
  focused: number;
  onFocus: (i: number) => void;
  onClose: () => void;
}) {
  const doc = useEditor((s) => s.doc!);
  const { insertSlide, removeSlide, moveSlide, duplicateSlide } = useEditor.getState();
  const count = doc.slideCount;
  const current = Math.min(focused, count - 1);
  const tileH = (TILE_W * ASPECTS[doc.aspect].height) / SLIDE_WIDTH;

  const move = (from: number, to: number) => {
    if (to < 0 || to >= count || from === to) return;
    moveSlide(from, to);
    onFocus(to);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const confirmDelete = () => {
    if (count <= 1) return;
    Alert.alert(`Delete slide ${current + 1}?`, 'Anything only on this slide is removed. You can undo this.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          removeSlide(current);
          onFocus(Math.max(0, current - 1));
        },
      },
    ]);
  };

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>
          Slide {current + 1} <Text style={styles.titleDim}>of {count}</Text>
        </Text>
        <View style={styles.actions}>
          <IconButton
            label="Move left"
            icon={{ ios: 'chevron.left', android: 'chevron_left' }}
            disabled={current === 0}
            onPress={() => move(current, current - 1)}
          />
          <IconButton
            label="Move right"
            icon={{ ios: 'chevron.right', android: 'chevron_right' }}
            disabled={current === count - 1}
            onPress={() => move(current, current + 1)}
          />
          <IconButton
            label="Duplicate slide"
            icon={{ ios: 'plus.square.on.square', android: 'content_copy' }}
            disabled={count >= MAX_SLIDES}
            onPress={() => {
              duplicateSlide(current);
              onFocus(current + 1);
            }}
          />
          <IconButton
            label="Add slide after"
            icon={{ ios: 'plus', android: 'add' }}
            disabled={count >= MAX_SLIDES}
            onPress={() => {
              insertSlide(current + 1);
              onFocus(current + 1);
            }}
          />
          <IconButton
            label="Delete slide"
            icon={{ ios: 'trash', android: 'delete' }}
            disabled={count <= 1}
            onPress={confirmDelete}
          />
          <IconButton label="Done" icon={{ ios: 'checkmark', android: 'check' }} onPress={onClose} />
        </View>
      </View>

      <SortableStrip
        // Remount on any structural change so positions start from identity.
        key={`${count}:${doc.updatedAt}`}
        doc={doc}
        images={images}
        tileH={tileH}
        current={current}
        onTap={onFocus}
        onMove={move}
      />
      <Text style={styles.hint}>Hold a slide to drag it into a new spot.</Text>
    </View>
  );
}

function SortableStrip({
  doc,
  images,
  tileH,
  current,
  onTap,
  onMove,
}: {
  doc: Doc;
  images: ImageMap;
  tileH: number;
  current: number;
  onTap: (i: number) => void;
  onMove: (from: number, to: number) => void;
}) {
  // Worklets; see EditorCanvas for why this opts out of the compiler.
  'use no memo';
  const count = doc.slideCount;
  /** positions[slide] = slot it currently occupies while dragging. */
  const positions = useSharedValue(Array.from({ length: count }, (_, i) => i));
  const dragging = useSharedValue(-1);
  const dragX = useSharedValue(0);

  useEffect(() => {
    positions.set(Array.from({ length: count }, (_, i) => i));
  }, [count, positions]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 18, height: tileH + 30 }}>
      <View style={{ width: count * STEP - GAP, height: tileH + 22 }}>
        {Array.from({ length: count }, (_, i) => (
          <Tile
            key={i}
            index={i}
            doc={doc}
            images={images}
            tileH={tileH}
            selected={i === current}
            count={count}
            positions={positions}
            dragging={dragging}
            dragX={dragX}
            onTap={onTap}
            onMove={onMove}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function Tile({
  index,
  doc,
  images,
  tileH,
  selected,
  count,
  positions,
  dragging,
  dragX,
  onTap,
  onMove,
}: {
  index: number;
  doc: Doc;
  images: ImageMap;
  tileH: number;
  selected: boolean;
  count: number;
  positions: SharedValue<number[]>;
  dragging: SharedValue<number>;
  dragX: SharedValue<number>;
  onTap: (i: number) => void;
  onMove: (from: number, to: number) => void;
}) {
  'use no memo';
  const start = useSharedValue(0);
  const tick = () => Haptics.selectionAsync();
  const lift = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

  const pan = Gesture.Pan()
    .activateAfterLongPress(220)
    .onStart(() => {
      dragging.set(index);
      start.set(positions.get()[index] * STEP);
      dragX.set(start.get());
      scheduleOnRN(lift);
    })
    .onUpdate((e) => {
      const x = Math.max(0, Math.min((count - 1) * STEP, start.get() + e.translationX));
      dragX.set(x);
      const slot = Math.round(x / STEP);
      const pos = positions.get();
      const from = pos[index];
      if (slot !== from) {
        // Shift the tiles between the old and new slot by one.
        const next = pos.map((p, i) => {
          if (i === index) return slot;
          if (from < slot && p > from && p <= slot) return p - 1;
          if (from > slot && p < from && p >= slot) return p + 1;
          return p;
        });
        positions.set(next);
        scheduleOnRN(tick);
      }
    })
    .onFinalize(() => {
      if (dragging.get() !== index) return;
      const to = positions.get()[index];
      dragging.set(-1);
      if (to !== index) scheduleOnRN(onMove, index, to);
    });

  const tap = Gesture.Tap().onEnd(() => {
    scheduleOnRN(onTap, index);
  });

  const style = useAnimatedStyle(() => {
    const isDragging = dragging.get() === index;
    const target = positions.get()[index] * STEP;
    return {
      zIndex: isDragging ? 10 : 0,
      transform: [
        { translateX: isDragging ? dragX.get() : dragging.get() >= 0 ? withSpring(target, SPRING) : target },
        { scale: withSpring(isDragging ? 1.08 : 1, SPRING) },
      ],
      shadowOpacity: withSpring(isDragging ? 0.5 : 0),
    };
  });

  const k = TILE_W / SLIDE_WIDTH;
  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
      <Animated.View style={[styles.tile, style]}>
        <View style={[styles.thumb, { height: tileH }, selected && styles.thumbOn]}>
          <Canvas style={{ width: TILE_W, height: tileH }}>
            <Group transform={[{ scale: k }, { translateX: -index * SLIDE_WIDTH }]}>
              <DocRenderer doc={doc} images={images} layers={layersOnSlide(doc.layers, index, SLIDE_WIDTH)} />
            </Group>
          </Canvas>
        </View>
        <Text style={[styles.num, selected && { color: C.text }]}>{index + 1}</Text>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, gap: 6 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 18,
    paddingRight: 6,
    height: 44,
  },
  title: { ...T.display, fontSize: 22 },
  titleDim: { ...T.display, color: C.textDim, fontSize: 22 },
  actions: { flexDirection: 'row' },
  tile: {
    position: 'absolute',
    left: 0,
    top: 4,
    width: TILE_W,
    alignItems: 'center',
    gap: 5,
    shadowColor: '#000',
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  thumb: {
    width: TILE_W,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: C.surfaceHi,
  },
  thumbOn: { borderColor: C.accent },
  num: { ...T.medium, color: C.textDim, fontSize: 11, fontVariant: ['tabular-nums'] },
  hint: { ...T.body, color: C.textFaint, fontSize: 11, paddingHorizontal: 18 },
});
