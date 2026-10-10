import { Canvas, FilterMode, Group, Image, MipmapMode } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Animated, { type SharedValue, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { contrastInk } from '@/lib/color';
import type { ImageMap } from '@/lib/images';
import { useEditor } from '@/lib/store';
import { fontInfo } from '@/lib/fonts';
import type { Layer } from '@/lib/types';
import { C, R, T } from '@/theme';

import { DrawingNode } from './drawing-node';
import { PanelHeader } from './panels';
import { Icon } from './ui';

const ROW = 56;
const SPRING = { damping: 20, stiffness: 300 };

/** What a layer is called in the list. */
export function layerLabel(l: Layer) {
  if (l.type === 'photo') return !l.src ? 'Empty frame' : l.video ? 'Video' : 'Photo';
  if (l.type === 'shape') return l.shape === 'circle' ? 'Circle' : l.shape === 'line' ? 'Line' : 'Block';
  if (l.type === 'drawing') return 'Drawing';
  if (l.sticker) return `Sticker ${l.text}`;
  const line = l.text.split('\n')[0];
  return line.length > 26 ? `${line.slice(0, 25)}…` : line;
}

/**
 * The layer stack, top first. Tap a row to select, use the eye and lock to
 * hide or pin a layer, and drag the handle to change the stacking order.
 */
export function LayersPanel({
  images,
  selectedId,
  onSelect,
  onClose,
}: {
  images: ImageMap;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const layers = useEditor((s) => s.doc!.layers);
  const { reorderLayer, toggleHidden, toggleLocked } = useEditor.getState();
  // Top of the stack first.
  const rows = [...layers].reverse();

  return (
    <View style={styles.panel}>
      <PanelHeader title={`Layers${layers.length ? ` · ${layers.length}` : ''}`} onClose={onClose} />
      {rows.length === 0 ? (
        <Text style={styles.empty}>Nothing here yet. Add media, text or elements.</Text>
      ) : (
        <SortableList
          key={rows.map((l) => l.id).join('|')}
          rows={rows}
          images={images}
          selectedId={selectedId}
          onSelect={onSelect}
          onToggleHidden={toggleHidden}
          onToggleLocked={toggleLocked}
          // List index i is stack index n-1-i.
          onMove={(id, toRow) => reorderLayer(id, rows.length - 1 - toRow)}
        />
      )}
    </View>
  );
}

function SortableList({
  rows,
  images,
  selectedId,
  onSelect,
  onToggleHidden,
  onToggleLocked,
  onMove,
}: {
  rows: Layer[];
  images: ImageMap;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleHidden: (id: string) => void;
  onToggleLocked: (id: string) => void;
  onMove: (id: string, toRow: number) => void;
}) {
  // Worklets; see EditorCanvas for why this opts out of the compiler.
  'use no memo';
  const count = rows.length;
  /** positions[row] = slot it occupies while dragging. */
  const positions = useSharedValue(rows.map((_, i) => i));
  const dragging = useSharedValue(-1);
  const dragY = useSharedValue(0);

  useEffect(() => {
    positions.set(rows.map((_, i) => i));
  }, [rows, positions]);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ height: count * ROW + 8, paddingHorizontal: 10 }}>
      {rows.map((layer, i) => (
        <Row
          key={layer.id}
          index={i}
          count={count}
          layer={layer}
          image={layer.type === 'photo' ? images[layer.src] : undefined}
          selected={layer.id === selectedId}
          positions={positions}
          dragging={dragging}
          dragY={dragY}
          onSelect={() => onSelect(layer.id)}
          onToggleHidden={() => onToggleHidden(layer.id)}
          onToggleLocked={() => onToggleLocked(layer.id)}
          onDrop={(to) => onMove(layer.id, to)}
        />
      ))}
    </ScrollView>
  );
}

function Row({
  index,
  count,
  layer,
  image,
  selected,
  positions,
  dragging,
  dragY,
  onSelect,
  onToggleHidden,
  onToggleLocked,
  onDrop,
}: {
  index: number;
  count: number;
  layer: Layer;
  image?: ImageMap[string];
  selected: boolean;
  positions: SharedValue<number[]>;
  dragging: SharedValue<number>;
  dragY: SharedValue<number>;
  onSelect: () => void;
  onToggleHidden: () => void;
  onToggleLocked: () => void;
  onDrop: (to: number) => void;
}) {
  'use no memo';
  const start = useSharedValue(0);
  const tick = () => Haptics.selectionAsync();
  const lift = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

  const drag = Gesture.Pan()
    .minDistance(2)
    .onStart(() => {
      dragging.set(index);
      start.set(positions.get()[index] * ROW);
      dragY.set(start.get());
      scheduleOnRN(lift);
    })
    .onUpdate((e) => {
      const y = Math.max(0, Math.min((count - 1) * ROW, start.get() + e.translationY));
      dragY.set(y);
      const slot = Math.round(y / ROW);
      const pos = positions.get();
      const from = pos[index];
      if (slot !== from) {
        positions.set(
          pos.map((p, i) => {
            if (i === index) return slot;
            if (from < slot && p > from && p <= slot) return p - 1;
            if (from > slot && p < from && p >= slot) return p + 1;
            return p;
          }),
        );
        scheduleOnRN(tick);
      }
    })
    .onFinalize(() => {
      if (dragging.get() !== index) return;
      const to = positions.get()[index];
      dragging.set(-1);
      if (to !== index) scheduleOnRN(onDrop, to);
    });

  const style = useAnimatedStyle(() => {
    const isDragging = dragging.get() === index;
    const target = positions.get()[index] * ROW;
    return {
      zIndex: isDragging ? 10 : 0,
      transform: [
        { translateY: isDragging ? dragY.get() : dragging.get() >= 0 ? withSpring(target, SPRING) : target },
        { scale: withSpring(isDragging ? 1.03 : 1, SPRING) },
      ],
      shadowOpacity: withSpring(isDragging ? 0.45 : 0),
    };
  });

  const dim = layer.hidden ? 0.4 : 1;

  return (
    <Animated.View style={[styles.rowWrap, style]}>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          onSelect();
        }}
        style={[styles.row, selected && styles.rowOn]}>
        <View style={[styles.thumb, { opacity: dim }]}>
          <Thumb layer={layer} image={image} />
        </View>
        <Text style={[styles.name, { opacity: dim }]} numberOfLines={1}>
          {layerLabel(layer)}
        </Text>
        <ToggleIcon
          on={!!layer.hidden}
          label={layer.hidden ? 'Show layer' : 'Hide layer'}
          icon={layer.hidden ? { ios: 'eye.slash', android: 'visibility_off' } : { ios: 'eye', android: 'visibility' }}
          onPress={onToggleHidden}
        />
        <ToggleIcon
          on={!!layer.locked}
          label={layer.locked ? 'Unlock layer' : 'Lock layer'}
          icon={layer.locked ? { ios: 'lock.fill', android: 'lock' } : { ios: 'lock.open', android: 'lock_open' }}
          onPress={onToggleLocked}
        />
        <GestureDetector gesture={drag}>
          <View style={styles.handle} accessibilityLabel="Reorder">
            <Icon name={{ ios: 'line.3.horizontal', android: 'drag_handle' }} size={18} color={C.textDim} />
          </View>
        </GestureDetector>
      </Pressable>
    </Animated.View>
  );
}

function ToggleIcon({
  on,
  label,
  icon,
  onPress,
}: {
  on: boolean;
  label: string;
  icon: Parameters<typeof Icon>[0]['name'];
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [styles.toggle, { opacity: pressed ? 0.5 : 1 }]}>
      <Icon name={icon} size={17} color={on ? C.accent : C.textDim} />
    </Pressable>
  );
}

function Thumb({ layer, image }: { layer: Layer; image?: ImageMap[string] }) {
  const size = 36;
  if (layer.type === 'photo') {
    if (!image) return <Icon name={{ ios: 'photo', android: 'image' }} size={16} color={C.textDim} />;
    const iw = layer.aspect >= 1 ? size * layer.aspect : size;
    const ih = layer.aspect >= 1 ? size : size / layer.aspect;
    return (
      <View>
        <Canvas style={{ width: size, height: size }}>
          <Image
            image={image}
            x={(size - iw) / 2}
            y={(size - ih) / 2}
            width={iw}
            height={ih}
            fit="fill"
            sampling={{ filter: FilterMode.Linear, mipmap: MipmapMode.Linear }}
          />
        </Canvas>
        {layer.video && (
          <View style={styles.play}>
            <Icon name={{ ios: 'play.fill', android: 'play_arrow' }} size={9} color="#fff" />
          </View>
        )}
      </View>
    );
  }
  if (layer.type === 'shape') {
    return (
      <View
        style={{
          width: layer.shape === 'line' ? 22 : 18,
          height: layer.shape === 'line' ? 3 : 18,
          borderRadius: layer.shape === 'circle' ? 9 : 3,
          backgroundColor: layer.color,
        }}
      />
    );
  }
  if (layer.type === 'drawing') {
    // Fit the ink into the tile; dark ink gets a light card so it stays visible.
    const k = (size - 6) / Math.max(layer.w, layer.h);
    const ink = layer.strokes[0]?.color ?? C.text;
    return (
      <Canvas style={{ width: size, height: size, backgroundColor: contrastInk(ink) === '#FFFFFF' ? C.text : undefined }}>
        <Group transform={[{ translateX: size / 2 }, { translateY: size / 2 }, { scale: k }]}>
          <DrawingNode layer={layer} />
        </Group>
      </Canvas>
    );
  }
  if (layer.sticker) return <Text style={{ fontSize: 20 }}>{layer.text}</Text>;
  return (
    <View style={[styles.textThumb, layer.fill ? { backgroundColor: layer.fill } : null]}>
      <Text style={{ fontFamily: fontInfo(layer.font).rn, color: layer.fill ? layer.color : C.text, fontSize: 15 }}>
        Aa
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, gap: 2 },
  empty: { ...T.body, color: C.textDim, fontSize: 14, paddingHorizontal: 18, paddingTop: 8 },
  rowWrap: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 0,
    height: ROW,
    paddingVertical: 3,
    shadowColor: '#000',
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 7,
    borderRadius: R.md,
    backgroundColor: C.surfaceHi,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rowOn: { borderColor: C.accent },
  thumb: {
    width: 36,
    height: 36,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textThumb: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  play: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#000000A0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { ...T.medium, flex: 1, fontSize: 14 },
  toggle: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 40, height: 48, alignItems: 'center', justifyContent: 'center' },
});
