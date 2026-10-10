import {
  Canvas,
  DashPathEffect,
  Group,
  Line,
  Rect,
  type Transforms3d,
  rect,
  vec,
} from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  type SharedValue,
  cancelAnimation,
  useDerivedValue,
  useSharedValue,
  withDecay,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
  DEFAULT_CROP,
  type GroupDelta,
  NO_DELTA,
  applyGroupDelta,
  bounds,
  faceBoxes,
  frameInner,
} from '@/lib/geometry';
import type { ImageMap } from '@/lib/images';
import { ASPECTS, type Crop, type Doc, type Layer, SLIDE_WIDTH, canvasSize } from '@/lib/types';
import { C } from '@/theme';

import { DocRenderer, LiveCroppedImage, layerTransform, useGroupTransform } from './doc-renderer';

export const PAD_X = 36;
export const PAD_Y = 16;

/** Side padding around a grid puzzle, which is shown whole (it's small on screen as it is). */
const GRID_PAD = 14;

/**
 * Screen scale for the canvas. A carousel fits one slide to the width and
 * scrolls sideways; a grid puzzle fits the whole grid, like a profile.
 */
export function viewMetrics(doc: Pick<Doc, 'aspect' | 'slideCount' | 'grid'>, width: number, height: number) {
  if (doc.grid != null) {
    const { width: W, height: CH } = canvasSize(doc);
    const vs = Math.min((height - PAD_Y * 2) / CH, (width - GRID_PAD * 2) / W);
    return { vs, offsetX: (width - W * vs) / 2, offsetY: Math.max(PAD_Y, (height - CH * vs) / 2), maxScroll: 0 };
  }
  const H = ASPECTS[doc.aspect].height;
  const vs = Math.min((height - PAD_Y * 2) / H, (width - PAD_X * 2) / SLIDE_WIDTH);
  const contentWidth = canvasSize(doc).width * vs + PAD_X * 2;
  const offsetY = Math.max(PAD_Y, (height - H * vs) / 2);
  return { vs, offsetX: PAD_X, offsetY, maxScroll: Math.max(0, contentWidth - width) };
}

export type LiveTransform = { x: number; y: number; scale: number; rotation: number };

type Box = { left: number; right: number; top: number; bottom: number };

type Geo = LiveTransform & {
  id: string;
  w: number;
  h: number;
  /** Image area inside the frame (differs from w/h for polaroids). */
  iw: number;
  ih: number;
  aspect: number;
  crop: Crop;
  /** Covers most of a slide: dragging it while unselected scrolls instead. */
  backdrop: boolean;
  /** Hidden or locked: invisible to taps and gestures. */
  blocked: boolean;
  hidden: boolean;
  photo: boolean;
  /** Has an image to move (for dropping into cells). */
  filled: boolean;
  /** Layout cell (or empty slot) that accepts a dropped photo. */
  cell: boolean;
  box: Box;
};

type Props = {
  doc: Doc;
  images: ImageMap;
  width: number;
  height: number;
  scrollX: SharedValue<number>;
  selectedId: string | null;
  selectedIds: string[];
  /** Taps add to / remove from the selection. */
  multi: boolean;
  /** Photo being repositioned inside its frame, if any. */
  cropId: string | null;
  onSelect: (id: string | null) => void;
  onToggle: (id: string) => void;
  onTransform: (id: string, t: LiveTransform) => void;
  onGroupTransform: (ids: string[], delta: GroupDelta) => void;
  onCrop: (id: string, crop: Crop) => void;
  onDoubleTap: (id: string) => void;
  /** A photo was dropped onto a layout cell. */
  onDropInto: (fromId: string, toId: string) => void;
  /** Guides and right-angle rotation snapping (the editor's Snapping option). */
  snapping?: boolean;
  /** Pinched in on empty canvas: zoom out to the slide overview. */
  onPinchOut?: () => void;
};

const SNAP_PX = 9;
const ROTATE_SNAP = 0.06;
const TAP_SLOP = 10;
/** Pinch scale on empty canvas that opens the overview. */
const OVERVIEW_PINCH = 0.75;
const NO_SNAP = { dx: 0, dy: 0, gx: -1, gy: -1 };

function hitTest(layers: Geo[], px: number, py: number, slop: number, prefer: string | null) {
  'worklet';
  const inside = (l: Geo) => {
    const dx = px - l.x;
    const dy = py - l.y;
    const c = Math.cos(-l.rotation);
    const s = Math.sin(-l.rotation);
    const lx = (dx * c - dy * s) / l.scale;
    const ly = (dx * s + dy * c) / l.scale;
    const pad = slop / l.scale;
    return Math.abs(lx) <= l.w / 2 + pad && Math.abs(ly) <= l.h / 2 + pad;
  };
  if (prefer) {
    const p = layers.find((l) => l.id === prefer);
    if (p && !p.blocked && inside(p)) return p;
  }
  for (let i = layers.length - 1; i >= 0; i--) {
    if (!layers[i].blocked && inside(layers[i])) return layers[i];
  }
  return null;
}

/** Topmost cell under the point, other than `except`. */
function cellAt(layers: Geo[], px: number, py: number, except: string) {
  'worklet';
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i];
    if (!l.cell || l.id === except || l.hidden) continue;
    const dx = px - l.x;
    const dy = py - l.y;
    const c = Math.cos(-l.rotation);
    const s = Math.sin(-l.rotation);
    const lx = (dx * c - dy * s) / l.scale;
    const ly = (dx * s + dy * c) / l.scale;
    if (Math.abs(lx) <= l.w / 2 && Math.abs(ly) <= l.h / 2) return l.id;
  }
  return null;
}

/** Axis-aligned box of a layer box (w x h) at a transform. */
function boxAt(w: number, h: number, t: LiveTransform): Box {
  'worklet';
  const c = Math.abs(Math.cos(t.rotation));
  const s = Math.abs(Math.sin(t.rotation));
  const hw = ((w * c + h * s) * t.scale) / 2;
  const hh = ((w * s + h * c) * t.scale) / 2;
  return { left: t.x - hw, right: t.x + hw, top: t.y - hh, bottom: t.y + hh };
}

/**
 * Snaps a moving box to slide edges/centers, the canvas middle and other
 * layers' edges/centers. Returns the correction and the guide positions.
 */
function snapBox(box: Box, others: Box[], slideCount: number, H: number, rows: number, threshold: number) {
  'worklet';
  const xs: number[] = [];
  for (let i = 0; i <= slideCount * 2; i++) xs.push((i * SLIDE_WIDTH) / 2);
  // Edges and centres of every slide (and every row, in a grid puzzle).
  const ys: number[] = [];
  for (let i = 0; i <= rows * 2; i++) ys.push((i * H) / 2);
  for (const o of others) {
    xs.push(o.left, (o.left + o.right) / 2, o.right);
    ys.push(o.top, (o.top + o.bottom) / 2, o.bottom);
  }
  const best = (points: number[], targets: number[]) => {
    let d = threshold;
    let at = -1;
    let shift = 0;
    for (const p of points) {
      for (const t of targets) {
        const dist = Math.abs(t - p);
        if (dist < d) {
          d = dist;
          at = t;
          shift = t - p;
        }
      }
    }
    return { at, shift };
  };
  const bx = best([box.left, (box.left + box.right) / 2, box.right], xs);
  const by = best([box.top, (box.top + box.bottom) / 2, box.bottom], ys);
  return { dx: bx.shift, dy: by.shift, gx: bx.at, gy: by.at };
}

export function EditorCanvas({
  doc,
  images,
  width,
  height,
  scrollX,
  selectedId,
  selectedIds,
  multi,
  cropId,
  onSelect,
  onToggle,
  onTransform,
  onGroupTransform,
  onCrop,
  onDoubleTap,
  onDropInto,
  snapping = true,
  onPinchOut,
}: Props) {
  // Gesture worklets capture values from render; the React Compiler's
  // memoization rewrites those closures in ways worklets can't serialize
  // (crashes on the UI thread), so this component opts out.
  'use no memo';
  const { width: W, height: H } = canvasSize(doc);
  const { vs, offsetX, offsetY, maxScroll } = viewMetrics(doc, width, height);
  const slideCount = doc.slideCount;
  const rows = doc.grid ?? 1;
  const tileH = H / rows;
  const stamp = doc.updatedAt;
  const [dropId, setDropId] = useState<string | null>(null);

  const tick = () => Haptics.selectionAsync();
  const bump = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

  // Mirror of layer geometry for hit testing on the UI thread.
  const layersSV = useSharedValue<Geo[]>([]);
  const selectedSV = useSharedValue<string | null>(selectedId);
  const selectionSV = useSharedValue<string[]>(selectedIds);
  const multiSV = useSharedValue(multi);
  const snapSV = useSharedValue(snapping);
  const cropSV = useSharedValue<string | null>(cropId);
  useEffect(() => {
    layersSV.set(
      doc.layers.map((l: Layer) => {
        const b = bounds(l);
        const inner = l.type === 'photo' ? frameInner(l) : { width: l.w, height: l.h };
        return {
          id: l.id,
          x: l.x,
          y: l.y,
          w: l.w,
          h: l.h,
          iw: inner.width,
          ih: inner.height,
          scale: l.scale,
          rotation: l.rotation,
          aspect: l.type === 'photo' ? l.aspect : 1,
          crop: l.type === 'photo' ? (l.crop ?? DEFAULT_CROP) : DEFAULT_CROP,
          backdrop: b.right - b.left >= SLIDE_WIDTH * 0.9 && b.bottom - b.top >= tileH * 0.9,
          blocked: !!l.hidden || !!l.locked,
          hidden: !!l.hidden,
          photo: l.type === 'photo',
          filled: l.type === 'photo' && !!l.src,
          cell: l.type === 'photo' && (!!l.cell || !l.src),
          box: b,
        };
      }),
    );
  }, [doc.layers, layersSV, tileH]);
  useEffect(() => {
    selectedSV.set(selectedId);
    selectionSV.set(selectedIds);
    multiSV.set(multi);
  }, [selectedId, selectedIds, multi, selectedSV, selectionSV, multiSV]);
  useEffect(() => {
    snapSV.set(snapping);
  }, [snapping, snapSV]);

  // Transform session for the layer under the fingers. `raw` accumulates the
  // gesture deltas; `live` is raw plus snapping and is what gets drawn. A
  // multi-selection moves through `delta` instead.
  const target = useSharedValue<string | null>(null);
  const committing = useSharedValue<string | null>(null);
  const active = useSharedValue(0);
  const grouped = useSharedValue<string[]>([]);
  const rawDelta = useSharedValue<GroupDelta>(NO_DELTA);
  const delta = useSharedValue<GroupDelta>(NO_DELTA);
  const raw = useSharedValue<LiveTransform>({ x: 0, y: 0, scale: 1, rotation: 0 });
  const live = useSharedValue<LiveTransform>({ x: 0, y: 0, scale: 1, rotation: 0 });
  const liveCrop = useSharedValue<Crop>(DEFAULT_CROP);
  const finger = useSharedValue({ x: 0, y: 0 });
  const dropSV = useSharedValue<string | null>(null);
  const panLast = useSharedValue({ x: 0, y: 0, on: false });
  const pinchLast = useSharedValue({ scale: 1, fx: 0, fy: 0, on: false });
  const rotLast = useSharedValue({ r: 0, on: false });
  /** A pinch on empty canvas that may open the overview. */
  const zoomPinch = useSharedValue(false);
  const scrolling = useSharedValue(false);
  const scrollStart = useSharedValue(0);
  const guideX = useSharedValue(-1);
  const guideY = useSharedValue(-1);

  // Entering crop mode starts from the layer's saved crop.
  const cropLayer = cropId ? doc.layers.find((l) => l.id === cropId) : undefined;
  const savedCrop = cropLayer?.type === 'photo' ? (cropLayer.crop ?? DEFAULT_CROP) : DEFAULT_CROP;
  useEffect(() => {
    cropSV.set(cropId);
    if (active.get() === 0) liveCrop.set(savedCrop);
  }, [cropId, savedCrop, cropSV, liveCrop, active]);

  // Once the store reflects a committed gesture, render from props again.
  useEffect(() => {
    committing.set(null);
  }, [doc.layers, committing]);

  // Clamp scroll when slides are removed or the viewport changes.
  useEffect(() => {
    if (scrollX.get() > maxScroll) scrollX.set(maxScroll);
  }, [maxScroll, scrollX]);

  const toDoc = (sx: number, sy: number) => {
    'worklet';
    return { x: (sx - offsetX + scrollX.get()) / vs, y: (sy - offsetY) / vs };
  };

  const begin = (id: string) => {
    'worklet';
    if (active.get() === 0) {
      const all = layersSV.get();
      const g = all.find((l) => l.id === id);
      if (!g || g.blocked) return false;
      const selection = selectionSV.get();
      const inSelection = selection.includes(id);
      // In multi mode only the current selection moves.
      if (multiSV.get() && !inSelection) return false;
      cancelAnimation(scrollX);
      target.set(id);
      raw.set({ x: g.x, y: g.y, scale: g.scale, rotation: g.rotation });
      live.set(raw.get());
      if (cropSV.get() === id) liveCrop.set(g.crop);

      if (inSelection && selection.length > 1 && cropSV.get() == null) {
        const members = all.filter((l) => selection.includes(l.id) && !l.blocked);
        const left = Math.min(...members.map((m) => m.box.left));
        const right = Math.max(...members.map((m) => m.box.right));
        const top = Math.min(...members.map((m) => m.box.top));
        const bottom = Math.max(...members.map((m) => m.box.bottom));
        grouped.set(members.map((m) => m.id));
        const d = { dx: 0, dy: 0, scale: 1, rotation: 0, cx: (left + right) / 2, cy: (top + bottom) / 2, stamp };
        rawDelta.set(d);
        delta.set(d);
      } else {
        grouped.set([]);
        if (selectedSV.get() !== id && cropSV.get() == null) {
          selectedSV.set(id);
          selectionSV.set([id]);
          scheduleOnRN(onSelect, id);
        }
      }
    }
    active.set(active.get() + 1);
    return true;
  };

  /** Applies a gesture delta (canvas units / scale factor / radians) to the session. */
  const apply = (dx: number, dy: number, factor: number, dr: number) => {
    'worklet';
    const id = target.get();
    if (!id) return;
    const all = layersSV.get();
    const threshold = SNAP_PX / vs;

    if (cropSV.get() === id) {
      // Reposition the photo inside its frame instead of moving the frame.
      const g = all.find((l) => l.id === id);
      if (!g) return;
      const c = liveCrop.get();
      const zoom = Math.max(1, Math.min(5, c.zoom * factor));
      const cover =
        g.aspect > g.iw / g.ih ? { iw: g.ih * g.aspect, ih: g.ih } : { iw: g.iw, ih: g.iw / g.aspect };
      const ox = (cover.iw * zoom - g.iw) / 2;
      const oy = (cover.ih * zoom - g.ih) / 2;
      // Screen delta into the layer's local frame.
      const cos = Math.cos(-g.rotation);
      const sin = Math.sin(-g.rotation);
      const lx = (dx * cos - dy * sin) / g.scale;
      const ly = (dx * sin + dy * cos) / g.scale;
      const clamp = (v: number) => Math.max(-1, Math.min(1, v));
      liveCrop.set({
        zoom,
        x: ox > 0.5 ? clamp((c.x * ox + lx) / ox) : 0,
        y: oy > 0.5 ? clamp((c.y * oy + ly) / oy) : 0,
      });
      return;
    }

    const members = grouped.get();
    if (members.length > 1) {
      const r = rawDelta.get();
      const next = {
        ...r,
        dx: r.dx + dx,
        dy: r.dy + dy,
        scale: Math.max(0.05, Math.min(30, r.scale * factor)),
        rotation: r.rotation + dr,
      };
      rawDelta.set(next);
      // Snap the selection's overall box (moved and scaled about its center).
      const ms = all.filter((l) => members.includes(l.id));
      const left = Math.min(...ms.map((m) => m.box.left));
      const right = Math.max(...ms.map((m) => m.box.right));
      const top = Math.min(...ms.map((m) => m.box.top));
      const bottom = Math.max(...ms.map((m) => m.box.bottom));
      const box = {
        left: next.cx + (left - next.cx) * next.scale + next.dx,
        right: next.cx + (right - next.cx) * next.scale + next.dx,
        top: next.cy + (top - next.cy) * next.scale + next.dy,
        bottom: next.cy + (bottom - next.cy) * next.scale + next.dy,
      };
      const others = all.filter((l) => !members.includes(l.id) && !l.hidden).map((l) => l.box);
      const snap = snapSV.get() ? snapBox(box, others, slideCount, tileH, rows, threshold) : NO_SNAP;
      if ((snap.gx !== -1 && snap.gx !== guideX.get()) || (snap.gy !== -1 && snap.gy !== guideY.get())) {
        scheduleOnRN(tick);
      }
      guideX.set(snap.gx);
      guideY.set(snap.gy);
      delta.set({ ...next, dx: next.dx + snap.dx, dy: next.dy + snap.dy });
      return;
    }

    const r = raw.get();
    const next = {
      x: r.x + dx,
      y: r.y + dy,
      scale: Math.max(0.05, Math.min(30, r.scale * factor)),
      rotation: r.rotation + dr,
    };
    raw.set(next);

    let rotation = next.rotation;
    const quarter = Math.PI / 2;
    const nearest = Math.round(rotation / quarter) * quarter;
    if (snapSV.get() && Math.abs(rotation - nearest) < ROTATE_SNAP) rotation = nearest;

    const g = all.find((l) => l.id === id)!;
    const others = all.filter((l) => l.id !== id && !l.hidden).map((l) => l.box);
    const snap = snapSV.get()
      ? snapBox(boxAt(g.w, g.h, { ...next, rotation }), others, slideCount, tileH, rows, threshold)
      : NO_SNAP;

    if ((snap.gx !== -1 && snap.gx !== guideX.get()) || (snap.gy !== -1 && snap.gy !== guideY.get())) {
      scheduleOnRN(tick);
    }
    guideX.set(snap.gx);
    guideY.set(snap.gy);
    live.set({ x: next.x + snap.dx, y: next.y + snap.dy, scale: next.scale, rotation });

    // Dragging a photo over a layout cell offers to drop it in.
    if (g.filled && panLast.get().on && pinchLast.get().on === false) {
      const f = finger.get();
      const cell = cellAt(all, f.x, f.y, id);
      if (cell !== dropSV.get()) {
        dropSV.set(cell);
        scheduleOnRN(setDropId, cell);
        if (cell) scheduleOnRN(bump);
      }
    }
  };

  const end = () => {
    'worklet';
    if (active.get() === 0) return;
    active.set(active.get() - 1);
    const id = target.get();
    if (active.get() !== 0 || !id) return;
    target.set(null);
    guideX.set(-1);
    guideY.set(-1);
    if (cropSV.get() === id) {
      const c = liveCrop.get();
      layersSV.modify((all) => {
        'worklet';
        const g = all.find((l) => l.id === id);
        if (g) g.crop = c;
        return all;
      });
      scheduleOnRN(onCrop, id, c);
      return;
    }

    const members = grouped.get();
    if (members.length > 1) {
      const d = delta.get();
      grouped.set([]);
      layersSV.modify((all) => {
        'worklet';
        for (const g of all) {
          if (!members.includes(g.id)) continue;
          Object.assign(g, applyGroupDelta(g, d));
          g.box = boxAt(g.w, g.h, g);
        }
        return all;
      });
      scheduleOnRN(onGroupTransform, members, d);
      return;
    }

    const drop = dropSV.get();
    if (drop) {
      dropSV.set(null);
      scheduleOnRN(setDropId, null);
      // The dragged layer springs back; its image moves into the cell.
      scheduleOnRN(onDropInto, id, drop);
      return;
    }

    const t = live.get();
    committing.set(id);
    // Update the hit-test mirror now so an immediate re-grab uses the new spot.
    layersSV.modify((all) => {
      'worklet';
      const g = all.find((l) => l.id === id);
      if (g) {
        Object.assign(g, t);
        g.box = boxAt(g.w, g.h, t);
      }
      return all;
    });
    scheduleOnRN(onTransform, id, t);
  };

  const panGesture = Gesture.Pan()
    .maxPointers(2)
    .onStart((e) => {
      const start = toDoc(e.x - e.translationX, e.y - e.translationY);
      finger.set(toDoc(e.x, e.y));
      let id = target.get() ?? cropSV.get();
      if (!id) {
        const hit = hitTest(layersSV.get(), start.x, start.y, 16 / vs, selectedSV.get());
        // Unselected full-slide photos act as backdrop: dragging them scrolls.
        const selected = hit && selectionSV.get().includes(hit.id);
        if (hit && (selected || !hit.backdrop)) id = hit.id;
      }
      if (id && begin(id)) {
        panLast.set({ x: e.translationX, y: e.translationY, on: true });
        scrolling.set(false);
      } else {
        cancelAnimation(scrollX);
        scrolling.set(true);
        scrollStart.set(scrollX.get());
      }
    })
    .onUpdate((e) => {
      if (scrolling.get()) {
        scrollX.set(Math.max(0, Math.min(maxScroll, scrollStart.get() - e.translationX)));
        return;
      }
      const p = panLast.get();
      if (!p.on) return;
      finger.set(toDoc(e.x, e.y));
      panLast.set({ x: e.translationX, y: e.translationY, on: true });
      apply((e.translationX - p.x) / vs, (e.translationY - p.y) / vs, 1, 0);
    })
    .onEnd((e) => {
      if (scrolling.get()) {
        scrollX.set(withDecay({ velocity: -e.velocityX, clamp: [0, maxScroll] }));
      }
    })
    .onFinalize(() => {
      if (scrolling.get()) {
        scrolling.set(false);
      } else if (panLast.get().on) {
        panLast.set({ x: 0, y: 0, on: false });
        end();
      }
    });

  const pinchGesture = Gesture.Pinch()
    .onStart((e) => {
      const f = toDoc(e.focalX, e.focalY);
      const id =
        target.get() ??
        cropSV.get() ??
        hitTest(layersSV.get(), f.x, f.y, 24 / vs, selectedSV.get())?.id ??
        selectedSV.get();
      if (id && begin(id)) {
        scrolling.set(false);
        // A pinch cancels any pending drop.
        if (dropSV.get()) {
          dropSV.set(null);
          scheduleOnRN(setDropId, null);
        }
        pinchLast.set({ scale: e.scale, fx: e.focalX, fy: e.focalY, on: true });
      } else if (!id && !multiSV.get() && onPinchOut) {
        zoomPinch.set(true);
      }
    })
    .onUpdate((e) => {
      if (zoomPinch.get()) {
        if (e.scale < OVERVIEW_PINCH) {
          zoomPinch.set(false);
          scheduleOnRN(onPinchOut!);
        }
        return;
      }
      const p = pinchLast.get();
      if (!p.on) return;
      pinchLast.set({ scale: e.scale, fx: e.focalX, fy: e.focalY, on: true });
      // Pan already moves the layer when it's attached; otherwise follow the focal point.
      const follow = !panLast.get().on;
      apply(
        follow ? (e.focalX - p.fx) / vs : 0,
        follow ? (e.focalY - p.fy) / vs : 0,
        p.scale > 0 ? e.scale / p.scale : 1,
        0,
      );
    })
    .onFinalize(() => {
      zoomPinch.set(false);
      if (pinchLast.get().on) {
        pinchLast.set({ scale: 1, fx: 0, fy: 0, on: false });
        end();
      }
    });

  const rotateGesture = Gesture.Rotation()
    .onStart((e) => {
      if (cropSV.get()) return;
      const a = toDoc(e.anchorX, e.anchorY);
      const id =
        target.get() ??
        hitTest(layersSV.get(), a.x, a.y, 24 / vs, selectedSV.get())?.id ??
        selectedSV.get();
      if (id && begin(id)) rotLast.set({ r: e.rotation, on: true });
    })
    .onUpdate((e) => {
      const p = rotLast.get();
      if (!p.on) return;
      rotLast.set({ r: e.rotation, on: true });
      apply(0, 0, 1, e.rotation - p.r);
    })
    .onFinalize(() => {
      if (rotLast.get().on) {
        rotLast.set({ r: 0, on: false });
        end();
      }
    });

  const tapGesture = Gesture.Tap()
    .maxDistance(TAP_SLOP)
    .onEnd((e) => {
      const p = toDoc(e.x, e.y);
      // Taps pick the topmost layer, so text over a selected photo can be selected.
      const id = hitTest(layersSV.get(), p.x, p.y, 12 / vs, null)?.id ?? null;
      if (cropSV.get() && id === cropSV.get()) return;
      if (multiSV.get()) {
        if (id) scheduleOnRN(onToggle, id);
        return;
      }
      selectedSV.set(id);
      scheduleOnRN(onSelect, id);
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDistance(TAP_SLOP)
    .onEnd((e) => {
      if (multiSV.get()) return;
      const p = toDoc(e.x, e.y);
      const id = hitTest(layersSV.get(), p.x, p.y, 12 / vs, selectedSV.get())?.id;
      if (id) scheduleOnRN(onDoubleTap, id);
    });

  const gesture = Gesture.Race(
    Gesture.Simultaneous(panGesture, pinchGesture, rotateGesture),
    Gesture.Exclusive(doubleTapGesture, tapGesture),
  );

  const viewTransform = useDerivedValue<Transforms3d>(() => [
    { translateX: offsetX - scrollX.get() },
    { translateY: offsetY },
    { scale: vs },
  ]);

  const selected = doc.layers.find((l) => l.id === selectedId) ?? null;
  const selectedStatic = selected ? layerTransform(selected) : null;
  const isGroup = selectedIds.length > 1;

  const liveTransform = useDerivedValue<Transforms3d>(() => {
    const id = target.get() ?? committing.get();
    if (id && id === selectedId && grouped.get().length === 0) {
      const l = live.get();
      return [{ translateX: l.x }, { translateY: l.y }, { rotate: l.rotation }, { scale: l.scale }];
    }
    return selectedStatic ?? [];
  });

  const outlineWidth = useDerivedValue(() => {
    const id = target.get() ?? committing.get();
    const s = id && id === selectedId ? live.get().scale : (selected?.scale ?? 1);
    return 2 / (vs * s);
  });

  const guideXp1 = useDerivedValue(() => vec(guideX.get(), -40 / vs));
  const guideXp2 = useDerivedValue(() => vec(guideX.get(), H + 40 / vs));
  const guideXOpacity = useDerivedValue(() => (guideX.get() < 0 ? 0 : 1));
  const guideYp1 = useDerivedValue(() => vec(-PAD_X / vs, guideY.get()));
  const guideYp2 = useDerivedValue(() => vec(W + PAD_X / vs, guideY.get()));
  const guideYOpacity = useDerivedValue(() => (guideY.get() < 0 ? 0 : 1));

  const seams = Array.from({ length: slideCount - 1 }, (_, i) => (i + 1) * SLIDE_WIDTH);
  // A grid puzzle also splits into rows: each tile is a separate post.
  const rowSeams = Array.from({ length: rows - 1 }, (_, i) => (i + 1) * tileH);
  const warnings = seamWarnings(doc.layers, seams);
  const cropping = cropId != null && cropId === selectedId && selected?.type === 'photo';
  const dropLayer = dropId ? doc.layers.find((l) => l.id === dropId) : null;

  return (
    <GestureDetector gesture={gesture}>
      <Canvas style={{ width, height }}>
        <Group transform={viewTransform}>
          {/* While cropping, show the whole photo faintly so you can see what's outside the frame. */}
          {cropping && images[selected.src] && (
            <Group transform={liveTransform} opacity={0.3}>
              <LiveCroppedImage layer={selected} image={images[selected.src]!} crop={liveCrop} />
            </Group>
          )}

          <Group clip={rect(0, 0, W, H)}>
            <DocRenderer
              doc={doc}
              images={images}
              liveId={isGroup ? null : selectedId}
              liveTransform={liveTransform}
              liveCrop={cropping ? liveCrop : null}
              playVideo
              groupIds={isGroup ? selectedIds : undefined}
              groupDelta={isGroup ? delta : undefined}
              stamp={stamp}
            />
          </Group>

          {seams.map((x) => (
            <Line
              key={x}
              p1={vec(x, 0)}
              p2={vec(x, H)}
              color="#FFFFFFAA"
              strokeWidth={1.5 / vs}
              style="stroke">
              <DashPathEffect intervals={[12 / vs, 8 / vs]} />
            </Line>
          ))}

          {rowSeams.map((y) => (
            <Line key={`row${y}`} p1={vec(0, y)} p2={vec(W, y)} color="#FFFFFFAA" strokeWidth={1.5 / vs} style="stroke">
              <DashPathEffect intervals={[12 / vs, 8 / vs]} />
            </Line>
          ))}

          {warnings.map((w) => (
            <Group key={w.id}>
              {w.face && (
                <Rect
                  x={w.left}
                  y={w.top}
                  width={w.right - w.left}
                  height={w.bottom - w.top}
                  color={C.danger}
                  style="stroke"
                  strokeWidth={2 / vs}>
                  <DashPathEffect intervals={[8 / vs, 6 / vs]} />
                </Rect>
              )}
              <Rect x={w.x - 3 / vs} y={w.top} width={6 / vs} height={w.bottom - w.top} color={C.danger} />
            </Group>
          ))}

          {dropLayer && (
            <Group transform={layerTransform(dropLayer)}>
              <Rect
                x={-dropLayer.w / 2}
                y={-dropLayer.h / 2}
                width={dropLayer.w}
                height={dropLayer.h}
                color={C.accent}
                opacity={0.25}
              />
              <Rect
                x={-dropLayer.w / 2}
                y={-dropLayer.h / 2}
                width={dropLayer.w}
                height={dropLayer.h}
                color={C.accent}
                style="stroke"
                strokeWidth={4 / (vs * dropLayer.scale)}
              />
            </Group>
          )}

          {isGroup &&
            doc.layers
              .filter((l) => selectedIds.includes(l.id))
              .map((l) => <GroupOutline key={l.id} layer={l} delta={delta} vs={vs} stamp={stamp} />)}

          {!isGroup && selected && (
            <Group transform={liveTransform}>
              <Rect
                x={-selected.w / 2}
                y={-selected.h / 2}
                width={selected.w}
                height={selected.h}
                color={cropping ? '#FFFFFF' : selected.locked || selected.hidden ? C.textDim : C.accent}
                style="stroke"
                strokeWidth={outlineWidth}>
                {(selected.locked || selected.hidden) && (
                  <DashPathEffect intervals={[10 / (vs * selected.scale), 7 / (vs * selected.scale)]} />
                )}
              </Rect>
            </Group>
          )}

          <Line p1={guideXp1} p2={guideXp2} color={C.accent} strokeWidth={1.5 / vs} opacity={guideXOpacity} />
          <Line p1={guideYp1} p2={guideYp2} color={C.accent} strokeWidth={1.5 / vs} opacity={guideYOpacity} />
        </Group>
      </Canvas>
    </GestureDetector>
  );
}

/** Outline of one member of a multi-selection, following the live group move. */
function GroupOutline({
  layer,
  delta,
  vs,
  stamp,
}: {
  layer: Layer;
  delta: SharedValue<GroupDelta>;
  vs: number;
  stamp: number;
}) {
  'use no memo';
  const transform = useGroupTransform(layer, delta, stamp);
  return (
    <Group transform={transform}>
      <Rect
        x={-layer.w / 2}
        y={-layer.h / 2}
        width={layer.w}
        height={layer.h}
        color={C.accent}
        style="stroke"
        strokeWidth={1.5 / (vs * layer.scale)}>
        <DashPathEffect intervals={[8 / (vs * layer.scale), 5 / (vs * layer.scale)]} />
      </Rect>
    </Group>
  );
}

type Warning = { id: string; x: number; top: number; bottom: number; left: number; right: number; face: boolean };

/**
 * Text or faces cut by a seam read badly when swiping, so flag them. Text uses
 * its rotated bounding box (stickers are exempt); faces come from the photo's
 * detected face boxes.
 */
function seamWarnings(layers: Layer[], seams: number[]) {
  const out: Warning[] = [];
  for (const l of layers) {
    if (l.hidden) continue;
    if (l.type === 'text' && !l.sticker) {
      const b = bounds(l);
      for (const x of seams) {
        if (x > b.left + 8 && x < b.right - 8) out.push({ id: `${l.id}-${x}`, x, ...b, face: false });
      }
    } else if (l.type === 'photo' && l.faces?.length) {
      faceBoxes(l).forEach((f, i) => {
        for (const x of seams) {
          // A seam through the outer edge of a face is fine; through the middle isn't.
          const inset = (f.right - f.left) * 0.15;
          if (x > f.left + inset && x < f.right - inset) out.push({ id: `${l.id}-f${i}-${x}`, x, ...f, face: true });
        }
      });
    }
  }
  return out;
}
