import { create } from 'zustand';

import { bounds, homeSlide } from './geometry';
import { ASPECTS, type AspectId, type Background, type Doc, type Layer, MAX_SLIDES, SLIDE_WIDTH, uid } from './types';

// Editor state for the open project. Every edit goes through `commit`, which
// snapshots the previous document for undo. Rapid edits with the same
// coalesce key (slider drags) collapse into one undo step.

const HISTORY_LIMIT = 60;
const COALESCE_MS = 700;

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

type EditorState = {
  doc: Doc | null;
  /** Primary selection (the layer whose panel is shown). */
  selectedId: string | null;
  /** Everything selected; more than one means a multi-selection. */
  selectedIds: string[];
  /** Taps add to / remove from the selection instead of replacing it. */
  multi: boolean;
  past: Doc[];
  future: Doc[];
  lastKey: string | null;
  lastAt: number;

  open: (doc: Doc) => void;
  close: () => void;
  commit: (update: (doc: Doc) => Doc, coalesceKey?: string) => void;
  undo: () => void;
  redo: () => void;
  select: (id: string | null) => void;
  /** Adds or removes a layer (and its group) from the selection. */
  toggleSelect: (id: string) => void;
  setMulti: (on: boolean) => void;

  addLayers: (layers: Layer[]) => void;
  updateLayer: (id: string, patch: Partial<Layer>, coalesceKey?: string) => void;
  updateLayers: (patches: Record<string, Partial<Layer>>, coalesceKey?: string) => void;
  /** Adds derived data (e.g. detected faces) to layers everywhere in history, without an undo step. */
  annotate: (patches: Record<string, Partial<Layer>>) => void;
  removeLayers: (ids: string[]) => void;
  duplicateLayers: (ids: string[]) => void;
  groupLayers: (ids: string[]) => void;
  ungroupLayers: (ids: string[]) => void;
  /** Aligns layers to each other, or to their slide when `toSlide` (or only one layer). */
  alignLayers: (ids: string[], mode: AlignMode, toSlide?: boolean) => void;
  distributeLayers: (ids: string[], axis: 'x' | 'y') => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  moveLayer: (id: string, to: 'up' | 'down' | 'top' | 'bottom') => void;
  /** Moves a layer to stack index `to` (0 = bottom). */
  reorderLayer: (id: string, to: number) => void;
  toggleHidden: (id: string) => void;
  toggleLocked: (id: string) => void;
  setBackground: (bg: Background, coalesceKey?: string) => void;
  setSlideCount: (n: number) => void;
  /** Inserts a slide at `index`, optionally with `layers` already placed on it (one undo step). */
  insertSlide: (index: number, layers?: Layer[]) => void;
  /** Changes the post ratio, keeping the composition (see `withAspect`). */
  setAspect: (aspect: AspectId) => void;
  removeSlide: (index: number) => void;
  moveSlide: (from: number, to: number) => void;
  duplicateSlide: (index: number) => void;
};

/** A layer plus every layer grouped with it. */
function withGroup(layers: Layer[], id: string) {
  const layer = layers.find((l) => l.id === id);
  if (!layer?.group) return layer ? [id] : [];
  return layers.filter((l) => l.group === layer.group).map((l) => l.id);
}

const one = (id: string | null) => ({ selectedId: id, selectedIds: id ? [id] : [] });

export const useEditor = create<EditorState>((set, get) => ({
  doc: null,
  selectedId: null,
  selectedIds: [],
  multi: false,
  past: [],
  future: [],
  lastKey: null,
  lastAt: 0,

  open: (doc) => set({ doc, ...one(null), multi: false, past: [], future: [], lastKey: null }),
  close: () => set({ doc: null, ...one(null), multi: false, past: [], future: [] }),

  commit: (update, coalesceKey) => {
    const { doc, past, lastKey, lastAt } = get();
    if (!doc) return;
    const updated = update(doc);
    // Returning the same doc means nothing changed: don't add an undo step.
    if (updated === doc) return;
    const now = Date.now();
    const next = { ...updated, updatedAt: now };
    const coalesce = coalesceKey != null && coalesceKey === lastKey && now - lastAt < COALESCE_MS;
    set({
      doc: next,
      past: coalesce ? past : [...past, doc].slice(-HISTORY_LIMIT),
      future: [],
      lastKey: coalesceKey ?? null,
      lastAt: now,
    });
  },

  undo: () => {
    const { doc, past, future } = get();
    if (!doc || past.length === 0) return;
    // Undo is still an edit, so keep the project at the top of the list.
    const prev = { ...past[past.length - 1], updatedAt: Date.now() };
    set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], lastKey: null, ...keepSelection(get(), prev) });
  },

  redo: () => {
    const { doc, past, future } = get();
    if (!doc || future.length === 0) return;
    const next = { ...future[0], updatedAt: Date.now() };
    set({
      doc: next,
      past: [...past, doc].slice(-HISTORY_LIMIT),
      future: future.slice(1),
      lastKey: null,
      ...keepSelection(get(), next),
    });
  },

  select: (id) => {
    const layers = get().doc?.layers ?? [];
    if (!id) return set(one(null));
    set({ selectedId: id, selectedIds: withGroup(layers, id) });
  },

  toggleSelect: (id) => {
    const { selectedIds, doc } = get();
    const ids = withGroup(doc?.layers ?? [], id);
    const has = selectedIds.includes(id);
    const next = has ? selectedIds.filter((s) => !ids.includes(s)) : [...selectedIds, ...ids.filter((s) => !selectedIds.includes(s))];
    set({ selectedIds: next, selectedId: has ? (next.at(-1) ?? null) : id });
  },

  setMulti: (on) => set(on ? { multi: true } : { multi: false, ...one(null) }),

  addLayers: (layers) => {
    get().commit((d) => ({ ...d, layers: [...d.layers, ...layers] }));
    set(one(layers.at(-1)?.id ?? null));
  },

  updateLayers: (patches, coalesceKey) =>
    get().commit(
      (d) => ({
        ...d,
        layers: d.layers.map((l) => (patches[l.id] ? ({ ...l, ...patches[l.id] } as Layer) : l)),
      }),
      coalesceKey,
    ),

  annotate: (patches) => {
    const patch = (d: Doc) => ({
      ...d,
      layers: d.layers.map((l) => (patches[l.id] ? ({ ...l, ...patches[l.id] } as Layer) : l)),
    });
    set((s) => (s.doc ? { doc: patch(s.doc), past: s.past.map(patch), future: s.future.map(patch) } : {}));
  },

  removeLayers: (ids) => {
    get().commit((d) => ({ ...d, layers: d.layers.filter((l) => !ids.includes(l.id)) }));
    set({ ...one(null), multi: false });
  },

  duplicateLayers: (ids) => {
    const doc = get().doc;
    if (!doc) return;
    const groups = new Map<string, string>();
    const copies = doc.layers
      .filter((l) => ids.includes(l.id))
      .map((l) => {
        let group = l.group;
        if (group) {
          if (!groups.has(group)) groups.set(group, uid());
          group = groups.get(group);
        }
        return { ...l, id: uid(), group, x: l.x + 60, y: l.y + 60 };
      });
    get().commit((d) => ({ ...d, layers: [...d.layers, ...copies] }));
    set({ selectedIds: copies.map((c) => c.id), selectedId: copies.at(-1)?.id ?? null });
  },

  groupLayers: (ids) => {
    if (ids.length < 2) return;
    const group = uid();
    get().commit((d) => ({ ...d, layers: d.layers.map((l) => (ids.includes(l.id) ? { ...l, group } : l)) }));
  },

  ungroupLayers: (ids) =>
    get().commit((d) => ({
      ...d,
      layers: d.layers.map((l) => (ids.includes(l.id) && l.group ? { ...l, group: undefined } : l)),
    })),

  alignLayers: (ids, mode, toSlide) => {
    const doc = get().doc;
    if (!doc) return;
    const picked = doc.layers.filter((l) => ids.includes(l.id));
    if (picked.length === 0) return;
    const H = canvasHeight(doc);
    let target: { left: number; right: number; top: number; bottom: number };
    if (toSlide || picked.length === 1) {
      const first = picked.find((l) => l.id === get().selectedId) ?? picked[0];
      const slide = Math.max(0, Math.min(doc.slideCount - 1, Math.floor(first.x / SLIDE_WIDTH)));
      target = { left: slide * SLIDE_WIDTH, right: (slide + 1) * SLIDE_WIDTH, top: 0, bottom: H };
    } else {
      const all = picked.map(bounds);
      target = {
        left: Math.min(...all.map((b) => b.left)),
        right: Math.max(...all.map((b) => b.right)),
        top: Math.min(...all.map((b) => b.top)),
        bottom: Math.max(...all.map((b) => b.bottom)),
      };
    }
    // When aligning to the slide, a multi-selection moves as one block.
    const block = (toSlide && picked.length > 1) || picked.length === 1;
    const union = picked.map(bounds).reduce((a, b) => ({
      left: Math.min(a.left, b.left),
      right: Math.max(a.right, b.right),
      top: Math.min(a.top, b.top),
      bottom: Math.max(a.bottom, b.bottom),
    }));
    const patches: Record<string, Partial<Layer>> = {};
    for (const l of picked) {
      const b = block ? union : bounds(l);
      let dx = 0;
      let dy = 0;
      if (mode === 'left') dx = target.left - b.left;
      if (mode === 'right') dx = target.right - b.right;
      if (mode === 'hcenter') dx = (target.left + target.right) / 2 - (b.left + b.right) / 2;
      if (mode === 'top') dy = target.top - b.top;
      if (mode === 'bottom') dy = target.bottom - b.bottom;
      if (mode === 'vcenter') dy = (target.top + target.bottom) / 2 - (b.top + b.bottom) / 2;
      patches[l.id] = { x: l.x + dx, y: l.y + dy };
    }
    get().updateLayers(patches);
  },

  distributeLayers: (ids, axis) => {
    const doc = get().doc;
    if (!doc) return;
    const picked = doc.layers.filter((l) => ids.includes(l.id)).map((l) => ({ l, b: bounds(l) }));
    if (picked.length < 3) return;
    const lo = axis === 'x' ? 'left' : 'top';
    const hi = axis === 'x' ? 'right' : 'bottom';
    picked.sort((a, b) => a.b[lo] + a.b[hi] - (b.b[lo] + b.b[hi]));
    const span = picked.at(-1)!.b[hi] - picked[0].b[lo];
    const used = picked.reduce((sum, p) => sum + (p.b[hi] - p.b[lo]), 0);
    const gap = (span - used) / (picked.length - 1);
    let cursor = picked[0].b[lo];
    const patches: Record<string, Partial<Layer>> = {};
    for (const p of picked) {
      const shift = cursor - p.b[lo];
      patches[p.l.id] = axis === 'x' ? { x: p.l.x + shift } : { y: p.l.y + shift };
      cursor += p.b[hi] - p.b[lo] + gap;
    }
    get().updateLayers(patches);
  },

  updateLayer: (id, patch, coalesceKey) =>
    get().commit(
      (d) => ({
        ...d,
        layers: d.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)),
      }),
      coalesceKey && `${coalesceKey}:${id}`,
    ),

  removeLayer: (id) => {
    get().commit((d) => ({ ...d, layers: d.layers.filter((l) => l.id !== id) }));
    set(one(null));
  },

  duplicateLayer: (id) => {
    const layer = get().doc?.layers.find((l) => l.id === id);
    if (!layer) return;
    const copy = { ...layer, id: uid(), x: layer.x + 60, y: layer.y + 60 };
    get().commit((d) => {
      const i = d.layers.findIndex((l) => l.id === id);
      const layers = [...d.layers];
      layers.splice(i + 1, 0, copy);
      return { ...d, layers };
    });
    set(one(copy.id));
  },

  moveLayer: (id, to) =>
    get().commit((d) => {
      const layers = [...d.layers];
      const i = layers.findIndex((l) => l.id === id);
      if (i < 0) return d;
      const [layer] = layers.splice(i, 1);
      const target =
        to === 'top'
          ? layers.length
          : to === 'bottom'
            ? 0
            : to === 'up'
              ? Math.min(layers.length, i + 1)
              : Math.max(0, i - 1);
      if (target === i) return d;
      layers.splice(target, 0, layer);
      return { ...d, layers };
    }),

  reorderLayer: (id, to) =>
    get().commit((d) => {
      const from = d.layers.findIndex((l) => l.id === id);
      const target = Math.max(0, Math.min(d.layers.length - 1, to));
      if (from < 0 || from === target) return d;
      const layers = [...d.layers];
      const [layer] = layers.splice(from, 1);
      layers.splice(target, 0, layer);
      return { ...d, layers };
    }),

  toggleHidden: (id) => {
    get().commit((d) => ({
      ...d,
      layers: d.layers.map((l) => (l.id === id ? { ...l, hidden: !l.hidden } : l)),
    }));
  },

  toggleLocked: (id) =>
    get().commit((d) => ({
      ...d,
      layers: d.layers.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l)),
    })),

  setBackground: (background, coalesceKey) =>
    get().commit((d) => ({ ...d, background }), coalesceKey && `bg:${coalesceKey}`),

  setSlideCount: (n) =>
    get().commit((d) => ({ ...d, slideCount: Math.max(1, Math.min(MAX_SLIDES, n)) })),

  // Inserting/removing a slide moves layers to its right so content stays on
  // the slide it was on. Straight photos that span the seam (panoramas) grow
  // or shrink by a slide instead of jumping.
  insertSlide: (index, extra = []) =>
    get().commit((d) => {
      const next = withSlideInserted(d, index);
      // Full: nothing was inserted, so don't drop the layers onto another slide.
      if (next === d) return d;
      return extra.length ? { ...next, layers: [...next.layers, ...extra] } : next;
    }),

  setAspect: (aspect) => get().commit((d) => withAspect(d, aspect)),

  // Layers that sit entirely on a slide travel with it; layers spanning a
  // seam stay where they are (they belong to both neighbours).
  moveSlide: (from, to) =>
    get().commit((d) => {
      if (from === to || from < 0 || to < 0 || from >= d.slideCount || to >= d.slideCount) return d;
      const order = Array.from({ length: d.slideCount }, (_, i) => i);
      const [moved] = order.splice(from, 1);
      order.splice(to, 0, moved);
      const newIndex = new Map(order.map((old, i) => [old, i]));
      const layers = d.layers.map((l) => {
        const k = homeSlide(l, SLIDE_WIDTH);
        if (k < 0) return l;
        const shift = (newIndex.get(k)! - k) * SLIDE_WIDTH;
        return shift ? { ...l, x: l.x + shift } : l;
      });
      return { ...d, layers };
    }),

  duplicateSlide: (index) =>
    get().commit((d) => {
      if (d.slideCount >= MAX_SLIDES) return d;
      const copies = d.layers
        .filter((l) => homeSlide(l, SLIDE_WIDTH) === index)
        .map((l) => ({ ...l, id: uid(), x: l.x + SLIDE_WIDTH }));
      const next = withSlideInserted(d, index + 1);
      return { ...next, layers: [...next.layers, ...copies] };
    }),

  removeSlide: (index) =>
    get().commit((d) => {
      if (d.slideCount <= 1) return d;
      const start = index * SLIDE_WIDTH;
      const end = start + SLIDE_WIDTH;
      const layers = d.layers.flatMap((l): Layer[] => {
        const b = bounds(l);
        if (b.left >= end - 1) return [{ ...l, x: l.x - SLIDE_WIDTH }];
        if (b.right <= start + 1) return [l];
        // Entirely on the removed slide.
        if (b.left >= start - 1 && b.right <= end + 1) return [];
        if (spansStraight(l) && b.left <= start + 1 && b.right >= end - 1) {
          const w = l.w - SLIDE_WIDTH / l.scale;
          return w > 1 ? [{ ...l, x: l.x - SLIDE_WIDTH / 2, w }] : [];
        }
        return [l.x >= (start + end) / 2 ? { ...l, x: l.x - SLIDE_WIDTH } : l];
      });
      return { ...d, slideCount: d.slideCount - 1, layers };
    }),
}));

function withSlideInserted(d: Doc, index: number): Doc {
  if (d.slideCount >= MAX_SLIDES) return d;
  const seam = index * SLIDE_WIDTH;
  const layers = d.layers.map((l): Layer => {
    const b = bounds(l);
    if (b.left >= seam - 1) return { ...l, x: l.x + SLIDE_WIDTH };
    if (b.right <= seam + 1) return l;
    if (spansStraight(l)) {
      return { ...l, x: l.x + SLIDE_WIDTH / 2, w: l.w + SLIDE_WIDTH / l.scale };
    }
    return l.x >= seam ? { ...l, x: l.x + SLIDE_WIDTH } : l;
  });
  return { ...d, slideCount: d.slideCount + 1, layers };
}

/**
 * Re-fits the document to a new post height. Positions scale with the height
 * so the composition holds; sizes stay, except anything that no longer fits
 * shrinks to fit. Layers that fill the height (full-bleed photos, backdrop
 * blocks) and layout cells stretch with it instead: they crop to cover, so
 * nothing distorts.
 */
function withAspect(d: Doc, aspect: AspectId): Doc {
  if (aspect === d.aspect) return d;
  const H = ASPECTS[d.aspect].height;
  const H2 = ASPECTS[aspect].height;
  const k = H2 / H;
  const layers = d.layers.map((l): Layer => {
    const b = bounds(l);
    const straight = Math.abs(Math.sin(l.rotation)) < 0.01;
    // Circles, arches and polaroids would change shape, so they only move.
    const stretchy =
      (l.type === 'photo' && (l.frame ?? 'rect') === 'rect') || (l.type === 'shape' && l.shape === 'rect');
    const fills = b.top <= H * 0.05 && b.bottom >= H * 0.95;
    if (straight && stretchy && (fills || (l.type === 'photo' && l.cell))) {
      // Empty slots carry their frame's aspect (like grid cells) until a photo lands.
      const slotAspect = l.type === 'photo' && !l.src ? { aspect: l.w / (l.h * k) } : {};
      return { ...l, y: l.y * k, h: l.h * k, ...slotAspect };
    }
    let y = l.y * k;
    let scale = l.scale;
    // Layers that sat inside the slide stay inside it; ones bleeding off the edge keep doing so.
    if (b.top >= -1 && b.bottom <= H + 1) {
      const bh = b.bottom - b.top;
      if (bh > H2) scale *= H2 / bh;
      const half = (bh * (scale / l.scale)) / 2;
      y = Math.max(half, Math.min(H2 - half, y));
    }
    return { ...l, y, scale };
  });
  return { ...d, aspect, layers };
}

/** Unrotated photos can be stretched across slides without distorting (they crop to cover). */
function spansStraight(l: Layer) {
  return l.type === 'photo' && Math.abs(Math.sin(l.rotation)) < 0.01;
}

export const selectedLayer = (s: EditorState) =>
  s.doc?.layers.find((l) => l.id === s.selectedId) ?? null;

/** Selection after undo/redo: drop layers that no longer exist. */
function keepSelection(state: Pick<EditorState, 'selectedId' | 'selectedIds'>, doc: Doc) {
  const ids = new Set(doc.layers.map((l) => l.id));
  const selectedIds = state.selectedIds.filter((id) => ids.has(id));
  const selectedId = state.selectedId && ids.has(state.selectedId) ? state.selectedId : (selectedIds.at(-1) ?? null);
  return { selectedId, selectedIds };
}

function canvasHeight(doc: Doc) {
  return ASPECTS[doc.aspect].height;
}
