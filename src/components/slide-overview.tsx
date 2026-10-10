import { Canvas, Group } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Animated, {
  FadeOut,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { layersOnSlide } from '@/lib/geometry';
import type { ImageMap } from '@/lib/images';
import { useEditor } from '@/lib/store';
import { ASPECTS, type Doc, MAX_SLIDES, SLIDE_WIDTH } from '@/lib/types';
import { C, T } from '@/theme';

import { ActionMenu, type MenuItem } from './action-menu';
import { DocRenderer } from './doc-renderer';
import { Icon, IconButton } from './ui';

const PAD = 18;
const GAP_X = 14;
const GAP_Y = 12;
/** Handle, number and menu under each slide. */
const BAR = 36;
const MIN_TILE = 72;
const SPRING = { damping: 20, stiffness: 300 };

type Grid = { cols: number; tileW: number; tileH: number; stepX: number; stepY: number };

/** The largest tiles that fit every cell on screen (scrolling only once they'd get too small). */
function gridFor(cells: number, ratio: number, width: number, height: number): Grid {
  let pick = { cols: 1, tileW: MIN_TILE };
  for (let cols = 1; cols <= cells; cols++) {
    const tileW = Math.min((width - PAD * 2 - GAP_X * (cols - 1)) / cols, (height - PAD * 2 - BAR) / ratio);
    if (tileW < MIN_TILE && cols > 1) break;
    pick = { cols, tileW };
    const rows = Math.ceil(cells / cols);
    if (rows * (tileW * ratio + BAR) + (rows - 1) * GAP_Y + PAD * 2 <= height) break;
  }
  const tileW = Math.floor(pick.tileW);
  const tileH = Math.round(tileW * ratio);
  return { cols: pick.cols, tileW, tileH, stepX: tileW + GAP_X, stepY: tileH + BAR + GAP_Y };
}

/** Comes in from slightly larger, as if the canvas just zoomed out to it. */
const zoomOut = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 1.14 }] },
    animations: {
      opacity: withTiming(1, { duration: 180 }),
      transform: [{ scale: withSpring(1, { damping: 22, stiffness: 240 }) }],
    },
  };
};

/**
 * Every slide at once. Drag a slide's handle to reorder, use its menu to add,
 * duplicate, move or delete, tap it to go back to editing that slide.
 */
export function SlideOverview({
  doc,
  images,
  width,
  height,
  current,
  onOpen,
  onAdd,
}: {
  doc: Doc;
  images: ImageMap;
  width: number;
  height: number;
  /** Slide that was in view when the overview opened. */
  current: number;
  onOpen: (index: number) => void;
  /** Open the New Slide sheet for a slide inserted at `index`. */
  onAdd: (index: number) => void;
}) {
  const count = doc.slideCount;
  const canAdd = count < MAX_SLIDES;
  const ratio = ASPECTS[doc.aspect].height / SLIDE_WIDTH;
  // Every slide plus the trailing "+" cell.
  const cells = count + (canAdd ? 1 : 0);
  const grid = gridFor(cells, ratio, width, height);
  const rows = Math.ceil(cells / grid.cols);
  const contentW = grid.cols * grid.stepX - GAP_X;
  const contentH = rows * grid.stepY - GAP_Y;
  const left = Math.max(PAD, (width - contentW) / 2);
  const top = Math.max(PAD, (height - contentH) / 2);

  return (
    <Animated.View entering={zoomOut} exiting={FadeOut.duration(140)} style={[StyleSheet.absoluteFill, styles.screen]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ height: Math.max(height, contentH + top * 2) }}>
        <SortableGrid
          // Remount on any structural change so positions start from identity.
          key={`${count}:${doc.updatedAt}`}
          doc={doc}
          images={images}
          grid={grid}
          left={left}
          top={top}
          current={current}
          canAdd={canAdd}
          onOpen={onOpen}
          onAdd={onAdd}
        />
      </ScrollView>
    </Animated.View>
  );
}

function SortableGrid({
  doc,
  images,
  grid,
  left,
  top,
  current,
  canAdd,
  onOpen,
  onAdd,
}: {
  doc: Doc;
  images: ImageMap;
  grid: Grid;
  left: number;
  top: number;
  current: number;
  canAdd: boolean;
  onOpen: (index: number) => void;
  onAdd: (index: number) => void;
}) {
  // Worklets; see EditorCanvas for why this opts out of the compiler.
  'use no memo';
  const count = doc.slideCount;
  const { moveSlide, duplicateSlide, removeSlide } = useEditor.getState();
  /** positions[slide] = slot it currently occupies while dragging. */
  const positions = useSharedValue(Array.from({ length: count }, (_, i) => i));
  const dragging = useSharedValue(-1);
  const drag = useSharedValue({ x: 0, y: 0 });

  useEffect(() => {
    positions.set(Array.from({ length: count }, (_, i) => i));
  }, [count, positions]);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= count || from === to) return;
    moveSlide(from, to);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const remove = (i: number) => {
    const empty = layersOnSlide(doc.layers, i, SLIDE_WIDTH).length === 0;
    // Undo covers it, but a slide with work on it still gets a second look.
    if (empty) return removeSlide(i);
    Alert.alert(`Delete slide ${i + 1}?`, 'Anything only on this slide is removed. You can undo this.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeSlide(i) },
    ]);
  };

  const menuFor = (i: number): MenuItem[] => [
    {
      label: 'Add left',
      icon: { ios: 'rectangle.lefthalf.inset.filled.arrow.left', android: 'first_page' },
      disabled: !canAdd,
      onPress: () => onAdd(i),
    },
    {
      label: 'Add right',
      icon: { ios: 'rectangle.righthalf.inset.filled.arrow.right', android: 'last_page' },
      disabled: !canAdd,
      onPress: () => onAdd(i + 1),
    },
    {
      label: 'Duplicate',
      icon: { ios: 'plus.square.on.square', android: 'content_copy' },
      disabled: !canAdd,
      separator: true,
      onPress: () => duplicateSlide(i),
    },
    {
      label: 'Move left',
      icon: { ios: 'arrow.left', android: 'arrow_back' },
      disabled: i === 0,
      onPress: () => move(i, i - 1),
    },
    {
      label: 'Move right',
      icon: { ios: 'arrow.right', android: 'arrow_forward' },
      disabled: i === count - 1,
      onPress: () => move(i, i + 1),
    },
    {
      label: 'Delete',
      icon: { ios: 'trash', android: 'delete' },
      destructive: true,
      disabled: count <= 1,
      separator: true,
      onPress: () => remove(i),
    },
  ];

  const slot = (s: number) => ({ x: (s % grid.cols) * grid.stepX, y: Math.floor(s / grid.cols) * grid.stepY });
  const rows = Math.ceil((count + (canAdd ? 1 : 0)) / grid.cols);

  return (
    // Sized to the grid so touches reach every tile (children outside a parent's box can miss them).
    <View style={{ position: 'absolute', left, top, width: grid.cols * grid.stepX, height: rows * grid.stepY }}>
      {Array.from({ length: count }, (_, i) => (
        <Tile
          key={i}
          index={i}
          doc={doc}
          images={images}
          grid={grid}
          selected={i === current}
          positions={positions}
          dragging={dragging}
          drag={drag}
          menu={menuFor(i)}
          onOpen={onOpen}
          onMove={move}
        />
      ))}
      {canAdd && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add slide"
          onPress={() => {
            Haptics.selectionAsync();
            onAdd(count);
          }}
          style={({ pressed }) => [
            styles.add,
            { width: grid.tileW, height: grid.tileH, left: slot(count).x, top: slot(count).y, opacity: pressed ? 0.6 : 1 },
          ]}>
          <Icon name={{ ios: 'plus', android: 'add' }} size={22} color={C.textDim} />
        </Pressable>
      )}
    </View>
  );
}

function Tile({
  index,
  doc,
  images,
  grid,
  selected,
  positions,
  dragging,
  drag,
  menu,
  onOpen,
  onMove,
}: {
  index: number;
  doc: Doc;
  images: ImageMap;
  grid: Grid;
  selected: boolean;
  positions: SharedValue<number[]>;
  dragging: SharedValue<number>;
  drag: SharedValue<{ x: number; y: number }>;
  menu: MenuItem[];
  onOpen: (i: number) => void;
  onMove: (from: number, to: number) => void;
}) {
  'use no memo';
  const count = doc.slideCount;
  const { cols, stepX, stepY, tileW, tileH } = grid;
  const start = useSharedValue({ x: 0, y: 0 });
  const tick = () => Haptics.selectionAsync();
  const lift = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

  const slotXY = (s: number) => {
    'worklet';
    return { x: (s % cols) * stepX, y: Math.floor(s / cols) * stepY };
  };

  const pan = Gesture.Pan()
    .minDistance(2)
    .onStart(() => {
      dragging.set(index);
      start.set(slotXY(positions.get()[index]));
      drag.set(start.get());
      scheduleOnRN(lift);
    })
    .onUpdate((e) => {
      const p = { x: start.get().x + e.translationX, y: start.get().y + e.translationY };
      drag.set(p);
      const col = Math.max(0, Math.min(cols - 1, Math.round(p.x / stepX)));
      const row = Math.max(0, Math.round(p.y / stepY));
      const target = Math.max(0, Math.min(count - 1, row * cols + col));
      const pos = positions.get();
      const from = pos[index];
      if (target !== from) {
        // Shift the slides between the old and new slot by one.
        positions.set(
          pos.map((p2, i) => {
            if (i === index) return target;
            if (from < target && p2 > from && p2 <= target) return p2 - 1;
            if (from > target && p2 < from && p2 >= target) return p2 + 1;
            return p2;
          }),
        );
        scheduleOnRN(tick);
      }
    })
    .onFinalize(() => {
      if (dragging.get() !== index) return;
      const to = positions.get()[index];
      dragging.set(-1);
      if (to !== index) scheduleOnRN(onMove, index, to);
    });

  const style = useAnimatedStyle(() => {
    const isDragging = dragging.get() === index;
    const t = slotXY(positions.get()[index]);
    const settle = (v: number) => (dragging.get() >= 0 ? withSpring(v, SPRING) : v);
    return {
      zIndex: isDragging ? 10 : 0,
      transform: [
        { translateX: isDragging ? drag.get().x : settle(t.x) },
        { translateY: isDragging ? drag.get().y : settle(t.y) },
        { scale: withSpring(isDragging ? 1.06 : 1, SPRING) },
      ],
      shadowOpacity: withSpring(isDragging ? 0.5 : 0),
    };
  });

  const k = tileW / SLIDE_WIDTH;
  return (
    <Animated.View style={[styles.tile, { width: tileW }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit slide ${index + 1}`}
        onPress={() => {
          Haptics.selectionAsync();
          onOpen(index);
        }}>
        <View style={[styles.thumb, { width: tileW, height: tileH }, selected && styles.thumbOn]}>
          <Canvas style={{ width: tileW, height: tileH }}>
            <Group transform={[{ scale: k }, { translateX: -index * SLIDE_WIDTH }]}>
              <DocRenderer doc={doc} images={images} layers={layersOnSlide(doc.layers, index, SLIDE_WIDTH)} />
            </Group>
          </Canvas>
        </View>
      </Pressable>
      <View style={styles.bar}>
        <GestureDetector gesture={pan}>
          <View style={styles.control} accessibilityLabel={`Reorder slide ${index + 1}`}>
            <Icon name={{ ios: 'line.3.horizontal', android: 'drag_indicator' }} size={16} color={C.textDim} />
          </View>
        </GestureDetector>
        <Text style={[styles.num, selected && { color: C.text }]}>{index + 1}</Text>
        <ActionMenu label={`Slide ${index + 1} options`} items={menu}>
          <View style={styles.control}>
            <Icon name={{ ios: 'ellipsis', android: 'more_horiz' }} size={16} color={C.textDim} />
          </View>
        </ActionMenu>
      </View>
    </Animated.View>
  );
}

/** Bottom bar while the overview is open. */
export function OverviewBar({ count, onAdd, onDone }: { count: number; onAdd: () => void; onDone: () => void }) {
  return (
    <View style={styles.overviewBar}>
      <View style={{ flex: 1 }}>
        <Text style={styles.barTitle}>
          {count} {count === 1 ? 'slide' : 'slides'}
        </Text>
        <Text style={styles.barHint}>Drag ≡ to reorder · tap a slide to edit it</Text>
      </View>
      <IconButton label="Add slide" icon={{ ios: 'plus', android: 'add' }} disabled={count >= MAX_SLIDES} onPress={onAdd} />
      <IconButton label="Done" icon={{ ios: 'checkmark', android: 'check' }} onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: C.bg },
  tile: {
    position: 'absolute',
    left: 0,
    top: 0,
    shadowColor: '#000',
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  thumb: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: C.surfaceHi,
  },
  thumbOn: { borderColor: C.accent },
  bar: { height: BAR, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  control: { width: 34, height: BAR, alignItems: 'center', justifyContent: 'center' },
  num: { ...T.medium, color: C.textDim, fontSize: 12, fontVariant: ['tabular-nums'] },
  add: {
    position: 'absolute',
    borderRadius: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overviewBar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 20, paddingRight: 10 },
  barTitle: { ...T.display, fontSize: 22 },
  barHint: { ...T.body, color: C.textDim, fontSize: 12, marginTop: 1 },
});
