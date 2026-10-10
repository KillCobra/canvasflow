import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { measureText } from './text';
import {
  ASPECTS,
  type AspectId,
  type Background,
  type Doc,
  type FontId,
  type FrameShape,
  type Layer,
  type ShapeLayer,
  uid,
} from './types';

// Starter designs. Photos are empty slots the user fills; text is measured
// with the bundled fonts when a template is turned into a project.

type Slot = {
  kind: 'slot';
  x: number;
  y: number;
  w: number;
  h: number;
  radius?: number;
  border?: number;
  borderColor?: string;
  rotation?: number;
  frame?: FrameShape;
  shadow?: boolean;
};

type Txt = {
  kind: 'text';
  text: string;
  font: FontId;
  size: number;
  color: string;
  x: number;
  y: number;
  align?: 'left' | 'center' | 'right';
  fill?: string;
  fillStyle?: 'pill' | 'highlight';
  outline?: { width: number; color: string };
  curve?: number;
  spacing?: number;
  shadow?: boolean;
  rotation?: number;
};

type Shp = {
  kind: 'shape';
  shape: ShapeLayer['shape'];
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  radius?: number;
  rotation?: number;
};

export type TemplateCategory = string;

export type Template = {
  id: string;
  name: string;
  category: TemplateCategory;
  aspect: AspectId;
  slideCount: number;
  background: Background;
  items: (Slot | Txt | Shp)[];
  /** Search words; also how templates join collections and onboarding interests. */
  tags?: string[];
  /** Listed under the New filter. */
  isNew?: boolean;
  /** Scene ids for the sample photos in its preview (see samples.tsx). */
  samples?: string[];
};

const S = 1080;
const INK = '#16120B';
const IVORY = '#F2EFE9';
const SAND = '#E8DDCB';
const STONE = '#5B5650';
const CLAY = '#C8553D';
const GOLD = '#D9C29C';

const slot = (x: number, y: number, w: number, h: number, extra: Partial<Slot> = {}): Slot => ({
  kind: 'slot',
  x,
  y,
  w,
  h,
  ...extra,
});

const txt = (
  text: string,
  font: FontId,
  size: number,
  color: string,
  x: number,
  y: number,
  extra: Partial<Txt> = {},
): Txt => ({ kind: 'text', text, font, size, color, x, y, ...extra });

const shp = (
  shape: Shp['shape'],
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  extra: Partial<Shp> = {},
): Shp => ({ kind: 'shape', shape, x, y, w, h, color, ...extra });

const grid = (slide: number, margin: number, gutter: number, height: number): Slot[] => {
  const cw = (S - margin * 2 - gutter) / 2;
  const ch = (height - margin * 2 - gutter) / 2;
  return [0, 1, 2, 3].map((i) =>
    slot(
      slide * S + margin + cw / 2 + (i % 2) * (cw + gutter),
      margin + ch / 2 + Math.floor(i / 2) * (ch + gutter),
      cw,
      ch,
    ),
  );
};

export const TEMPLATES: Template[] = [
  {
    id: 'photo-dump',
    name: 'Photo Dump',
    category: 'Photo dump',
    aspect: '4:5',
    slideCount: 4,
    tags: ['photo dump', 'recap', 'monthly', 'casual'],
    background: { kind: 'solid', color: IVORY },
    items: [
      txt('photo dump', 'italic', 150, INK, 470, 190),
      txt('vol. 01 — october', 'mono', 34, STONE, 470, 300),
      slot(470, 860, 740, 820),
      slot(1300, 600, 760, 940),
      slot(2160, 900, 900, 700),
      slot(2950, 420, 640, 640),
      slot(3780, 920, 640, 760),
      txt('more soon', 'italic', 90, INK, 3780, 210),
    ],
  },
  {
    id: 'panorama',
    name: 'Panorama',
    category: 'Panorama',
    aspect: '4:5',
    slideCount: 3,
    tags: ['panorama', 'travel', 'landscape', 'summer'],
    samples: ['peaks', 'sunset', 'ocean', 'dunes'],
    background: { kind: 'solid', color: '#0A0A0A' },
    items: [
      slot(1620, 675, 3 * S, 1350),
      txt('Somewhere quiet', 'serif', 130, '#FFFFFF', 540, 1110),
      txt('38.7223° N, 9.1393° W', 'mono', 34, IVORY, 540, 1225),
      txt('→', 'sans', 80, '#FFFFFF', 3060, 1220),
    ],
  },
  {
    id: 'travel-diary',
    name: 'Travel Diary',
    category: 'Travel',
    aspect: '4:5',
    slideCount: 3,
    tags: ['travel', 'city', 'scrapbook', 'weekend'],
    background: { kind: 'solid', color: SAND },
    items: [
      txt('Lisbon', 'editorial', 200, INK, 540, 250),
      txt('a long weekend', 'italic', 70, STONE, 540, 390),
      slot(540, 900, 720, 720, { border: 26, borderColor: '#FFFFFF', rotation: -0.04 }),
      slot(1890, 620, 1260, 860),
      txt('day two', 'italic', 64, STONE, 1500, 1180),
      txt('obrigado', 'script', 110, CLAY, 2860, 240),
      slot(2850, 1040, 560, 440, { radius: 12 }),
    ],
  },
  {
    id: 'before-after',
    name: 'Before / After',
    category: 'Business',
    aspect: '1:1',
    slideCount: 2,
    tags: ['business', 'product', 'transformation', 'launch'],
    background: { kind: 'solid', color: '#0A0A0A' },
    items: [
      slot(540, 540, S, S),
      slot(1620, 540, S, S),
      txt('BEFORE', 'sans', 40, INK, 190, 90, { fill: IVORY }),
      txt('AFTER', 'sans', 40, INK, 1260, 90, { fill: GOLD }),
    ],
  },
  {
    id: 'quote',
    name: 'Quote',
    category: 'Editorial',
    aspect: '4:5',
    slideCount: 2,
    tags: ['editorial', 'minimal', 'quote', 'words'],
    background: { kind: 'gradient', colors: [IVORY, SAND], angle: 0 },
    items: [
      txt('“Make it simple,\nbut significant.”', 'italic', 116, INK, 540, 600),
      shp('line', 540, 800, 120, 4, INK),
      txt('DON DRAPER', 'mono', 32, STONE, 540, 880),
      slot(1620, 675, 880, 1150, { radius: 8 }),
    ],
  },
  {
    id: 'new-drop',
    name: 'New Drop',
    category: 'Business',
    aspect: '4:5',
    slideCount: 3,
    tags: ['business', 'product', 'launch', 'fashion'],
    background: { kind: 'solid', color: '#0A0A0A' },
    items: [
      txt('NEW\nDROP', 'condensed', 330, IVORY, 540, 620),
      txt('Autumn edit · 2026', 'mono', 36, GOLD, 540, 1180),
      slot(1620, 675, S, 1350),
      txt('Available now', 'serif', 120, IVORY, 2700, 560),
      txt('link in bio', 'sans', 42, INK, 2700, 760, { fill: GOLD }),
      shp('circle', 2700, 1120, 22, 22, GOLD),
    ],
  },
  {
    id: 'recap',
    name: 'Year in Review',
    category: 'Editorial',
    aspect: '4:5',
    slideCount: 4,
    tags: ['recap', 'year', 'editorial', 'monthly'],
    background: { kind: 'solid', color: IVORY },
    items: [
      txt('2026\nin review', 'editorial', 170, INK, 540, 560),
      txt('swipe →', 'mono', 34, STONE, 540, 1200),
      ...[1, 2, 3].flatMap((k) => [
        txt(`0${k}`, 'condensed', 200, CLAY, k * S + 170, 210),
        slot(k * S + 540, 790, 880, 900),
      ]),
    ],
  },
  {
    id: 'mood-board',
    name: 'Mood Board',
    category: 'Photo dump',
    aspect: '1:1',
    slideCount: 3,
    tags: ['photo dump', 'grid', 'scrapbook', 'aesthetic'],
    background: { kind: 'solid', color: SAND },
    items: [0, 1, 2].flatMap((k) => grid(k, 56, 20, S)),
  },
  {
    id: 'film-strip',
    name: 'Film Strip',
    category: 'Panorama',
    aspect: '9:16',
    slideCount: 3,
    tags: ['panorama', 'film', 'story', 'weekend'],
    background: { kind: 'solid', color: '#0A0A0A' },
    items: [
      slot(700, 900, 900, 1400),
      slot(1860, 1050, 900, 1250),
      slot(2860, 760, 640, 900),
      txt('weekend', 'italic', 190, IVORY, 540, 1780),
      txt('roll 24 · 35mm', 'mono', 38, GOLD, 2860, 1440),
    ],
  },
  {
    id: 'polaroid-wall',
    name: 'Polaroid Wall',
    category: 'Travel',
    aspect: '4:5',
    slideCount: 3,
    tags: ['travel', 'scrapbook', 'summer', 'photo dump', 'polaroid'],
    background: { kind: 'solid', color: SAND },
    items: [
      txt('summer notes', 'script', 120, INK, 540, 200),
      slot(560, 760, 620, 760, { frame: 'polaroid', rotation: -0.06, shadow: true }),
      slot(1300, 600, 600, 740, { frame: 'polaroid', rotation: 0.05, shadow: true }),
      slot(2080, 820, 620, 760, { frame: 'polaroid', rotation: -0.03, shadow: true }),
      slot(2780, 520, 520, 640, { frame: 'polaroid', rotation: 0.07, shadow: true }),
      txt('the good days', 'script', 90, STONE, 2800, 1180, { rotation: -0.05 }),
    ],
  },
  {
    id: 'arches',
    name: 'Arches',
    category: 'Editorial',
    aspect: '4:5',
    slideCount: 3,
    tags: ['editorial', 'minimal', 'wedding', 'day'],
    background: { kind: 'solid', color: IVORY },
    items: [0, 1, 2].flatMap((k) => [
      slot(k * S + 540, 640, 700, 900, { frame: 'arch' }),
      txt(['Morning', 'Afternoon', 'Evening'][k], 'italic', 84, INK, k * S + 540, 1200),
    ]),
  },
  {
    id: 'circles',
    name: 'Circles',
    category: 'Minimal',
    aspect: '1:1',
    slideCount: 3,
    tags: ['minimal', 'travel', 'summer'],
    background: { kind: 'solid', color: '#0A0A0A' },
    items: [
      txt('around the world', 'serif', 96, IVORY, 540, 300, { curve: 0.45 }),
      slot(780, 620, 640, 640, { frame: 'circle' }),
      slot(1620, 460, 520, 520, { frame: 'circle' }),
      slot(2380, 640, 600, 600, { frame: 'circle' }),
      txt('2026', 'mono', 40, GOLD, 2900, 980),
    ],
  },
  {
    id: 'headline',
    name: 'Headline',
    category: 'Business',
    aspect: '4:5',
    slideCount: 2,
    tags: ['business', 'tips', 'editorial', 'launch'],
    background: { kind: 'solid', color: '#0A0A0A' },
    items: [
      slot(540, 675, S, 1350),
      txt('5 things we\nlearned this year', 'sans', 92, INK, 540, 1060, {
        fill: IVORY,
        fillStyle: 'highlight',
        align: 'left',
      }),
      txt('01  Ship small.\n02  Talk to people.\n03  Rest on purpose.\n04  Write it down.\n05  Keep going.', 'rounded', 64, IVORY, 1620, 675, { align: 'left' }),
    ],
  },
  {
    id: 'zine',
    name: 'Zine',
    category: 'Editorial',
    aspect: '4:5',
    slideCount: 4,
    tags: ['editorial', 'scrapbook', 'city', 'magazine'],
    background: { kind: 'solid', color: '#F6D5C4' },
    items: [
      txt('ZINE', 'condensed', 420, '#F6D5C4', 540, 520, { outline: { width: 0.03, color: INK } }),
      txt('issue nº 4 — city', 'mono', 38, INK, 540, 820),
      slot(1620, 675, S, 1350),
      slot(2700, 470, 860, 620, { radius: 10 }),
      slot(2700, 1060, 860, 420, { radius: 10 }),
      txt('fin.', 'italic', 140, INK, 3780, 675),
    ],
  },
  {
    id: 'story-sequence',
    name: 'Story Sequence',
    category: 'Story',
    aspect: '9:16',
    slideCount: 3,
    tags: ['story', 'event', 'before after'],
    background: { kind: 'solid', color: '#0A0A0A' },
    items: [0, 1, 2].flatMap((k) => [
      slot(k * S + 540, 960, S, 1920),
      txt(`0${k + 1}`, 'condensed', 160, '#FFFFFF', k * S + 160, 200),
      txt(['before', 'during', 'after'][k], 'italic', 96, '#FFFFFF', k * S + 540, 1700, { shadow: true }),
    ]),
  },
  {
    id: 'grid-recap',
    name: 'Grid Recap',
    category: 'Photo dump',
    aspect: '4:5',
    slideCount: 2,
    tags: ['photo dump', 'recap', 'monthly', 'grid'],
    background: { kind: 'solid', color: IVORY },
    items: [
      slot(540, 470, 972, 832),
      slot(298, 1135, 486, 378),
      slot(782, 1135, 486, 378),
      ...[0, 1, 2].flatMap((r) =>
        [0, 1, 2].map((c) => slot(S + 54 + 162 + c * 330, 54 + 207 + r * 414, 318, 402)),
      ),
    ],
  },
  {
    id: 'save-the-date',
    name: 'Save the Date',
    category: 'Events',
    aspect: '4:5',
    slideCount: 2,
    tags: ['wedding', 'event', 'invitation', 'editorial'],
    background: { kind: 'gradient', colors: [IVORY, SAND], angle: Math.PI / 2 },
    items: [
      txt('save the date', 'italic', 110, INK, 540, 260, { curve: 0.3 }),
      slot(540, 800, 640, 820, { frame: 'arch', border: 14, borderColor: GOLD }),
      txt('14 · 06 · 2027', 'mono', 44, STONE, 540, 1260),
      txt('Lisbon,\nPortugal', 'editorial', 120, INK, 1620, 560),
      shp('line', 1620, 760, 140, 3, GOLD),
      txt('details to follow', 'serif', 56, STONE, 1620, 860),
    ],
  },
  {
    id: 'launch',
    name: 'Product Launch',
    category: 'Business',
    aspect: '1:1',
    slideCount: 3,
    tags: ['business', 'product', 'launch'],
    background: { kind: 'solid', color: '#141414' },
    items: [
      txt('MEET', 'condensed', 300, '#141414', 540, 380, { outline: { width: 0.02, color: GOLD } }),
      txt('the new one', 'italic', 110, IVORY, 540, 640),
      slot(1620, 540, 760, 760, { frame: 'circle', shadow: true }),
      txt('Out now', 'sans', 54, INK, 2700, 760, { fill: GOLD, fillStyle: 'pill' }),
      slot(2700, 420, 700, 440, { radius: 24 }),
    ],
  },
  // Newer additions (listed under New).
  {
    id: 'summer-recap',
    name: 'Summer Recap',
    category: 'Travel',
    aspect: '4:5',
    slideCount: 3,
    isNew: true,
    tags: ['summer', 'recap', 'travel', 'panorama'],
    samples: ['ocean', 'palms', 'sunset', 'dunes'],
    background: { kind: 'solid', color: '#F4EBDD' },
    items: [
      txt("summer '26", 'script', 150, INK, 540, 210),
      txt('a season in pictures', 'mono', 32, STONE, 540, 320),
      // One photo running across the first seam.
      slot(1080, 840, 1900, 780, { radius: 18 }),
      slot(2700, 560, 820, 900, { frame: 'arch' }),
      txt('until next summer', 'italic', 86, INK, 2700, 1150),
    ],
  },
  {
    id: 'scrapbook',
    name: 'Scrapbook',
    category: 'Photo dump',
    aspect: '4:5',
    slideCount: 3,
    isNew: true,
    tags: ['scrapbook', 'photo dump', 'memories', 'summer'],
    samples: ['palms', 'bokeh', 'stilllife', 'portrait', 'sunset'],
    background: { kind: 'solid', color: '#E9DCC6' },
    items: [
      txt('dear diary,', 'script', 120, INK, 500, 190, { rotation: -0.04 }),
      slot(470, 720, 600, 700, { border: 22, borderColor: '#FFFFFF', rotation: -0.05, shadow: true }),
      shp('rect', 450, 385, 200, 54, '#F2D27ACC', { rotation: -0.08 }),
      slot(1180, 830, 640, 520, { border: 22, borderColor: '#FFFFFF', rotation: 0.06, shadow: true }),
      shp('rect', 1200, 580, 190, 50, '#BFD8C8CC', { rotation: 0.12 }),
      txt('best day ever', 'script', 80, CLAY, 760, 1250, { rotation: -0.03 }),
      slot(1720, 420, 460, 560, { frame: 'polaroid', rotation: -0.07, shadow: true }),
      slot(2420, 780, 620, 760, { frame: 'polaroid', rotation: 0.05, shadow: true }),
      slot(2950, 330, 400, 400, { frame: 'circle', border: 16, borderColor: '#FFFFFF' }),
      txt('xo', 'script', 150, CLAY, 2980, 1120, { rotation: 0.06 }),
    ],
  },
  {
    id: 'monthly-recap',
    name: 'Monthly Recap',
    category: 'Photo dump',
    aspect: '4:5',
    slideCount: 3,
    isNew: true,
    tags: ['recap', 'monthly', 'photo dump', 'grid'],
    samples: ['stilllife', 'sunset', 'bokeh', 'skyline', 'forest', 'portrait'],
    background: { kind: 'solid', color: IVORY },
    items: [
      txt('October', 'editorial', 180, INK, 540, 290),
      txt('in pictures', 'italic', 90, STONE, 540, 440),
      slot(540, 860, 760, 560, { radius: 10 }),
      txt('31 days · 1 carousel', 'mono', 30, STONE, 540, 1240),
      ...grid(1, 70, 24, 1350).map((s) => ({ ...s, radius: 10 })),
      slot(2700, 560, 900, 860, { radius: 10 }),
      txt('see you, November', 'italic', 80, INK, 2700, 1150),
    ],
  },
  {
    id: 'wedding-day',
    name: 'Wedding Day',
    category: 'Events',
    aspect: '4:5',
    slideCount: 3,
    isNew: true,
    tags: ['wedding', 'event', 'love', 'editorial'],
    samples: ['portrait', 'bokeh', 'lake', 'stilllife'],
    background: { kind: 'gradient', colors: [IVORY, '#EFE6DA'], angle: Math.PI / 2 },
    items: [
      txt('Ana & Leo', 'script', 150, INK, 540, 280),
      shp('line', 540, 400, 120, 3, GOLD),
      txt('09 · 08 · 2026', 'mono', 36, STONE, 540, 460),
      slot(540, 930, 620, 700, { frame: 'arch', border: 12, borderColor: GOLD }),
      slot(1620, 675, 900, 1150, { radius: 6 }),
      slot(2470, 560, 400, 560, { frame: 'arch' }),
      slot(2930, 560, 400, 560, { frame: 'arch' }),
      txt('happily ever after', 'italic', 84, INK, 2700, 1060),
      txt('thank you for celebrating with us', 'serif', 40, STONE, 2700, 1160),
    ],
  },
  {
    id: 'clean-lines',
    name: 'Clean Lines',
    category: 'Minimal',
    aspect: '1:1',
    slideCount: 3,
    isNew: true,
    tags: ['minimal', 'clean', 'editorial'],
    samples: ['dunes', 'ocean', 'forest', 'stilllife'],
    background: { kind: 'solid', color: '#F7F6F3' },
    items: [
      txt('less, but better', 'serif', 72, INK, 540, 150),
      slot(540, 590, 640, 640),
      txt('01', 'mono', 28, STONE, 540, 975),
      slot(1620, 500, 760, 520),
      shp('line', 1620, 850, 760, 2, INK),
      txt('Field notes, vol. 2', 'serif', 52, INK, 1620, 925),
      slot(2700, 530, 420, 740),
      txt('02', 'mono', 28, STONE, 2700, 975),
    ],
  },
];

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  'Photo dump',
  'Travel',
  'Editorial',
  'Business',
  'Minimal',
  'Events',
  'Story',
  'Panorama',
];

// ---------------------------------------------------------------------------
// Browsing. Search, collections and onboarding interests all match on a
// template's words (category plus tags), so remote templates join in just by
// carrying the right tags.

/** Picked by hand; shown when there's nothing personal to show yet. */
const FEATURED = ['polaroid-wall', 'summer-recap', 'photo-dump', 'circles', 'scrapbook', 'panorama', 'headline', 'arches'];

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
  { id: 'travel', label: 'Travel', scene: 'palms', match: ['travel'] },
  { id: 'photo-dump', label: 'Photo dump', scene: 'stilllife', match: ['photo dump'] },
  { id: 'recap', label: 'Monthly recap', scene: 'sunset', match: ['recap', 'monthly'] },
  { id: 'events', label: 'Events & weddings', scene: 'bokeh', match: ['events', 'event', 'wedding'] },
  { id: 'business', label: 'Business & product', scene: 'skyline', match: ['business', 'product'] },
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
      };
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
const isStr = (v: unknown) => typeof v === 'string';

function validItem(i: unknown): boolean {
  const it = i as Record<string, unknown>;
  if (!it || !isNum(it.x) || !isNum(it.y)) return false;
  if (it.kind === 'slot' || it.kind === 'shape') return isNum(it.w) && isNum(it.h);
  if (it.kind === 'text') return isStr(it.text) && isStr(it.font) && isNum(it.size) && isStr(it.color);
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
  const ids = new Set(version.map((t) => t.id));
  return [...TEMPLATES.filter((t) => !ids.has(t.id)), ...version];
}
