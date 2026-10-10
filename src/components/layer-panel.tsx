import { Canvas, ColorMatrix, FilterMode, Image, MipmapMode } from '@shopify/react-native-skia';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DEFAULT_ADJUST, FILTERS, adjustMatrix } from '@/lib/adjust';
import { contrastInk } from '@/lib/color';
import type { ImageMap } from '@/lib/images';
import { selectedLayer, useEditor } from '@/lib/store';
import { measureText } from '@/lib/text';
import type { Adjust, FrameShape, Layer, PhotoLayer, TextLayer } from '@/lib/types';
import { C, PALETTE, R, T } from '@/theme';

import { BrandColors } from './brand-colors';
import { ColorWell } from './color-well';
import { DRAWING_TABS, DrawingColors } from './drawing-panel';
import { AlignRow } from './multi-panel';
import { PanelHeader } from './panels';
import { Chip, HScroll, IconButton, Slider, Swatch, ToolButton } from './ui';
import { VideoTrimmer } from './video-trimmer';

type LayerTab = 'filters' | 'tune' | 'video' | 'color' | 'style' | 'corners' | 'frame' | 'align' | 'opacity';

const TAB_LABEL: Record<LayerTab, string> = {
  filters: 'Filters',
  tune: 'Adjust',
  video: 'Video',
  color: 'Color',
  style: 'Style',
  corners: 'Corners',
  frame: 'Frame',
  align: 'Align',
  opacity: 'Opacity',
};

function tabsFor(layer: Layer): LayerTab[] {
  if (layer.type === 'photo') {
    if (!layer.src) return ['frame', 'corners', 'align', 'opacity'];
    if (layer.cutout) return ['filters', 'tune', 'frame', 'align', 'opacity'];
    return [
      ...(layer.video ? (['video'] as const) : []),
      'filters',
      'tune',
      'frame',
      'corners',
      'align',
      'opacity',
    ];
  }
  // Only a block has corners to round; torn paper, circles and lines don't.
  if (layer.type === 'shape') return layer.shape === 'rect' ? ['color', 'corners', 'align', 'opacity'] : ['color', 'align', 'opacity'];
  if (layer.type === 'drawing') return [...DRAWING_TABS];
  return layer.sticker ? ['align', 'opacity'] : ['color', 'style', 'align', 'opacity'];
}

const FRAMES: { id: FrameShape; label: string }[] = [
  { id: 'rect', label: 'Square' },
  { id: 'circle', label: 'Circle' },
  { id: 'arch', label: 'Arch' },
  { id: 'polaroid', label: 'Polaroid' },
  { id: 'taped', label: 'Taped' },
  { id: 'film', label: 'Film' },
  { id: 'stamp', label: 'Stamp' },
  { id: 'torn', label: 'Torn' },
];

/** Card colour a decorative frame starts with (the swatches recolour it via borderColor). */
const CARD_COLOR: Partial<Record<FrameShape, string>> = {
  polaroid: '#FFFFFF',
  taped: '#FFFFFF',
  stamp: '#FFFFFF',
  torn: '#FBF8F2',
  film: '#141414',
};

type StyleKey = 'spacing' | 'outline' | 'curve' | 'background' | 'shadow';
const STYLE_KEYS: { key: StyleKey; label: string }[] = [
  { key: 'outline', label: 'Outline' },
  { key: 'background', label: 'Background' },
  { key: 'curve', label: 'Curve' },
  { key: 'spacing', label: 'Spacing' },
  { key: 'shadow', label: 'Shadow' },
];

const OUTLINE_COLORS = ['#000000', '#FFFFFF', '#D9C29C', '#C8553D', '#3D5A80', '#E5989B'];

type TuneKey = 'exposure' | 'contrast' | 'saturation' | 'warmth';
const TUNE: { key: TuneKey; label: string }[] = [
  { key: 'exposure', label: 'Exposure' },
  { key: 'contrast', label: 'Contrast' },
  { key: 'saturation', label: 'Saturation' },
  { key: 'warmth', label: 'Warmth' },
];

export function LayerPanel({
  images,
  cropping,
  onEditText,
  onFillSlide,
  onReplace,
  onToggleCrop,
  onCutout,
}: {
  images: ImageMap;
  cropping: boolean;
  onEditText: () => void;
  onFillSlide: () => void;
  onReplace: () => void;
  onToggleCrop: () => void;
  /** Lift the subject out as its own layer (only where supported). */
  onCutout?: () => void;
}) {
  const layer = useEditor(selectedLayer)!;
  const docId = useEditor((s) => s.doc!.id);
  const { updateLayer, removeLayer, duplicateLayer, moveLayer, select, toggleLocked, setMulti, ungroupLayers } =
    useEditor.getState();
  const tabs = tabsFor(layer);
  const [tab, setTab] = useState<LayerTab>(tabs[0]);
  const [tune, setTune] = useState<TuneKey>('exposure');
  const [styleKey, setStyleKey] = useState<StyleKey>('outline');
  const activeTab = tabs.includes(tab) ? tab : tabs[0];
  const patch = (p: Partial<Layer>, key?: string) => updateLayer(layer.id, p, key);
  /** Text style changes can change the box size, so re-measure (keeping the center). */
  const patchText = (p: Partial<TextLayer>, key?: string) => {
    if (layer.type !== 'text') return;
    patch({ ...p, ...measureText({ ...layer, ...p }) } as Partial<Layer>, key);
  };

  if (cropping) {
    return (
      <View style={styles.panel}>
        <PanelHeader title="Reposition" onClose={onToggleCrop} />
        <Text style={styles.hint}>Drag to move inside the frame. Pinch to zoom.</Text>
        <View style={styles.row}>
          <ToolButton
            icon={{ ios: 'arrow.counterclockwise', android: 'restart_alt' }}
            label="Reset"
            onPress={() => patch({ crop: undefined } as Partial<Layer>)}
          />
          <ToolButton icon={{ ios: 'checkmark', android: 'check' }} label="Done" onPress={onToggleCrop} />
        </View>
      </View>
    );
  }

  const photo = layer.type === 'photo' ? layer : null;
  const adjust: Adjust = photo?.adjust ?? DEFAULT_ADJUST;
  const setAdjust = (a: Partial<Adjust>, key?: string) => patch({ adjust: { ...adjust, ...a } } as Partial<Layer>, key);

  return (
    <View style={styles.panel}>
      {/* Tabs on the left, a Done that never scrolls away on the right. */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <HScroll>
            {tabs.map((t) => (
              <Chip key={t} label={t === 'frame' && photo?.cutout ? 'Sticker' : TAB_LABEL[t]} selected={activeTab === t} onPress={() => setTab(t)} style={{ height: 30 }} />
            ))}
          </HScroll>
        </View>
        <IconButton label="Done" icon={{ ios: 'checkmark', android: 'check' }} onPress={() => select(null)} />
      </View>

      <View style={styles.content}>
        {activeTab === 'filters' && photo && <FilterStrip layer={photo} images={images} adjust={adjust} onPick={(filter) => setAdjust({ filter })} />}

        {activeTab === 'tune' && photo && (
          <View>
            <HScroll gap={6}>
              {TUNE.map((t) => (
                <Chip
                  key={t.key}
                  label={adjust[t.key] ? `${t.label} ${signed(adjust[t.key])}` : t.label}
                  selected={tune === t.key}
                  onPress={() => setTune(t.key)}
                  style={{ height: 28 }}
                />
              ))}
            </HScroll>
            <Slider
              label={TUNE.find((t) => t.key === tune)!.label}
              value={adjust[tune] * 100}
              min={-100}
              max={100}
              format={(v) => signed(v / 100)}
              onChange={(v) => setAdjust({ [tune]: Math.abs(v) < 4 ? 0 : v / 100 }, `tune-${tune}`)}
            />
          </View>
        )}

        {activeTab === 'video' && photo?.video && (
          <VideoTrimmer
            key={photo.src}
            docId={docId}
            src={photo.src}
            clip={photo.video}
            onChange={(video) => patch({ video } as Partial<Layer>, 'video')}
          />
        )}

        {activeTab === 'align' && <AlignRowPadded id={layer.id} />}

        {activeTab === 'opacity' && (
          <Slider
            label="Opacity"
            value={layer.opacity * 100}
            min={5}
            max={100}
            format={(v) => `${Math.round(v)}%`}
            onChange={(v) => patch({ opacity: v / 100 }, 'opacity')}
          />
        )}

        {activeTab === 'corners' && (layer.type === 'photo' || layer.type === 'shape') && (
          <Slider
            label="Corners"
            value={layer.radius}
            min={0}
            max={Math.min(layer.w, layer.h) / 2}
            onChange={(v) => patch({ radius: v }, 'radius')}
          />
        )}

        {activeTab === 'frame' && photo && (
          <View style={{ gap: 2 }}>
            {!photo.cutout && <HScroll gap={6}>
              {FRAMES.map((f) => (
                <Chip
                  key={f.id}
                  label={f.label}
                  selected={(photo.frame ?? 'rect') === f.id}
                  onPress={() =>
                    patch({
                      frame: f.id,
                      // Circles look best square; card frames start on their own card colour.
                      ...(f.id === 'circle' ? { w: Math.min(photo.w, photo.h), h: Math.min(photo.w, photo.h) } : {}),
                      ...(CARD_COLOR[f.id] && photo.frame !== f.id
                        ? { borderColor: CARD_COLOR[f.id], shadow: f.id !== 'film' || !!photo.shadow }
                        : {}),
                    } as Partial<Layer>)
                  }
                  style={{ height: 28 }}
                />
              ))}
            </HScroll>}
            <Slider label={photo.cutout ? 'Outline' : 'Border'} value={photo.border} min={0} max={80} onChange={(v) => patch({ border: v }, 'border')} />
            <HScroll gap={2}>
              <Chip label="Shadow" selected={!!photo.shadow} onPress={() => patch({ shadow: !photo.shadow } as Partial<Layer>)} style={{ height: 30, marginRight: 8 }} />
              <BrandColors
                current={photo.borderColor}
                size={24}
                onPick={(c) => patch({ borderColor: c, border: photo.border || 20 } as Partial<Layer>)}
              />
              {PALETTE.slice(0, 9).map((c) => (
                <Swatch key={c} color={c} size={24} selected={photo.borderColor === c} onPress={() => patch({ borderColor: c, border: photo.border || 20 } as Partial<Layer>)} />
              ))}
            </HScroll>
          </View>
        )}

        {activeTab === 'style' && layer.type === 'text' && (
          <View style={{ gap: 2 }}>
            <HScroll gap={6}>
              {STYLE_KEYS.map((k) => (
                <Chip key={k.key} label={k.label} selected={styleKey === k.key} onPress={() => setStyleKey(k.key)} style={{ height: 28 }} />
              ))}
            </HScroll>
            {styleKey === 'spacing' && (
              <Slider
                label="Spacing"
                value={(layer.spacing ?? 0) * 100}
                min={-5}
                max={30}
                format={(v) => `${Math.round(v)}`}
                onChange={(v) => patchText({ spacing: Math.round(v) / 100 }, 'spacing')}
              />
            )}
            {styleKey === 'curve' && (
              <Slider
                label="Curve"
                value={(layer.curve ?? 0) * 100}
                min={-100}
                max={100}
                format={(v) => (Math.abs(v) < 3 ? 'Off' : signed(v / 100))}
                onChange={(v) => patchText({ curve: Math.abs(v) < 3 ? 0 : v / 100 }, 'curve')}
              />
            )}
            {styleKey === 'outline' && (
              <View>
                <HScroll gap={2}>
                  <Chip label="Off" selected={!layer.outline} onPress={() => patchText({ outline: null })} style={{ height: 30, marginRight: 6 }} />
                  <BrandColors
                    current={layer.outline?.color}
                    size={24}
                    onPick={(c) => patchText({ outline: { color: c, width: layer.outline?.width ?? 0.05 } })}
                  />
                  {OUTLINE_COLORS.map((c) => (
                    <Swatch
                      key={c}
                      color={c}
                      size={24}
                      selected={layer.outline?.color === c}
                      onPress={() => patchText({ outline: { color: c, width: layer.outline?.width ?? 0.05 } })}
                    />
                  ))}
                </HScroll>
                {layer.outline && (
                  <Slider
                    label="Width"
                    value={layer.outline.width * 100}
                    min={1}
                    max={14}
                    format={(v) => `${Math.round(v)}`}
                    onChange={(v) => patchText({ outline: { ...layer.outline!, width: Math.round(v) / 100 } }, 'outline')}
                  />
                )}
              </View>
            )}
            {styleKey === 'background' && (
              <HScroll>
                <Chip
                  label="None"
                  selected={!layer.fill}
                  onPress={() => patchText((layer.fill ? { fill: null, color: layer.fill } : {}) as Partial<TextLayer>)}
                  style={{ height: 30 }}
                />
                <Chip
                  label="Pill"
                  selected={!!layer.fill && layer.fillStyle !== 'highlight'}
                  onPress={() =>
                    patchText({
                      fill: layer.fill ?? layer.color,
                      color: layer.fill ? layer.color : contrastInk(layer.color),
                      fillStyle: 'pill',
                    })
                  }
                  style={{ height: 30 }}
                />
                <Chip
                  label="Highlight"
                  selected={!!layer.fill && layer.fillStyle === 'highlight'}
                  onPress={() =>
                    patchText({
                      fill: layer.fill ?? layer.color,
                      color: layer.fill ? layer.color : contrastInk(layer.color),
                      fillStyle: 'highlight',
                    })
                  }
                  style={{ height: 30 }}
                />
              </HScroll>
            )}
            {styleKey === 'shadow' && (
              <HScroll>
                <Chip label="Off" selected={!layer.shadow} onPress={() => patchText({ shadow: false })} style={{ height: 30 }} />
                <Chip label="Soft shadow" selected={!!layer.shadow} onPress={() => patchText({ shadow: true })} style={{ height: 30 }} />
              </HScroll>
            )}
          </View>
        )}

        {activeTab === 'color' && layer.type === 'drawing' && <DrawingColors layer={layer} />}

        {activeTab === 'color' && (layer.type === 'text' || layer.type === 'shape') && (
          <HScroll gap={2}>
            <ColorWell
              value={layer.type === 'text' ? (layer.fill ?? layer.color) : layer.color}
              onChange={(c) =>
                layer.type === 'text' && layer.fill
                  ? patch({ fill: c, color: contrastInk(c) } as Partial<Layer>, 'color')
                  : patch({ color: c } as Partial<Layer>, 'color')
              }
            />
            <BrandColors
              current={layer.type === 'text' ? (layer.fill ?? layer.color) : layer.color}
              onPick={(c) =>
                layer.type === 'text' && layer.fill
                  ? patch({ fill: c, color: contrastInk(c) } as Partial<Layer>)
                  : patch({ color: c } as Partial<Layer>)
              }
            />
            {PALETTE.map((c) => {
              const current = layer.type === 'text' ? (layer.fill ?? layer.color) : layer.color;
              return (
                <Swatch
                  key={c}
                  color={c}
                  size={28}
                  selected={current === c}
                  onPress={() =>
                    // With a pill the swatch colors the pill and the ink follows it.
                    layer.type === 'text' && layer.fill
                      ? patch({ fill: c, color: contrastInk(c) } as Partial<Layer>)
                      : patch({ color: c } as Partial<Layer>)
                  }
                />
              );
            })}
          </HScroll>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actions}>
        {photo && !photo.src && (
          <ToolButton icon={{ ios: 'photo.badge.plus', android: 'add_photo_alternate' }} label="Add" active onPress={onReplace} />
        )}
        {layer.type === 'text' && !layer.sticker && (
          <ToolButton icon={{ ios: 'character.cursor.ibeam', android: 'edit' }} label="Edit" onPress={onEditText} />
        )}
        {photo && !!photo.src && (
          <>
            {onCutout && !photo.video && !photo.cutout && (
              <ToolButton icon={{ ios: 'person.crop.rectangle.badge.plus', android: 'content_cut' }} label="Cut out" active onPress={onCutout} />
            )}
            <ToolButton icon={{ ios: 'crop', android: 'crop' }} label="Crop" onPress={onToggleCrop} />
            <ToolButton icon={{ ios: 'photo.on.rectangle.angled', android: 'swap_horiz' }} label="Replace" onPress={onReplace} />
            <ToolButton icon={{ ios: 'arrow.up.left.and.arrow.down.right', android: 'fit_screen' }} label="Fill" onPress={onFillSlide} />
          </>
        )}
        <ToolButton
          icon={{ ios: 'checklist', android: 'checklist' }}
          label="Select"
          onPress={() => setMulti(true)}
        />
        {layer.group && (
          <ToolButton icon={{ ios: 'square.dashed', android: 'ungroup' }} label="Ungroup" onPress={() => ungroupLayers([layer.id])} />
        )}
        <ToolButton
          icon={layer.locked ? { ios: 'lock.fill', android: 'lock' } : { ios: 'lock.open', android: 'lock_open' }}
          label={layer.locked ? 'Locked' : 'Lock'}
          active={!!layer.locked}
          onPress={() => toggleLocked(layer.id)}
        />
        <ToolButton icon={{ ios: 'square.3.layers.3d.top.filled', android: 'flip_to_front' }} label="Forward" onPress={() => moveLayer(layer.id, 'up')} />
        <ToolButton icon={{ ios: 'square.3.layers.3d.bottom.filled', android: 'flip_to_back' }} label="Back" onPress={() => moveLayer(layer.id, 'down')} />
        <ToolButton icon={{ ios: 'rotate.right', android: 'rotate_right' }} label="Straighten" onPress={() => patch({ rotation: 0 })} />
        <ToolButton icon={{ ios: 'plus.square.on.square', android: 'content_copy' }} label="Copy" onPress={() => duplicateLayer(layer.id)} />
        <ToolButton icon={{ ios: 'trash', android: 'delete' }} label="Delete" danger onPress={() => removeLayer(layer.id)} />
      </ScrollView>
    </View>
  );
}

const signed = (v: number) => {
  const n = Math.round(v * 100);
  return n > 0 ? `+${n}` : `${n}`;
};

/** Each filter previewed on the layer's own photo. */
function FilterStrip({
  layer,
  images,
  adjust,
  onPick,
}: {
  layer: PhotoLayer;
  images: ImageMap;
  adjust: Adjust;
  onPick: (f: Adjust['filter']) => void;
}) {
  const image = images[layer.src];
  const size = 58;
  // Square-crop the preview from the middle of the photo.
  const iw = layer.aspect >= 1 ? size * layer.aspect : size;
  const ih = layer.aspect >= 1 ? size : size / layer.aspect;
  return (
    <HScroll gap={10}>
      {FILTERS.map((f) => {
        const m = adjustMatrix({ ...DEFAULT_ADJUST, filter: f.id });
        const on = adjust.filter === f.id;
        return (
          <Pressable key={f.id} onPress={() => onPick(f.id)} style={styles.filter}>
            <View style={[styles.filterThumb, on && styles.filterOn]}>
              {image && (
                <Canvas style={{ width: size, height: size }}>
                  <Image
                    image={image}
                    x={(size - iw) / 2}
                    y={(size - ih) / 2}
                    width={iw}
                    height={ih}
                    fit="fill"
                    sampling={{ filter: FilterMode.Linear, mipmap: MipmapMode.Linear }}>
                    {m && <ColorMatrix matrix={m} />}
                  </Image>
                </Canvas>
              )}
            </View>
            <Text style={[styles.filterLabel, on && { color: C.text }]}>{f.label}</Text>
          </Pressable>
        );
      })}
    </HScroll>
  );
}

/** Align a single layer on its slide. */
function AlignRowPadded({ id }: { id: string }) {
  return (
    <View style={{ paddingHorizontal: 16 }}>
      <AlignRow ids={[id]} toSlide />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, gap: 4 },
  header: { flexDirection: 'row', alignItems: 'center', paddingRight: 8, height: 40 },
  content: { minHeight: 88, justifyContent: 'center' },
  actions: { gap: 2, paddingHorizontal: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 16 },
  hint: { ...T.body, color: C.textDim, fontSize: 13, paddingHorizontal: 18 },
  filter: { alignItems: 'center', gap: 5 },
  filterThumb: {
    width: 58,
    height: 58,
    borderRadius: R.sm,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: C.surfaceHi,
  },
  filterOn: { borderColor: C.accent },
  filterLabel: { ...T.medium, color: C.textDim, fontSize: 11 },
  videoRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 10 },
});
