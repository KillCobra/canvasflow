import { Canvas, Group, Line, vec } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { type BrandImage, brandAssetUri, brandLogoUri, useBrandAssets, useBrandLogos } from '@/lib/brand';
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
import { type DoodleShape, doodle, doodleStrokes } from '@/lib/template-kit';
import { TEXTURES, textureBackground } from '@/lib/textures';
import { ASPECTS, type Background, type Doc, MAX_GRID_ROWS, type PhotoLayer, SLIDE_WIDTH } from '@/lib/types';
import { C, GRADIENTS, PALETTE, R, T } from '@/theme';

import { BrandColors } from './brand-colors';
import { ColorWell } from './color-well';
import { StrokeLine } from './drawing-node';
import { BackgroundFill, DocRenderer } from './doc-renderer';
import { Chip, HScroll, Icon, IconButton, Slider, Swatch, ToolButton } from './ui';

export const PANEL_HEIGHT = 168;

export function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View style={styles.panelHeader}>
      <Text style={styles.panelTitle}>{title}</Text>
      <IconButton label="Close" icon={{ ios: 'checkmark', android: 'check' }} onPress={onClose} />
    </View>
  );
}

const BG_TABS: { id: Background['kind']; label: string }[] = [
  { id: 'solid', label: 'Solid' },
  { id: 'gradient', label: 'Gradient' },
  { id: 'texture', label: 'Texture' },
];

export function BackgroundPanel({ onClose }: { onClose: () => void }) {
  const bg = useEditor((s) => s.doc!.background);
  const setBackground = useEditor((s) => s.setBackground);
  const [tab, setTab] = useState<Background['kind']>(bg.kind);
  const setSolid = (color: string, key?: string) => setBackground({ kind: 'solid', color }, key);

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {BG_TABS.map((t) => (
            <Chip key={t.id} label={t.label} selected={tab === t.id} onPress={() => setTab(t.id)} style={{ height: 30 }} />
          ))}
        </View>
        <IconButton label="Close" icon={{ ios: 'checkmark', android: 'check' }} onPress={onClose} />
      </View>
      {tab === 'solid' && (
        <HScroll gap={2}>
          <ColorWell value={bg.kind === 'solid' ? bg.color : null} onChange={(c) => setSolid(c, 'well')} />
          <BrandColors current={bg.kind === 'solid' ? bg.color : null} onPick={(c) => setSolid(c)} size={32} />
          {PALETTE.map((c) => (
            <Swatch key={c} color={c} selected={bg.kind === 'solid' && bg.color === c} onPress={() => setSolid(c)} />
          ))}
        </HScroll>
      )}
      {tab === 'texture' && <TexturePicker background={bg} onChange={setBackground} />}
      {tab === 'gradient' && (
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

/** On-screen size of a texture tile, and how much canvas it shows (about three grid squares). */
const TEXTURE_TILE = 46;
const TEXTURE_SCALE = 0.3;

/** Texture tiles (drawn by the same shader as the canvas), then the tint. */
function TexturePicker({
  background,
  onChange,
}: {
  background: Background;
  onChange: (bg: Background, coalesceKey?: string) => void;
}) {
  const active = background.kind === 'texture' ? background : null;
  // Browsing keeps the current tint; a first pick uses the texture's own.
  const tint = active?.colors[0];
  const own = active ? TEXTURES.find((t) => t.id === active.texture)?.tint : undefined;
  const tints = [...new Set([...(own ? [own] : []), ...PALETTE])];
  // Starts a little in from the origin so the notebook's margin rule shows.
  const span = TEXTURE_TILE / TEXTURE_SCALE + 60;
  return (
    <View style={{ gap: 6 }}>
      <HScroll gap={6}>
        {TEXTURES.map((t) => {
          const on = active?.texture === t.id;
          return (
            <Pressable
              key={t.id}
              accessibilityRole="button"
              accessibilityLabel={`${t.label} texture`}
              onPress={() => {
                Haptics.selectionAsync();
                onChange(textureBackground(t.id, tint ?? t.tint));
              }}
              style={({ pressed }) => [styles.texture, { opacity: pressed ? 0.6 : 1 }]}>
              <View style={[styles.textureTile, on && styles.textureOn]}>
                <View style={styles.textureClip}>
                  <Canvas style={{ width: TEXTURE_TILE, height: TEXTURE_TILE }}>
                    <Group transform={[{ scale: TEXTURE_SCALE }, { translateX: -60 }, { translateY: -60 }]}>
                      <BackgroundFill background={textureBackground(t.id, tint ?? t.tint)} width={span} height={span} />
                    </Group>
                  </Canvas>
                </View>
              </View>
              <Text style={[styles.textureLabel, on && { color: C.text }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </HScroll>
      {active ? (
        <HScroll gap={2}>
          <ColorWell value={active.colors[0]} onChange={(c) => onChange(textureBackground(active.texture, c), 'well')} />
          <BrandColors current={active.colors[0]} onPick={(c) => onChange(textureBackground(active.texture, c))} />
          {tints.map((c) => (
            <Swatch
              key={c}
              color={c}
              size={28}
              selected={active.colors[0] === c}
              onPress={() => onChange(textureBackground(active.texture, c))}
            />
          ))}
        </HScroll>
      ) : (
        <Text style={styles.cropHint}>Pick a texture, then tint it any colour.</Text>
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

/** Hand-drawn ink stickers, in the order they're offered, with a preview box size. */
export const DOODLES: { shape: DoodleShape; label: string; w: number; h: number }[] = [
  { shape: 'arrow', label: 'Arrow', w: 40, h: 20 },
  { shape: 'underline', label: 'Underline', w: 40, h: 10 },
  { shape: 'circle', label: 'Circle', w: 38, h: 26 },
  { shape: 'heart', label: 'Heart', w: 26, h: 24 },
  { shape: 'star', label: 'Star', w: 28, h: 28 },
  { shape: 'sparkle', label: 'Sparkle', w: 26, h: 26 },
  { shape: 'route', label: 'Route', w: 42, h: 12 },
  { shape: 'squiggle', label: 'Squiggle', w: 40, h: 12 },
  { shape: 'wave', label: 'Wave', w: 42, h: 10 },
  { shape: 'loops', label: 'Loops', w: 42, h: 12 },
  { shape: 'swoosh', label: 'Swoosh', w: 40, h: 22 },
  { shape: 'spiral', label: 'Spiral', w: 28, h: 28 },
  { shape: 'flower', label: 'Flower', w: 22, h: 32 },
  { shape: 'sun', label: 'Sun', w: 30, h: 30 },
  { shape: 'cloud', label: 'Cloud', w: 38, h: 22 },
  { shape: 'zigzag', label: 'Zigzag', w: 40, h: 10 },
  { shape: 'scribble', label: 'Scribble', w: 40, h: 14 },
  { shape: 'burst', label: 'Burst', w: 30, h: 30 },
];

/** A doodle drawn small for its button. */
function DoodleGlyph({ shape, w, h, color }: { shape: DoodleShape; w: number; h: number; color: string }) {
  const { strokes } = doodleStrokes(doodle(shape, 0, 0, w, h, color, { width: shape === 'route' ? 3.4 : 2.2 }));
  const size = { width: 48, height: 40 };
  return (
    <Canvas style={size}>
      <Group transform={[{ translateX: size.width / 2 }, { translateY: size.height / 2 }]}>
        {strokes.map((s, i) => (
          <StrokeLine key={i} stroke={s} />
        ))}
      </Group>
    </Canvas>
  );
}

export function ElementsPanel({
  onAddShape,
  onAddSticker,
  onAddGrid,
  onAddLogo,
  onAddDoodle,
  onClose,
}: {
  onAddDoodle: (shape: DoodleShape) => void;
  onAddShape: (shape: 'rect' | 'circle' | 'line' | 'torn') => void;
  onAddSticker: (emoji: string) => void;
  onAddGrid: (id: GridId) => void;
  /** A brand-kit logo or brand image. */
  onAddLogo: (image: BrandImage, kind: 'logo' | 'asset') => void;
  onClose: () => void;
}) {
  const logos = useBrandLogos();
  const assets = useBrandAssets();
  // Grid glyphs take the project's slide shape.
  const slideH = useEditor((s) => ASPECTS[s.doc!.aspect].height);
  const glyphH = Math.min(44, (30 * slideH) / SLIDE_WIDTH);
  const glyphW = (glyphH * SLIDE_WIDTH) / slideH;
  return (
    <View style={styles.panel}>
      <PanelHeader title="Shapes, grids & brand" onClose={onClose} />
      <HScroll gap={4}>
        {GRIDS.map((g) => (
          <Pressable
            key={g.id}
            accessibilityRole="button"
            accessibilityLabel={`${g.label} grid`}
            onPress={() => {
              Haptics.selectionAsync();
              onAddGrid(g.id);
            }}
            style={({ pressed }) => [styles.grid, { opacity: pressed ? 0.6 : 1 }]}>
            <View style={[styles.gridGlyph, { width: glyphW, height: glyphH }]}>
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
            <Text style={styles.gridLabel} numberOfLines={1}>
              {g.label}
            </Text>
          </Pressable>
        ))}
      </HScroll>
      <HScroll gap={4}>
        {/* Brand-kit logos and images come first; with none yet, a shortcut to add some. */}
        {[...logos.map((l) => ({ item: l, kind: 'logo' as const })), ...assets.map((a) => ({ item: a, kind: 'asset' as const }))].map(
          ({ item, kind }) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={kind === 'logo' ? 'Add brand logo' : 'Add brand image'}
              onPress={() => {
                Haptics.selectionAsync();
                onAddLogo(item, kind);
              }}
              style={({ pressed }) => [styles.logo, { opacity: pressed ? 0.6 : 1 }]}>
              <Image
                source={{ uri: kind === 'logo' ? brandLogoUri(item) : brandAssetUri(item) }}
                style={item.alpha === false ? StyleSheet.absoluteFill : styles.logoImage}
                contentFit={item.alpha === false ? 'cover' : 'contain'}
              />
            </Pressable>
          ),
        )}
        <ToolButton
          icon={{ ios: 'paintpalette', android: 'palette' }}
          label={logos.length || assets.length ? 'Kit' : 'Logo'}
          onPress={() => router.push('/brand-kit')}
        />
        <View style={styles.vDivider} />
        <ToolButton icon={{ ios: 'square.fill', android: 'square' }} label="Block" onPress={() => onAddShape('rect')} />
        <ToolButton icon={{ ios: 'circle.fill', android: 'circle' }} label="Circle" onPress={() => onAddShape('circle')} />
        <ToolButton icon={{ ios: 'minus', android: 'remove' }} label="Line" onPress={() => onAddShape('line')} />
        <ToolButton icon={{ ios: 'doc.plaintext', android: 'note' }} label="Paper" onPress={() => onAddShape('torn')} />
        <View style={styles.vDivider} />
        {DOODLES.map((d) => (
          <Pressable
            key={d.shape}
            accessibilityRole="button"
            accessibilityLabel={`${d.label} doodle`}
            onPress={() => {
              Haptics.selectionAsync();
              onAddDoodle(d.shape);
            }}
            style={({ pressed }) => [styles.doodle, { opacity: pressed ? 0.6 : 1 }]}>
            <DoodleGlyph shape={d.shape} w={d.w} h={d.h} color={C.text} />
          </Pressable>
        ))}
        <View style={styles.vDivider} />
        {STICKERS.map((s) => (
          <Pressable key={s} onPress={() => onAddSticker(s)} style={styles.sticker}>
            <Text style={{ fontSize: 26 }}>{s}</Text>
          </Pressable>
        ))}
      </HScroll>
    </View>
  );
}

/** Rows of a grid puzzle: each row is three posts on the profile. */
export function GridRowsPanel({ onTile, onClose }: { onTile: (tile: number) => void; onClose: () => void }) {
  const rows = useEditor((s) => s.doc!.grid ?? 1);
  const covers = useEditor((s) => s.doc!.covers);
  const setRows = useEditor((s) => s.setGridRows);
  const total = rows * 3;
  const change = (n: number) => {
    Haptics.selectionAsync();
    setRows(n);
  };
  return (
    <View style={styles.panel}>
      <PanelHeader title="Grid" onClose={onClose} />
      <View style={styles.rowsLine}>
        <IconButton label="Fewer rows" tone="filled" icon={{ ios: 'minus', android: 'remove' }} disabled={rows <= 1} onPress={() => change(rows - 1)} />
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={styles.rowsValue}>
            {rows} {rows === 1 ? 'row' : 'rows'}
          </Text>
          <Text style={styles.layoutHint}>
            {rows * 3} posts · 3 × {rows}
          </Text>
        </View>
        <IconButton
          label="More rows"
          tone="filled"
          icon={{ ios: 'plus', android: 'add' }}
          disabled={rows >= MAX_GRID_ROWS}
          onPress={() => change(rows + 1)}
        />
      </View>
      <View style={styles.tilesRow}>
        <View style={[styles.tiles, { height: rows * 30 + (rows - 1) * 3 }]}>
          {Array.from({ length: total }, (_, i) => {
            const linked = !!covers?.[i];
            return (
              <Pressable
                key={i}
                onPress={() => onTile(i)}
                accessibilityRole="button"
                accessibilityLabel={linked ? `Post ${total - i}, a carousel` : `Post ${total - i}`}
                style={({ pressed }) => [styles.tileCell, linked && styles.tileCellLinked, pressed && { opacity: 0.6 }]}>
                {linked ? (
                  <Icon name={{ ios: 'square.fill.on.square.fill', android: 'filter_none' }} size={11} color={C.accentInk} />
                ) : (
                  <Text style={styles.tileNumber}>{total - i}</Text>
                )}
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.layoutHint, { flex: 1 }]}>
          Tap a post to turn it into a carousel whose first slide is that tile. Numbers are the posting order.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  doodle: { width: 52, height: 48, borderRadius: 10, backgroundColor: C.surfaceHi, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  rowsLine: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  tilesRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 4 },
  tiles: { width: 3 * 24 + 6, flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  tileCell: { width: 24, height: 30, borderRadius: 4, backgroundColor: C.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  tileCellLinked: { backgroundColor: C.accent },
  tileNumber: { ...T.semibold, color: C.textDim, fontSize: 11 },
  rowsValue: { ...T.display, fontSize: 26 },
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
  logo: { width: 56, height: 48, borderRadius: 10, backgroundColor: C.surfaceHi, alignSelf: 'center', overflow: 'hidden' },
  logoImage: { ...StyleSheet.absoluteFill, margin: 6 },
  grid: { alignItems: 'center', gap: 5, width: 54 },
  gridGlyph: { borderRadius: 4, backgroundColor: C.surfaceHi, padding: 2 },
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
  texture: { alignItems: 'center', gap: 4 },
  textureTile: {
    width: TEXTURE_TILE + 6,
    height: TEXTURE_TILE + 6,
    borderRadius: R.sm,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textureClip: { borderRadius: 7, overflow: 'hidden' },
  textureOn: { borderColor: C.text },
  textureLabel: { ...T.medium, color: C.textDim, fontSize: 10 },
  layerHeader: { flexDirection: 'row', alignItems: 'center', paddingRight: 8, height: 40 },
  cropHint: { ...T.body, color: C.textDim, fontSize: 13, paddingHorizontal: 18 },
});
