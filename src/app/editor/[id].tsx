import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOut,
  type SharedValue,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { type Brush, DEFAULT_BRUSH_WIDTH, DrawOverlay, DrawToolbar } from '@/components/draw-mode';
import { drawingFromStrokes } from '@/components/drawing-node';
import { EditorCanvas, type LiveTransform, PAD_X, viewMetrics } from '@/components/editor-canvas';
import { EditorOptions } from '@/components/editor-options';
import { ExportSheet } from '@/components/export-sheet';
import {
  BackgroundPanel,
  ElementsPanel,
  LayoutPanel,
  PANEL_HEIGHT,
} from '@/components/panels';
import { LayerPanel } from '@/components/layer-panel';
import { MultiPanel } from '@/components/multi-panel';
import { LayersPanel } from '@/components/layers-panel';
import { AddSlideTab, NewSlideSheet, inkFor } from '@/components/new-slide-sheet';
import { OverviewBar, SlideOverview } from '@/components/slide-overview';
import { SlidesPanel } from '@/components/slides-panel';
import { TextEditor, type TextValues } from '@/components/text-editor';
import { Glass, Icon, IconButton, type IconName, PressableScale } from '@/components/ui';
import { contrastInk } from '@/lib/color';
import { useEditorPrefs } from '@/lib/editor-prefs';
import { updateThumbnail } from '@/lib/export';
import { useFontsVersion } from '@/lib/fonts';
import { type GroupDelta, applyGroupDelta, photoImageRect } from '@/lib/geometry';
import { releaseImages, useSkImages } from '@/lib/images';
import { type GridId, type LayoutId, type MagicResult, applyLayout, gridCells } from '@/lib/layouts';
import {
  deleteProject,
  detectPhotoFaces,
  importCutout,
  importPhoto,
  importVideo,
  loadProject,
  removeUnusedPhotos,
  saveProject,
} from '@/lib/projects';
import { type SlideContent, slideContents } from '@/lib/slide-layouts';
import { selectedLayer, useEditor } from '@/lib/store';
import { measureText } from '@/lib/text';
import {
  ASPECTS,
  type Crop,
  type Doc,
  type Layer,
  MAX_SLIDES,
  type PhotoLayer,
  SLIDE_WIDTH,
  type ShapeLayer,
  type Stroke,
  type TextLayer,
  type NormRect,
  type VideoClip,
  uid,
} from '@/lib/types';
import { C, T } from '@/theme';

import { isSubjectLiftAvailable, isVisionAvailable } from '../../../modules/seam-vision';

type Panel = 'layout' | 'background' | 'slides' | 'elements' | 'layers' | null;
type TextSession = { mode: 'new'; size: number; initial: TextValues } | { mode: 'edit'; id: string; initial: TextValues };

export default function EditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const doc = useEditor((s) => s.doc);
  const selected = useEditor(selectedLayer);
  const selectedIds = useEditor((s) => s.selectedIds);
  const multi = useEditor((s) => s.multi);
  useFontsVersion();
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const { open, close, undo, redo, select, commit, addLayers, updateLayer, updateLayers, toggleSelect, setMulti } =
    useEditor.getState();
  const snapping = useEditorPrefs((s) => s.snapping);

  const [area, setArea] = useState({ width: 0, height: 0 });
  const [panel, setPanel] = useState<Panel>(null);
  const [text, setText] = useState<TextSession | null>(null);
  // Label of a long-running media job (import, cutout); false when idle.
  const [importing, setImporting] = useState<string | false>(false);
  const [exporting, setExporting] = useState(false);
  const [cropId, setCropId] = useState<string | null>(null);
  const [slidesFocus, setSlidesFocus] = useState(0);
  /** Slide overview; the number is the slide that was in view when it opened. */
  const [overview, setOverview] = useState<number | null>(null);
  /** Where the New Slide sheet will insert, while it's open. */
  const [newSlideAt, setNewSlideAt] = useState<number | null>(null);
  /** Ink being drawn (canvas coords) until Done turns it into a layer. */
  const [draw, setDraw] = useState<{ strokes: Stroke[]; brush: Brush } | null>(null);
  const lastBrush = useRef<Brush | null>(null);
  const scrollX = useSharedValue(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** Set once Back has already saved and cleaned up, so unmount doesn't repeat it. */
  const finished = useRef(false);

  // Load on mount; tidy up on the way out (also covers leaving without the Back button).
  useEffect(() => {
    let alive = true;
    loadProject(id).then((d) => {
      if (alive && d) {
        open(d);
        findFaces(d);
      } else if (alive) router.replace('/');
    });
    return () => {
      alive = false;
      clearTimeout(saveTimer.current);
      const last = useEditor.getState().doc;
      if (last && !finished.current) finishProject(last).catch(() => {});
      close();
    };
  }, [id, open, close]);

  // Debounced autosave, plus an immediate save when the app is backgrounded.
  useEffect(() => {
    if (!doc) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveProject(doc), 500);
  }, [doc]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const current = useEditor.getState().doc;
      if (state !== 'active' && current) saveProject(current);
    });
    return () => sub.remove();
  }, []);

  const images = useSkImages(doc?.id ?? '', doc?.layers ?? []);
  const metrics = doc && area.width ? viewMetrics(doc, area.width, area.height) : null;
  const slidePx = metrics ? SLIDE_WIDTH * metrics.vs : 1;


  if (!doc) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={C.text} />
      </View>
    );
  }

  const H = ASPECTS[doc.aspect].height;

  /** Slide under the middle of the screen, read on demand so scrolling doesn't re-render the editor. */
  const currentSlide = () => {
    const count = useEditor.getState().doc?.slideCount ?? 1;
    const i = Math.floor((area.width / 2 - PAD_X + scrollX.get()) / slidePx);
    return Math.max(0, Math.min(count - 1, i));
  };

  // Uses the latest store state: the slide count may have just changed.
  const scrollToSlide = (i: number, animated = true) => {
    const latest = useEditor.getState().doc;
    if (!latest || !area.width) return;
    const m = viewMetrics(latest, area.width, area.height);
    const px = SLIDE_WIDTH * m.vs;
    const target = Math.max(0, Math.min(m.maxScroll, PAD_X + i * px + px / 2 - area.width / 2));
    scrollX.set(animated ? withTiming(target, { duration: 280 }) : target);
  };

  const slideCenter = (i = currentSlide()) => i * SLIDE_WIDTH + SLIDE_WIDTH / 2;

  /**
   * Picks photos. With `into`, the first photo replaces that layer's image
   * (keeping its frame). Otherwise photos fill empty template slots first,
   * left to right, and any extras are added to the canvas.
   */
  const pickPhotos = async (into?: string) => {
    setPanel(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: !into,
      selectionLimit: into ? 1 : 20,
      orderedSelection: true,
      quality: 0.9,
    });
    if (result.canceled || result.assets.length === 0) return;
    setImporting('Importing…');
    try {
      const imported = await mapLimit(result.assets, 3, async (asset): Promise<Imported> => {
        if (asset.type === 'video') {
          const v = await importVideo(doc.id, asset.uri, asset.duration ?? 0);
          return { ...v, video: clipFor(v.duration) };
        }
        const p = await importPhoto(doc.id, asset.uri, asset);
        return { ...p, faces: await detectPhotoFaces(doc.id, p.src) };
      });
      const latest = useEditor.getState().doc ?? doc;
      const fill = (l: PhotoLayer, p: Imported): PhotoLayer => ({
        ...l,
        src: p.src,
        aspect: p.width / p.height,
        slot: false,
        crop: undefined,
        video: p.video,
        faces: p.faces,
        cutout: undefined,
      });

      if (into) {
        const target = latest.layers.find((l) => l.id === into);
        if (target?.type === 'photo') updateLayer(into, fill(target, imported[0]));
        select(into);
        return;
      }

      const slots = latest.layers
        .filter((l): l is PhotoLayer => l.type === 'photo' && !l.src)
        .sort((a, b) => a.x - b.x);
      const filled = new Map(slots.slice(0, imported.length).map((l, i) => [l.id, fill(l, imported[i])]));
      const rest = imported.slice(slots.length);

      const firstBatch = !latest.layers.some((l) => l.type === 'photo');
      const focus = currentSlide();
      const layers: PhotoLayer[] = rest.map((p, i) => {
        const aspect = p.width / p.height;
        const maxW = SLIDE_WIDTH * 0.8;
        const maxH = H * 0.8;
        const box = aspect > maxW / maxH ? { w: maxW, h: maxW / aspect } : { w: maxH * aspect, h: maxH };
        return {
          id: uid(),
          type: 'photo',
          src: p.src,
          video: p.video,
          faces: p.faces,
          aspect,
          x: slideCenter(Math.min(focus + i, 19)),
          y: H / 2,
          ...box,
          scale: 1,
          rotation: 0,
          opacity: 1,
          radius: 0,
          border: 0,
          borderColor: '#FFFFFF',
        };
      });
      if (firstBatch && layers.length > 1) {
        // A first multi-photo pick gets arranged straight away.
        const res = applyLayout('seamless', layers, latest.aspect, latest.slideCount);
        commit((d) => ({ ...d, slideCount: res.slideCount, layers: [...res.photos, ...d.layers] }));
        select(res.photos.at(-1)?.id ?? null);
        scrollToSlide(0);
      } else {
        // One commit, so a single undo removes the photos and any slides they added.
        const needed = layers.length ? Math.min(20, focus + layers.length) : 0;
        commit((d) => ({
          ...d,
          slideCount: Math.max(d.slideCount, needed),
          layers: [...d.layers.map((l) => filled.get(l.id) ?? l), ...layers],
        }));
        select(layers.at(-1)?.id ?? null);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Could not add photos', String(e));
    } finally {
      setImporting(false);
    }
  };

  /**
   * Lifts the photo's subject (iOS Vision) into a sticker layer that sits
   * exactly over it, so it can pop out of its frame or move on its own.
   */
  const cutout = async (layerId: string) => {
    const l = useEditor.getState().doc?.layers.find((x) => x.id === layerId);
    if (l?.type !== 'photo' || !l.src || l.video) return;
    if (!isSubjectLiftAvailable()) {
      Alert.alert(
        'Cutouts need the Seam app',
        isVisionAvailable()
          ? 'Lifting a subject needs iOS 17 or later.'
          : 'Subject cutouts use iOS Vision, which Expo Go doesn’t include. Open this project in the Seam app build.',
      );
      return;
    }
    setImporting('Lifting subject…');
    try {
      const res = await importCutout(doc.id, l.src);
      if (!res) {
        Alert.alert('No subject found', 'Try a photo with a clear person, pet or object in front.');
        return;
      }
      // The cutout's rect inside the drawn image, then out to canvas space.
      const img = photoImageRect(l);
      const w = res.rect.width * img.width;
      const h = res.rect.height * img.height;
      const lx = img.x + res.rect.x * img.width + w / 2;
      const ly = img.y + res.rect.y * img.height + h / 2;
      const cos = Math.cos(l.rotation) * l.scale;
      const sin = Math.sin(l.rotation) * l.scale;
      const layer: PhotoLayer = {
        id: uid(),
        type: 'photo',
        src: res.src,
        aspect: res.width / res.height,
        x: l.x + lx * cos - ly * sin,
        y: l.y + lx * sin + ly * cos,
        w,
        h,
        scale: l.scale,
        rotation: l.rotation,
        opacity: 1,
        radius: 0,
        border: Math.round(Math.min(w, h) * 0.02),
        borderColor: '#FFFFFF',
        shadow: true,
        cutout: true,
        adjust: l.adjust,
      };
      commit((d) => {
        const layers = [...d.layers];
        layers.splice(layers.findIndex((x) => x.id === layerId) + 1, 0, layer);
        return { ...d, layers };
      });
      select(layer.id);
      setCropId(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert(
        'Could not cut out the subject',
        // The Simulator has no Neural Engine for the segmentation model.
        /inference context/i.test(message)
          ? 'This device can’t run the cutout model. Try on an iPhone with iOS 17 or later.'
          : message.replace(/\s*\(at [^)]*\)\s*$/, ''),
      );
    } finally {
      setImporting(false);
    }
  };

  const applyLayoutId = (layoutId: LayoutId) => {
    const photos = doc.layers.filter((l): l is PhotoLayer => l.type === 'photo');
    const res = applyLayout(layoutId, photos, doc.aspect, doc.slideCount);
    const byId = new Map(res.photos.map((p) => [p.id, p]));
    commit((d) => ({
      ...d,
      slideCount: res.slideCount,
      layers: d.layers.map((l) => byId.get(l.id) ?? l),
    }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const onTransform = (layerId: string, t: LiveTransform) => updateLayer(layerId, t);

  const onGroupTransform = (ids: string[], d: GroupDelta) => {
    const moved = Math.abs(d.dx) > 0.5 || Math.abs(d.dy) > 0.5 || Math.abs(d.scale - 1) > 0.001 || Math.abs(d.rotation) > 0.001;
    if (!moved) return;
    const layers = useEditor.getState().doc?.layers ?? [];
    updateLayers(Object.fromEntries(layers.filter((l) => ids.includes(l.id)).map((l) => [l.id, applyGroupDelta(l, d)])));
  };

  /**
   * A photo was dropped on a layout cell. Cell to cell swaps their images; a
   * free photo moves into the cell (swapping with whatever was there, or
   * disappearing into it if the cell was empty).
   */
  const onDropInto = (fromId: string, toId: string) => {
    const layers = useEditor.getState().doc?.layers ?? [];
    const from = layers.find((l) => l.id === fromId);
    const to = layers.find((l) => l.id === toId);
    if (from?.type !== 'photo' || to?.type !== 'photo') return;
    const content = (l: PhotoLayer): Partial<PhotoLayer> => ({
      src: l.src,
      aspect: l.aspect,
      video: l.video,
      adjust: l.adjust,
      faces: l.faces,
      cutout: l.cutout,
      crop: undefined,
      slot: !l.src,
    });
    const intoCell = { ...to, ...content(from) } as PhotoLayer;
    const keepFrom = from.cell || !!to.src;
    commit((d) => ({
      ...d,
      layers: d.layers.flatMap((l) => {
        if (l.id === toId) return [intoCell];
        if (l.id === fromId) return keepFrom ? [{ ...from, ...content(to) } as PhotoLayer] : [];
        return [l];
      }),
    }));
    select(toId);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const onMagic = (result: MagicResult) => {
    const byId = new Map(result.photos.map((p) => [p.id, p]));
    commit((d) => ({
      ...d,
      slideCount: result.slideCount,
      background: { kind: 'solid', color: result.background },
      layers: d.layers.map((l) => byId.get(l.id) ?? l),
    }));
    select(null);
    setTimeout(() => scrollToSlide(0), 0);
  };

  const addGrid = (gridId: GridId) => {
    const cells = gridCells(gridId, currentSlide(), doc.aspect);
    // Under everything else: cells are the scaffolding photos get dropped into.
    commit((d) => ({ ...d, layers: [...cells, ...d.layers] }));
    select(null);
    setPanel(null);
  };
  const onCrop = (layerId: string, crop: Crop) => updateLayer(layerId, { crop } as Partial<Layer>);

  const onDoubleTap = (layerId: string) => {
    const layer = doc.layers.find((l) => l.id === layerId);
    if (layer?.type === 'photo' && !layer.src) {
      pickPhotos(layerId);
    } else if (layer?.type === 'photo' && layer.cutout) {
      select(layerId);
    } else if (layer?.type === 'photo') {
      select(layerId);
      setCropId((c) => (c === layerId ? null : layerId));
    } else if (layer?.type === 'text' && !layer.sticker) {
      editText(layerId);
    }
  };

  const bgColor = doc.background.kind === 'solid' ? doc.background.color : doc.background.colors[0];

  const startText = () => {
    setPanel(null);
    setText({
      mode: 'new',
      size: 96,
      initial: { text: '', font: 'sans', color: contrastInk(bgColor), align: 'center', fill: null },
    });
  };

  const editText = (layerId: string) => {
    const layer = doc.layers.find((l) => l.id === layerId);
    if (layer?.type !== 'text') return;
    const { text: t, font, color, align, fill } = layer;
    setText({ mode: 'edit', id: layerId, initial: { text: t, font, color, align, fill } });
  };

  const finishText = (values: TextValues) => {
    if (!text) return;
    if (!values.text) {
      // Clearing all the text removes the layer (or just cancels a new one).
      if (text.mode === 'edit') useEditor.getState().removeLayer(text.id);
      setText(null);
      return;
    }
    if (text.mode === 'edit') {
      const layer = doc.layers.find((l) => l.id === text.id) as TextLayer;
      updateLayer(text.id, { ...values, ...measureText({ ...layer, ...values }) });
    } else {
      const size = text.size;
      const layer: TextLayer = {
        id: uid(),
        type: 'text',
        ...values,
        size,
        ...measureText({ ...values, size }),
        x: slideCenter(),
        y: H / 2,
        scale: 1,
        rotation: 0,
        opacity: 1,
      };
      addLayers([layer]);
    }
    setText(null);
  };

  const addSticker = (emoji: string) => {
    const values = { text: emoji, font: 'sans' as const, color: '#000000', align: 'center' as const, fill: null };
    const layer: TextLayer = {
      id: uid(),
      type: 'text',
      sticker: true,
      ...values,
      size: 180,
      ...measureText({ ...values, size: 180 }),
      x: slideCenter(),
      y: H / 2,
      scale: 1,
      rotation: 0,
      opacity: 1,
    };
    addLayers([layer]);
    setPanel(null);
  };

  const addShape = (shape: ShapeLayer['shape']) => {
    const size = shape === 'line' ? { w: 640, h: 10 } : { w: 420, h: 420 };
    addLayers([
      {
        id: uid(),
        type: 'shape',
        shape,
        color: C.accent,
        radius: 0,
        ...size,
        x: slideCenter(),
        y: H / 2,
        scale: 1,
        rotation: 0,
        opacity: 1,
      },
    ]);
    setPanel(null);
  };

  const fillSlide = () => {
    if (!selected) return;
    const slide = Math.max(0, Math.min(doc.slideCount - 1, Math.floor(selected.x / SLIDE_WIDTH)));
    updateLayer(selected.id, {
      x: slideCenter(slide),
      y: H / 2,
      w: SLIDE_WIDTH,
      h: H,
      scale: 1,
      rotation: 0,
      radius: 0,
      crop: undefined,
    } as Partial<Layer>);
  };

  const openOverview = () => {
    setMulti(false);
    setPanel(null);
    setCropId(null);
    setOverview(currentSlide());
  };

  /** Back to editing, on slide `slide` when one was tapped. */
  const closeOverview = (slide?: number) => {
    if (slide != null) scrollToSlide(slide, false);
    setOverview(null);
  };

  const insertNewSlide = (content: SlideContent) => {
    if (newSlideAt == null) return;
    const at = newSlideAt;
    const latest = useEditor.getState().doc ?? doc;
    useEditor.getState().insertSlide(at, slideContents(content, at, latest.aspect, inkFor(latest)));
    setNewSlideAt(null);
    setSlidesFocus(at);
    // Let the store update land first so the new slide exists to scroll to.
    if (overview == null) setTimeout(() => scrollToSlide(at), 0);
  };

  const startDraw = () => {
    setMulti(false);
    setPanel(null);
    setCropId(null);
    setDraw({ strokes: [], brush: lastBrush.current ?? { color: contrastInk(bgColor), width: DEFAULT_BRUSH_WIDTH } });
  };

  const setBrush = (brush: Brush) => {
    lastBrush.current = brush;
    setDraw((d) => d && { ...d, brush });
  };

  const finishDraw = () => {
    const layer = draw && drawingFromStrokes(draw.strokes, uid());
    if (layer) {
      addLayers([layer]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setDraw(null);
  };

  const cancelDraw = () => {
    if (!draw?.strokes.length) return setDraw(null);
    Alert.alert('Discard drawing?', undefined, [
      { text: 'Keep drawing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => setDraw(null) },
    ]);
  };

  const leave = async () => {
    clearTimeout(saveTimer.current);
    // Leaving mid-drawing keeps the ink rather than dropping it.
    if (draw) finishDraw();
    const last = useEditor.getState().doc;
    // Save and render the thumbnail before Home lists projects.
    finished.current = true;
    if (last) await finishProject(last).catch(() => {});
    router.back();
  };

  const rename = () =>
    Alert.prompt(
      'Rename project',
      undefined,
      (name) => {
        const trimmed = name.trim();
        if (trimmed) commit((d) => ({ ...d, name: trimmed }));
      },
      'plain-text',
      doc.name,
    );

  // The layers list stays up while you pick layers from it.
  const panelKey = draw
    ? 'draw'
    : overview != null
      ? 'overview'
      : panel === 'layers'
        ? 'layers'
        : multi || selectedIds.length > 1
          ? 'multi'
          : selected
            ? `layer-${selected.id}`
            : (panel ?? 'dock');

  const bottom = (() => {
    if (draw) {
      return (
        <DrawToolbar
          brush={draw.brush}
          onBrush={setBrush}
          canUndo={draw.strokes.length > 0}
          onUndo={() => setDraw((d) => d && { ...d, strokes: d.strokes.slice(0, -1) })}
          onCancel={cancelDraw}
          onDone={finishDraw}
        />
      );
    }
    if (overview != null) {
      return <OverviewBar count={doc.slideCount} onAdd={() => setNewSlideAt(doc.slideCount)} onDone={() => closeOverview()} />;
    }
    if (panel === 'layers') {
      return (
        <LayersPanel
          images={images}
          selectedId={selected?.id ?? null}
          onSelect={(layerId) => (multi ? toggleSelect(layerId) : select(layerId === selected?.id ? null : layerId))}
          onClose={() => setPanel(null)}
        />
      );
    }
    if (multi || selectedIds.length > 1) return <MultiPanel />;
    if (selected) {
      return (
        <LayerPanel
          key={selected.id}
          images={images}
          cropping={cropId === selected.id}
          onEditText={() => editText(selected.id)}
          onFillSlide={fillSlide}
          onReplace={() => pickPhotos(selected.id)}
          onCutout={() => cutout(selected.id)}
          onToggleCrop={() => setCropId((c) => (c === selected.id ? null : selected.id))}
        />
      );
    }
    switch (panel) {
      case 'layout':
        return (
          <LayoutPanel
            images={images}
            onApply={applyLayoutId}
            onMagic={onMagic}
            onAddPhotos={() => pickPhotos()}
            onClose={() => setPanel(null)}
          />
        );
      case 'background':
        return <BackgroundPanel onClose={() => setPanel(null)} />;
      case 'slides':
        return (
          <SlidesPanel
            images={images}
            focused={slidesFocus}
            onFocus={(i) => {
              setSlidesFocus(i);
              // Let the store update land first (e.g. a slide just added).
              setTimeout(() => scrollToSlide(i), 0);
            }}
            onAdd={setNewSlideAt}
            onClose={() => setPanel(null)}
          />
        );
      case 'elements':
        return (
          <ElementsPanel onAddShape={addShape} onAddSticker={addSticker} onAddGrid={addGrid} onClose={() => setPanel(null)} />
        );
      default:
        return (
          <View style={styles.tools}>
            <DockTool icon={{ ios: 'photo.on.rectangle.angled', android: 'add_photo_alternate' }} label="Media" onPress={() => pickPhotos()} />
            <DockTool icon={{ ios: 'textformat', android: 'title' }} label="Text" onPress={startText} />
            <DockTool icon={{ ios: 'scribble.variable', android: 'draw' }} label="Draw" onPress={startDraw} />
            <DockTool icon={{ ios: 'square.grid.3x1.below.line.grid.1x2', android: 'view_carousel' }} label="Layout" onPress={() => setPanel('layout')} />
            <DockTool icon={{ ios: 'circle.lefthalf.filled', android: 'format_paint' }} label="Color" onPress={() => setPanel('background')} />
            <DockTool icon={{ ios: 'star.square.on.square', android: 'interests' }} label="Shapes" onPress={() => setPanel('elements')} />
            <DockTool icon={{ ios: 'square.3.layers.3d', android: 'layers' }} label="Layers" onPress={() => setPanel('layers')} />
            <DockTool
              icon={{ ios: 'rectangle.split.3x1', android: 'view_week' }}
              label="Slides"
              onPress={() => {
                setSlidesFocus(currentSlide());
                setPanel('slides');
              }}
            />
          </View>
        );
    }
  })();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Glass interactive style={styles.pill}>
          <IconButton label="Back" icon={{ ios: 'chevron.left', android: 'arrow_back' }} onPress={leave} />
          <Pressable onPress={rename} hitSlop={6} style={styles.title}>
            <Text style={styles.titleText} numberOfLines={1}>
              {doc.name}
            </Text>
          </Pressable>
        </Glass>
        <View style={{ flex: 1 }} />
        <Glass interactive style={styles.pill}>
          <IconButton label="Undo" icon={{ ios: 'arrow.uturn.backward', android: 'undo' }} disabled={!canUndo} onPress={undo} />
          <IconButton label="Redo" icon={{ ios: 'arrow.uturn.forward', android: 'redo' }} disabled={!canRedo} onPress={redo} />
          <View style={styles.divider} />
          <IconButton
            label={overview != null ? 'Close overview' : 'Overview'}
            icon={{ ios: 'square.grid.2x2', android: 'grid_view' }}
            tone={overview != null ? 'filled' : 'plain'}
            disabled={!!draw}
            onPress={() => (overview != null ? closeOverview() : openOverview())}
          />
          <EditorOptions
            overview={overview != null}
            disabled={!!draw}
            onOverview={() => (overview != null ? closeOverview() : openOverview())}
            onSelectMultiple={() => {
              closeOverview();
              setPanel(null);
              setMulti(true);
            }}
            onPreview={() => {
              select(null);
              router.push('/preview');
            }}
          />
        </Glass>
        <IconButton
          label="Export"
          tone="accent"
          icon={{ ios: 'arrow.down', android: 'download' }}
          // Ink isn't part of the doc until Done.
          disabled={!!draw}
          onPress={() => {
            select(null);
            setExporting(true);
          }}
        />
      </View>

      <View
        style={{ flex: 1 }}
        onLayout={(e) => setArea({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
        {area.width > 0 && (
          <EditorCanvas
            doc={doc}
            images={images}
            width={area.width}
            height={area.height}
            scrollX={scrollX}
            selectedId={selected?.id ?? null}
            selectedIds={selectedIds}
            multi={multi}
            cropId={cropId}
            onSelect={(layerId) => {
              select(layerId);
              if (layerId !== cropId) setCropId(null);
              if (layerId && panel !== 'layers') setPanel(null);
            }}
            onToggle={toggleSelect}
            onTransform={onTransform}
            onGroupTransform={onGroupTransform}
            onCrop={onCrop}
            onDoubleTap={onDoubleTap}
            onDropInto={onDropInto}
            snapping={snapping}
            onPinchOut={openOverview}
          />
        )}
        {metrics && overview == null && !draw && doc.slideCount < MAX_SLIDES && (
          <AddSlideTab
            scrollX={scrollX}
            // Centered in the padding just past the last slide.
            x={PAD_X + doc.slideCount * slidePx + PAD_X / 2}
            y={metrics.offsetY + (H * metrics.vs) / 2}
            onPress={() => setNewSlideAt(doc.slideCount)}
          />
        )}
        {draw && area.width > 0 && (
          <DrawOverlay
            doc={doc}
            width={area.width}
            height={area.height}
            scrollX={scrollX}
            strokes={draw.strokes}
            brush={draw.brush}
            onStroke={(stroke) => setDraw((d) => d && { ...d, strokes: [...d.strokes, stroke] })}
          />
        )}
        {overview != null && area.width > 0 && (
          <SlideOverview
            doc={doc}
            images={images}
            width={area.width}
            height={area.height}
            current={Math.min(overview, doc.slideCount - 1)}
            onOpen={closeOverview}
            onAdd={setNewSlideAt}
          />
        )}
        {doc.layers.length === 0 && !importing && overview == null && !draw && (
          <View style={styles.emptyHint} pointerEvents="none">
            <Text style={styles.emptyHintText}>{'Add photos or video to begin.\nPick several and they flow\nacross the slides.'}</Text>
          </View>
        )}
        {importing && (
          <View style={styles.importing}>
            <ActivityIndicator color={C.text} />
            <Text style={styles.importingText}>{importing}</Text>
          </View>
        )}
      </View>

      {overview != null ? (
        <View style={styles.pager} />
      ) : (
        <Pager scrollX={scrollX} slidePx={slidePx} width={area.width} count={doc.slideCount} />
      )}

      <View style={[styles.bottomWrap, { paddingBottom: Math.max(insets.bottom - 6, 10) }]}>
        <Glass
          style={[
            styles.bottom,
            panelKey === 'dock' || panelKey === 'overview'
              ? styles.dock
              : {
                  // Same height for one or many selected, so the canvas doesn't jump.
                  height:
                    panelKey === 'draw'
                      ? DRAW_PANEL_HEIGHT
                      : panelKey === 'multi' || selected || panel === 'layers'
                        ? PANEL_HEIGHT + 82
                        : PANEL_HEIGHT + 44,
                },
          ]}>
          <Animated.View
            key={panelKey}
            entering={FadeInDown.springify().damping(20).stiffness(260)}
            exiting={FadeOut.duration(90)}
            style={{ flex: 1, justifyContent: 'center' }}>
            {bottom}
          </Animated.View>
        </Glass>
      </View>

      {text && (
        <TextEditor
          initial={text.initial}
          canvasColor={bgColor}
          onCancel={() => setText(null)} onDone={finishText} />
      )}
      {exporting && <ExportSheet doc={doc as Doc} onClose={() => setExporting(false)} />}
      {newSlideAt != null && (
        <NewSlideSheet doc={doc} index={newSlideAt} onPick={insertNewSlide} onClose={() => setNewSlideAt(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 2,
    maxWidth: 210,
  },
  divider: { width: StyleSheet.hairlineWidth, height: 20, backgroundColor: C.line, marginHorizontal: 2 },
  title: { paddingLeft: 2, paddingRight: 14, flexShrink: 1 },
  titleText: { ...T.display, fontSize: 19 },
  emptyHint: { position: 'absolute', left: 48, right: 48, top: 0, bottom: 0, justifyContent: 'center' },
  emptyHintText: { ...T.displayItalic, color: '#00000070', fontSize: 22, textAlign: 'center', lineHeight: 28 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 22 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.line },
  dotOn: { width: 16, backgroundColor: C.text },
  pagerText: { ...T.medium, color: C.textDim, fontSize: 12, fontVariant: ['tabular-nums'], letterSpacing: 1 },
  bottomWrap: { paddingHorizontal: 10, paddingTop: 6 },
  bottom: { borderRadius: 30, paddingVertical: 8, justifyContent: 'center' },
  dock: { height: 84, borderRadius: 32 },
  tools: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 2 },
  dockTool: { width: 42, alignItems: 'center', gap: 7, paddingVertical: 4 },
  dockIcon: { height: 30, justifyContent: 'center' },
  dockLabel: { ...T.medium, color: C.textDim, fontSize: 11, letterSpacing: 0.2 },
  importing: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#000000AA',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  importingText: { ...T.medium, fontSize: 14 },
});

const DRAW_PANEL_HEIGHT = 152;

/** A bare tool in the dock, narrower than a ToolButton so all eight fit across a phone. */
function DockTool({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={styles.dockTool}>
      <View style={styles.dockIcon}>
        <Icon name={icon} size={23} />
      </View>
      <Text style={styles.dockLabel} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** Slide counter. Owns its scroll subscription so scrolling only re-renders this. */
function Pager({
  scrollX,
  slidePx,
  width,
  count,
}: {
  scrollX: SharedValue<number>;
  slidePx: number;
  width: number;
  count: number;
}) {
  // Worklet closure; keep it out of the React Compiler (see EditorCanvas).
  'use no memo';
  const [slide, setSlide] = useState(0);
  useAnimatedReaction(
    () => Math.floor((width / 2 - PAD_X + scrollX.get()) / slidePx),
    (next, prev) => {
      if (next !== prev) scheduleOnRN(setSlide, Math.max(0, next));
    },
  );
  const current = Math.min(slide, count - 1);
  return (
    <View style={styles.pager}>
      {count <= 12 ? (
        Array.from({ length: count }, (_, i) => (
          <View key={i} style={[styles.dot, i === current && styles.dotOn]} />
        ))
      ) : (
        <Text style={styles.pagerText}>
          {current + 1} / {count}
        </Text>
      )}
    </View>
  );
}

/** Saves, renders the thumbnail and frees memory/disk for a project being closed. */
async function finishProject(doc: Doc) {
  // A project (blank or from a template) opened and left without any edit isn't worth keeping.
  if (doc.updatedAt === doc.createdAt) {
    deleteProject(doc.id);
    return;
  }
  saveProject(doc);
  removeUnusedPhotos(doc);
  await updateThumbnail(doc);
  // The same project may already be open again (quick re-entry); keep its photos then.
  if (useEditor.getState().doc?.id !== doc.id) releaseImages(doc.id);
}

/** Runs `fn` over `items` with at most `limit` in flight, keeping order. */
/** Projects made before face detection (or in Expo Go) get their faces found in the background. */
async function findFaces(doc: Doc) {
  const todo = doc.layers.filter(
    (l): l is PhotoLayer => l.type === 'photo' && !!l.src && !l.video && !l.cutout && l.faces === undefined,
  );
  if (todo.length === 0 || !isVisionAvailable()) return;
  const patches: Record<string, Partial<Layer>> = {};
  for (const l of todo) {
    const faces = await detectPhotoFaces(doc.id, l.src);
    if (faces) patches[l.id] = { faces } as Partial<Layer>;
  }
  if (useEditor.getState().doc?.id === doc.id) useEditor.getState().annotate(patches);
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

type Imported = { src: string; width: number; height: number; video?: VideoClip; faces?: NormRect[] };

/** New clips start at the beginning and play up to 15 seconds. */
const clipFor = (duration: number): VideoClip => ({
  duration,
  start: 0,
  length: Math.min(duration || 15, 15),
  muted: false,
});
