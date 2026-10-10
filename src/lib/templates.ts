import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { DEFAULT_ADJUST } from './adjust';
import { useMyTemplates } from './my-templates';
import { TEMPLATES } from './template-catalog';
import { type DoodleShape, type Template, doodleStrokes } from './template-kit';
import { measureText } from './text';
import { ASPECTS, type Doc, type Layer, uid } from './types';

// Browsing, instantiating and the remote catalog. The designs themselves live
// in template-catalog.ts, built from the pieces in template-kit.ts.

export { TEMPLATE_CATEGORIES, TEMPLATES } from './template-catalog';
export type { Template, TemplateCategory } from './template-kit';

// ---------------------------------------------------------------------------
// Browsing. Search, collections and onboarding interests all match on a
// template's words (category plus tags), so remote templates join in just by
// carrying the right tags.

/** Picked by hand; shown when there's nothing personal to show yet. */
const FEATURED = ['postcard', 'polaroid-wall', 'contact-sheet', 'summer-recap', 'notebook', 'big-type', 'tips', 'magazine', 'scrapbook', 'arches'];

export const featured = (list: Template[]) =>
  FEATURED.map((id) => list.find((t) => t.id === id)).filter((t): t is Template => !!t);

/** Lowercased category and tags. */
export function templateWords(t: Template): string[] {
  return [t.category.toLowerCase(), ...(t.tags ?? []).map((tag) => tag.toLowerCase())];
}

/** Every word of the query has to appear in the name, category or tags. */
export function searchTemplates(list: Template[], query: string): Template[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((t) => {
    const hay = [t.name.toLowerCase(), ...templateWords(t)].join(' ');
    return words.every((w) => hay.includes(w));
  });
}

export type Collection = {
  id: string;
  title: string;
  subtitle: string;
  /** Templates with any of these words belong to the collection. */
  match: string[];
  /** Template drawn on the banner. */
  cover: string;
};

export const COLLECTIONS: Collection[] = [
  {
    id: 'summer',
    title: 'Summer recap',
    subtitle: 'Sun-faded days, stitched edge to edge',
    match: ['summer'],
    cover: 'summer-recap',
  },
  {
    id: 'scrapbook',
    title: 'Scrapbook diaries',
    subtitle: 'Polaroids, tape and handwritten notes',
    match: ['scrapbook'],
    cover: 'scrapbook',
  },
  {
    id: 'minimal',
    title: 'Clean & minimal',
    subtitle: 'Quiet layouts that let photos breathe',
    match: ['minimal'],
    cover: 'clean-lines',
  },
  {
    id: 'analog',
    title: 'Analog',
    subtitle: 'Film rolls, notebooks and postcards',
    match: ['analog'],
    cover: 'contact-sheet',
  },
  {
    id: 'series',
    title: 'Make it a series',
    subtitle: 'Tips, itineraries and countdowns, one slide at a time',
    match: ['series'],
    cover: 'tips',
  },
  {
    id: 'launch',
    title: 'Launch week',
    subtitle: 'Drops, reveals and before-and-afters',
    match: ['launch', 'product'],
    cover: 'new-drop',
  },
];

export const inCollection = (t: Template, c: Collection) => templateWords(t).some((w) => c.match.includes(w));

/** What people said they make, in onboarding. `scene` is the sample photo on its tile. */
export type Interest = { id: string; label: string; scene: string; match: string[] };

export const INTERESTS: Interest[] = [
  { id: 'travel', label: 'Travel', scene: 'hiker', match: ['travel'] },
  { id: 'photo-dump', label: 'Photo dump', scene: 'camera', match: ['photo dump'] },
  { id: 'recap', label: 'Monthly recap', scene: 'friends', match: ['recap', 'monthly'] },
  { id: 'events', label: 'Events & weddings', scene: 'concert', match: ['events', 'event', 'wedding'] },
  { id: 'business', label: 'Business & product', scene: 'street', match: ['business', 'product'] },
  { id: 'minimal', label: 'Minimal & editorial', scene: 'dunes', match: ['minimal', 'editorial'] },
  { id: 'stories', label: 'Stories', scene: 'portrait', match: ['story'] },
  { id: 'panorama', label: 'Panoramas', scene: 'peaks', match: ['panorama', 'landscape'] },
];

/** Templates matching the picked interests, best matches first. Empty when nothing was picked. */
export function forYou(list: Template[], interests: string[]): Template[] {
  const picked = INTERESTS.filter((i) => interests.includes(i.id));
  if (!picked.length) return [];
  return list
    .map((t, index) => {
      const words = templateWords(t);
      return { t, index, score: picked.filter((i) => i.match.some((m) => words.includes(m))).length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((x) => x.t);
}

/** Turns a template into a fresh document (new ids, measured text). */
export function instantiate(t: Template): Doc {
  const now = Date.now();
  if (t.doc) {
    // A saved design: fresh ids, groups kept together under new group ids.
    const groups = new Map<string, string>();
    const regroup = (g?: string) => {
      if (!g) return undefined;
      if (!groups.has(g)) groups.set(g, uid());
      return groups.get(g);
    };
    return {
      ...t.doc,
      id: uid(),
      name: t.name,
      folder: undefined,
      layers: t.doc.layers.map((l) => ({ ...l, id: uid(), group: regroup(l.group) })),
      createdAt: now,
      updatedAt: now,
    };
  }
  const layers: Layer[] = t.items.map((item): Layer => {
    const base = { id: uid(), scale: 1, opacity: 1 };
    if (item.kind === 'slot') {
      return {
        ...base,
        type: 'photo',
        src: '',
        slot: true,
        cell: true,
        aspect: item.w / item.h,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        rotation: item.rotation ?? 0,
        radius: item.radius ?? 0,
        border: item.border ?? 0,
        borderColor: item.borderColor ?? '#FFFFFF',
        frame: item.frame,
        shadow: item.shadow,
        adjust: item.filter ? { ...DEFAULT_ADJUST, filter: item.filter } : undefined,
      };
    }
    if (item.kind === 'doodle') {
      const { strokes, w, h } = doodleStrokes(item);
      return { ...base, type: 'drawing', strokes, x: item.x, y: item.y, w, h, rotation: item.rotation ?? 0 };
    }
    if (item.kind === 'text') {
      const values = {
        text: item.text,
        font: item.font,
        size: item.size,
        color: item.color,
        align: item.align ?? ('center' as const),
        fill: item.fill ?? null,
        fillStyle: item.fillStyle,
        outline: item.outline ?? null,
        curve: item.curve,
        spacing: item.spacing,
        shadow: item.shadow,
      };
      return { ...base, type: 'text', ...values, ...measureText(values), x: item.x, y: item.y, rotation: item.rotation ?? 0 };
    }
    return {
      ...base,
      type: 'shape',
      shape: item.shape,
      color: item.color,
      radius: item.radius ?? (item.shape === 'line' ? 2 : 0),
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      rotation: item.rotation ?? 0,
    };
  });
  return {
    id: uid(),
    name: t.name,
    aspect: t.aspect,
    slideCount: t.slideCount,
    background: t.background,
    layers,
    createdAt: now,
    updatedAt: now,
  };
}

const previews = new Map<string, Doc>();

/** A cached instance used only to draw the template's thumbnail. */
export function templatePreview(t: Template) {
  let doc = previews.get(t.id);
  if (!doc) {
    doc = instantiate(t);
    previews.set(t.id, doc);
  }
  return doc;
}

export const templateHeight = (t: Template) => ASPECTS[t.aspect].height;

// ---------------------------------------------------------------------------
// Remote catalog: extra templates fetched from `extra.templatesUrl` in the app
// config (a JSON array of templates in the same shape as above), cached on
// disk so they're there offline and on the next launch.

let remote: Template[] = [];
const listeners = new Set<() => void>();
const cacheFile = () => new File(Paths.document, 'templates-remote.json');

const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const DOODLES: DoodleShape[] = ['arrow', 'underline', 'heart', 'star', 'circle', 'sparkle', 'route', 'squiggle'];
const isStr = (v: unknown) => typeof v === 'string';

function validItem(i: unknown): boolean {
  const it = i as Record<string, unknown>;
  if (!it || !isNum(it.x) || !isNum(it.y)) return false;
  if (it.kind === 'slot' || it.kind === 'shape') return isNum(it.w) && isNum(it.h);
  if (it.kind === 'text') return isStr(it.text) && isStr(it.font) && isNum(it.size) && isStr(it.color);
  if (it.kind === 'doodle') return isNum(it.w) && isNum(it.h) && isStr(it.color) && DOODLES.includes(it.shape as DoodleShape);
  return false;
}

const strings = (v: unknown) => (Array.isArray(v) && v.every(isStr) ? (v as string[]) : undefined);

/**
 * Drops anything that doesn't look like a template, so a bad feed can't crash
 * the app. Optional fields (tags, isNew, samples) are kept only when well formed.
 */
export function parseTemplates(json: unknown): Template[] {
  if (!Array.isArray(json)) return [];
  return json.filter(isTemplate).map((t) => ({
    ...t,
    tags: strings(t.tags),
    samples: strings(t.samples),
    isNew: t.isNew === true ? true : undefined,
  }));
}

function isTemplate(t: unknown): t is Template {
  const v = t as Record<string, unknown>;
  return (
    isStr(v?.id) &&
    isStr(v.name) &&
    isStr(v.category) &&
    typeof v.aspect === 'string' &&
    v.aspect in ASPECTS &&
    isNum(v.slideCount) &&
    (v.slideCount as number) >= 1 &&
    (v.slideCount as number) <= 20 &&
    typeof v.background === 'object' &&
    Array.isArray(v.items) &&
    v.items.every(validItem)
  );
}

function setRemote(list: Template[]) {
  remote = list;
  listeners.forEach((l) => l());
}

/** Loads the cached catalog, then refreshes it from the network if a URL is configured. */
export async function refreshRemoteTemplates() {
  try {
    if (cacheFile().exists) setRemote(parseTemplates(JSON.parse(await cacheFile().text())));
  } catch {
    // Ignore a broken cache.
  }
  const url = (Constants.expoConfig?.extra as { templatesUrl?: string } | undefined)?.templatesUrl;
  if (!url) return;
  try {
    const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) return;
    const list = parseTemplates(await res.json());
    cacheFile().write(JSON.stringify(list));
    setRemote(list);
  } catch {
    // Offline: keep whatever was cached.
  }
}

/** Built-in templates plus the remote catalog (remote entries replace built-ins with the same id). */
export function useTemplates(): Template[] {
  const version = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => remote,
  );
  const mine = useMyTemplates();
  const ids = new Set(version.map((t) => t.id));
  return [...mine, ...TEMPLATES.filter((t) => !ids.has(t.id)), ...version];
}
