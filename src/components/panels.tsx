import { Canvas, Group, Line, vec } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ImageMap } from '@/lib/images';
import {
  GRIDS,
  type GridId,
  LAYOUTS,
  type LayoutId,
  MOODS,
  type MagicResult,
  type Mood,
  magicLayout,
} from '@/lib/layouts';
import { useEditor } from '@/lib/store';
import { ASPECTS, type Doc, type PhotoLayer, SLIDE_WIDTH } from '@/lib/types';
import { C, GRADIENTS, PALETTE, R, T } from '@/theme';

import { ColorWell } from './color-well';
import { DocRenderer } from './doc-renderer';
import { Chip, HScroll, IconButton, Slider, Swatch, ToolButton } from './ui';

export const PANEL_HEIGHT = 168;

export function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View style={styles.panelHeader}>
      <Text style={styles.panelTitle}>{title}</Text>
      <IconButton label="Close" icon={{ ios: 'checkmark', android: 'check' }} onPress={onClose} />
    </View>
  );
}

export function BackgroundPanel({ onClose }: { onClose: () => void }) {
  const bg = useEditor((s) => s.doc!.background);
  const setBackground = useEditor((s) => s.setBackground);
  const [tab, setTab] = useState<'solid' | 'gradient'>(bg.kind);

  return (
    <View style={styles.panel}>
      <PanelHeader title="Background" onClose={onClose} />
      <HScroll>
        <Chip label="Solid" selected={tab === 'solid'} onPress={() => setTab('solid')} />
        <Chip label="Gradient" selected={tab === 'gradient'} onPress={() => setTab('gradient')} />
      </HScroll>
      <View style={{ height: 8 }} />
      {tab === 'solid' ? (
        <HScroll gap={2}>
          <ColorWell
            value={bg.kind === 'solid' ? bg.color : null}
            onChange={(c) => setBackground({ kind: 'solid', color: c }, 'well')}
          />
          {PALETTE.map((c) => (
            <Swatch
              key={c}
              color={c}
              selected={bg.kind === 'solid' && bg.color === c}
              onPress={() => setBackground({ kind: 'solid', color: c })}
            />
          ))}
        </HScroll>
      ) : (
        <>
          <HScroll gap={2}>
            {GRADIENTS.map((g) => (
              <Swatch
                key={g.join()}
                colors={g}
                selected={bg.kind === 'gradient' && bg.colors.join() === g.join()}
                onPress={() =>
                  setBackground({
                    kind: 'gradient',
                    colors: g,
                    angle: bg.kind === 'gradient' ? bg.angle : 0,
                  })
                }
              />
            ))}
          </HScroll>
          {bg.kind === 'gradient' && (
            <Slider
              label="Angle"
              value={(bg.angle * 180) / Math.PI}
              min={0}
              max={360}
              format={(v) => `${Math.round(v)}°`}
              onChange={(deg) => setBackground({ ...bg, angle: (deg * Math.PI) / 180 }, 'angle')}
            />
          )}
        </>
      )}
    </View>
  );
}

export function LayoutPanel({
  images,
  onApply,
  onMagic,
  onAddPhotos,
  onClose,
}: {
  images: ImageMap;
  onApply: (id: LayoutId) => void;
  onMagic: (result: MagicResult) => void;
  onAddPhotos: () => void;
  onClose: () => void;
}) {
  const doc = useEditor((s) => s.doc!);
  const photos = doc.layers.filter((l): l is PhotoLayer => l.type === 'photo' && !!l.src);
  const [tab, setTab] = useState<'arrange' | 'magic'>('arrange');
  const [mood, setMood] = useState<Mood>('clean');
  const [seed, setSeed] = useState(1);

  if (photos.length === 0) {
    return (
      <View style={styles.panel}>
        <PanelHeader title="Layouts" onClose={onClose} />
        <Pressable onPress={onAddPhotos} style={styles.empty}>
          <Text style={styles.emptyText}>Add photos, then pick a layout or let Magic arrange them.</Text>
          <Text style={[styles.emptyText, { ...T.semibold, color: C.accent }]}>Add photos</Text>
        </Pressable>
      </View>
    );
  }

  const options = [0, 1, 2].map((k) => magicLayout(photos, doc.aspect, mood, seed * 3 + k));

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Chip label="Arrange" selected={tab === 'arrange'} onPress={() => setTab('arrange')} style={{ height: 30 }} />
          <Chip
            label={
              <Text style={[styles.magicLabel, tab === 'magic' && { color: C.bg }]}>✦ Magic</Text>
            }
            selected={tab === 'magic'}
            onPress={() => setTab('magic')}
            style={{ height: 30 }}
          />
        </View>
        <IconButton label="Close" icon={{ ios: 'checkmark', android: 'check' }} onPress={onClose} />
      </View>
      {tab === 'arrange' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
          {LAYOUTS.map((l) => (
            <Pressable
              key={l.id}
              onPress={() => onApply(l.id)}
              style={({ pressed }) => [styles.layoutCard, { opacity: pressed ? 0.6 : 1 }]}>
              <LayoutGlyph id={l.id} />
              <Text style={styles.layoutLabel}>{l.label}</Text>
              <Text style={styles.layoutHint} numberOfLines={2}>
                {l.hint}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <View style={{ gap: 8 }}>
          <HScroll gap={6}>
            {MOODS.map((m) => (
              <Chip key={m.id} label={m.label} selected={mood === m.id} onPress={() => setMood(m.id)} style={{ height: 28 }} />
            ))}
            <IconButton
              label="Shuffle"
              icon={{ ios: 'shuffle', android: 'shuffle' }}
              tone="filled"
              onPress={() => {
                Haptics.selectionAsync();
                setSeed((n) => n + 1);
              }}
            />
          </HScroll>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
            {options.map((o, i) => (
              <Pressable
                key={`${seed}-${i}`}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onMagic(o);
                }}
                style={({ pressed }) => ({ gap: 4, opacity: pressed ? 0.6 : 1 })}>
                <MagicPreview doc={doc} result={o} images={images} />
                <Text style={styles.layoutHint}>
                  {o.label} · {o.slideCount} slides
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

/** A generated arrangement drawn small, with the project's other layers on top. */
function MagicPreview({ doc, result, images }: { doc: Doc; result: MagicResult; images: ImageMap }) {
  const height = 62;
  const H = ASPECTS[doc.aspect].height;
  const k = height / H;
  const W = result.slideCount * SLIDE_WIDTH;
  const width = Math.min(260, W * k);
  const scale = Math.min(k, width / W);
  const others = doc.layers.filter((l) => l.type !== 'photo' || !l.src);
  const preview: Doc = {
    ...doc,
    slideCount: result.slideCount,
    background: { kind: 'solid', color: result.background },
    layers: [...result.photos, ...others],
  };
  return (
    <View style={{ width: W * scale, height: H * scale, borderRadius: 6, overflow: 'hidden' }}>
      <Canvas style={{ width: W * scale, height: H * scale }}>
        <Group transform={[{ scale }]}>
          <DocRenderer doc={preview} images={images} />
          {Array.from({ length: result.slideCount - 1 }, (_, i) => (
            <Line
              key={i}
              p1={vec((i + 1) * SLIDE_WIDTH, 0)}
              p2={vec((i + 1) * SLIDE_WIDTH, H)}
              color="#0A0A0A66"
              strokeWidth={2 / scale}
            />
          ))}
        </Group>
      </Canvas>
    </View>
  );
}

/** Tiny schematic of a layout: three slides with blocks on them. */
function LayoutGlyph({ id }: { id: LayoutId }) {
  const slide = 22;
  const h = 28;
  const blocks: Record<LayoutId, [number, number, number, number, number?][]> = {
    seamless: [
      [4, 6, 18, 16],
      [26, 2, 14, 11],
      [38, 14, 20, 13],
    ],
    panorama: [[0, 0, slide * 3, h]],
    full: [
      [0, 0, slide - 1, h],
      [slide, 0, slide - 1, h],
      [slide * 2, 0, slide, h],
    ],
    framed: [
      [4, 5, 14, 18],
      [slide + 4, 5, 14, 18],
      [slide * 2 + 4, 5, 14, 18],
    ],
    stack: [
      [3, 3, 16, 10],
      [3, 15, 16, 10],
      [slide + 3, 3, 16, 10],
      [slide + 3, 15, 16, 10],
      [slide * 2 + 3, 3, 16, 10],
    ],
    scatter: [
      [6, 4, 14, 12, -8],
      [24, 12, 14, 12, 6],
      [44, 5, 14, 12, -4],
    ],
  };
  return (
    <View style={{ width: slide * 3, height: h, backgroundColor: C.surfaceHi, borderRadius: 3, overflow: 'hidden' }}>
      {blocks[id].map(([x, y, w, bh, deg = 0], i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: x,
            top: y,
            width: w,
            height: bh,
            backgroundColor: C.accent,
            opacity: 0.85,
            borderRadius: 1.5,
            transform: [{ rotate: `${deg}deg` }],
          }}
        />
      ))}
      {[1, 2].map((i) => (
        <View
          key={i}
          style={{ position: 'absolute', left: i * slide, top: 0, bottom: 0, width: 1, backgroundColor: C.bg }}
        />
      ))}
    </View>
  );
}

const STICKERS = ['✨', '❤️', '🔥', '⭐️', '🌸', '☀️', '🌊', '📍', '🎞️', '👀', '🫶', '➡️'];

export function ElementsPanel({
  onAddShape,
  onAddSticker,
  onAddGrid,
  onClose,
}: {
  onAddShape: (shape: 'rect' | 'circle' | 'line') => void;
  onAddSticker: (emoji: string) => void;
  onAddGrid: (id: GridId) => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.panel}>
      <PanelHeader title="Shapes, grids & stickers" onClose={onClose} />
      <HScroll gap={8}>
        <ToolButton icon={{ ios: 'square.fill', android: 'square' }} label="Block" onPress={() => onAddShape('rect')} />
        <ToolButton icon={{ ios: 'circle.fill', android: 'circle' }} label="Circle" onPress={() => onAddShape('circle')} />
        <ToolButton icon={{ ios: 'minus', android: 'remove' }} label="Line" onPress={() => onAddShape('line')} />
        <View style={styles.vDivider} />
        {GRIDS.map((g) => (
          <Pressable
            key={g.id}
            onPress={() => {
              Haptics.selectionAsync();
              onAddGrid(g.id);
            }}
            style={({ pressed }) => [styles.grid, { opacity: pressed ? 0.6 : 1 }]}>
            <View style={styles.gridGlyph}>
              {g.cells.map(([x, y, w, h], i) => (
                <View
                  key={i}
                  style={{
                    position: 'absolute',
                    left: `${x * 100}%`,
                    top: `${y * 100}%`,
                    width: `${w * 100}%`,
                    height: `${h * 100}%`,
                    padding: 1,
                  }}>
                  <View style={{ flex: 1, backgroundColor: C.accent, opacity: 0.85, borderRadius: 1.5 }} />
                </View>
              ))}
            </View>
            <Text style={styles.gridLabel}>{g.label}</Text>
          </Pressable>
        ))}
      </HScroll>
      <HScroll gap={4}>
        {STICKERS.map((s) => (
          <Pressable key={s} onPress={() => onAddSticker(s)} style={styles.sticker}>
            <Text style={{ fontSize: 26 }}>{s}</Text>
          </Pressable>
        ))}
      </HScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { minHeight: PANEL_HEIGHT, gap: 6, paddingBottom: 4 },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 18,
    paddingRight: 8,
    height: 40,
  },
  panelTitle: { ...T.display, fontSize: 22 },
  empty: { marginHorizontal: 16, padding: 16, borderRadius: R.md, backgroundColor: C.surface, gap: 6 },
  emptyText: { ...T.body, color: C.textDim, fontSize: 14 },
  layoutCard: {
    width: 116,
    padding: 10,
    borderRadius: R.md,
    backgroundColor: C.surface,
    gap: 6,
  },
  magicLabel: { ...T.medium, fontSize: 13, color: C.accent },
  vDivider: { width: StyleSheet.hairlineWidth, height: 40, backgroundColor: C.line, marginHorizontal: 4 },
  grid: { alignItems: 'center', gap: 6, width: 52 },
  gridGlyph: { width: 30, height: 37, borderRadius: 4, backgroundColor: C.surfaceHi, padding: 2 },
  gridLabel: { ...T.medium, color: C.textDim, fontSize: 11 },
  layoutLabel: { ...T.semibold, fontSize: 13 },
  layoutHint: { ...T.body, color: C.textDim, fontSize: 11, lineHeight: 15 },
  slideTile: {
    width: 44,
    height: 54,
    borderRadius: R.sm,
    borderWidth: 1.5,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slideActions: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 16 },
  sticker: {
    width: 46,
    height: 46,
    borderRadius: R.sm,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layerActions: { gap: 4, paddingHorizontal: 10 },
  layerHeader: { flexDirection: 'row', alignItems: 'center', paddingRight: 8, height: 40 },
  cropHint: { ...T.body, color: C.textDim, fontSize: 13, paddingHorizontal: 18 },
});
