import { Image, type SkImage, Skia, drawAsImage } from '@shopify/react-native-skia';
import { useEffect, useSyncExternalStore } from 'react';
import { Image as RNImage } from 'react-native';

import { frameInner } from './geometry';
import type { ImageMap } from './images';
import { type Template, templatePreview } from './templates';
import type { Doc } from './types';

// Sample photos for template previews: real photos from Lorem Picsum
// (Unsplash photographers, credited in Acknowledgements), bundled with the
// app and cropped on device to the shape a slot needs the first time a
// thumbnail asks for them. They only ever fill preview copies of a template
// (see samplePreview); projects made from a template keep their empty slots.

export type SceneId =
  | 'sunset'
  | 'ocean'
  | 'lake'
  | 'skyline'
  | 'dunes'
  | 'forest'
  | 'palms'
  | 'stars'
  | 'bokeh'
  | 'stilllife'
  | 'portrait'
  | 'peaks'
  | 'friends'
  | 'concert'
  | 'summer'
  | 'street'
  | 'hiker'
  | 'traveler'
  | 'berries'
  | 'camera'
  | 'strawberries'
  | 'cake'
  | 'tea'
  | 'pourover'
  | 'cabin'
  | 'room'
  | 'cafe'
  | 'vinyl'
  | 'stage'
  | 'knit'
  | 'heels'
  | 'book';

/** Tall fills portrait and square slots, land the landscape ones, wide the panoramas. */
type Variant = 'tall' | 'land' | 'wide';

const SIZES: Record<Variant, { width: number; height: number }> = {
  tall: { width: 512, height: 640 },
  land: { width: 768, height: 512 },
  wide: { width: 1280, height: 512 },
};

/** One 1280px photo per scene, in assets/samples (credits in credits.ts). */
export const PHOTOS: Record<SceneId, number> = {
  sunset: require('../../assets/samples/sunset.jpg'),
  ocean: require('../../assets/samples/ocean.jpg'),
  lake: require('../../assets/samples/lake.jpg'),
  skyline: require('../../assets/samples/skyline.jpg'),
  dunes: require('../../assets/samples/dunes.jpg'),
  forest: require('../../assets/samples/forest.jpg'),
  palms: require('../../assets/samples/palms.jpg'),
  stars: require('../../assets/samples/stars.jpg'),
  bokeh: require('../../assets/samples/bokeh.jpg'),
  stilllife: require('../../assets/samples/stilllife.jpg'),
  portrait: require('../../assets/samples/portrait.jpg'),
  peaks: require('../../assets/samples/peaks.jpg'),
  friends: require('../../assets/samples/friends.jpg'),
  concert: require('../../assets/samples/concert.jpg'),
  summer: require('../../assets/samples/summer.jpg'),
  street: require('../../assets/samples/street.jpg'),
  hiker: require('../../assets/samples/hiker.jpg'),
  traveler: require('../../assets/samples/traveler.jpg'),
  berries: require('../../assets/samples/berries.jpg'),
  camera: require('../../assets/samples/camera.jpg'),
  strawberries: require('../../assets/samples/strawberries.jpg'),
  cake: require('../../assets/samples/cake.jpg'),
  tea: require('../../assets/samples/tea.jpg'),
  pourover: require('../../assets/samples/pourover.jpg'),
  cabin: require('../../assets/samples/cabin.jpg'),
  room: require('../../assets/samples/room.jpg'),
  cafe: require('../../assets/samples/cafe.jpg'),
  vinyl: require('../../assets/samples/vinyl.jpg'),
  stage: require('../../assets/samples/stage.jpg'),
  knit: require('../../assets/samples/knit.jpg'),
  heels: require('../../assets/samples/heels.jpg'),
  book: require('../../assets/samples/book.jpg'),
};

export const SCENE_IDS = Object.keys(PHOTOS) as SceneId[];

/**
 * Decodes a scene's photo and cover-crops it to the variant's size. The full
 * photo is released straight away, so only the small crops stay in memory.
 */
async function cropScene(scene: SceneId, variant: Variant) {
  const { uri } = RNImage.resolveAssetSource(PHOTOS[scene]);
  const data = await Skia.Data.fromURI(uri);
  const photo = Skia.Image.MakeImageFromEncoded(data);
  if (!photo) return null;
  const size = SIZES[variant];
  try {
    return await drawAsImage(<Image image={photo} x={0} y={0} width={size.width} height={size.height} fit="cover" />, size);
  } finally {
    photo.dispose();
  }
}

// ---------------------------------------------------------------------------
// Lazy cache. Crops are made one at a time, yielding a frame between each,
// the first time something on screen needs them.

const PREFIX = 'sample:';
const images = new Map<string, SkImage>();
const failed = new Set<string>();
const queue: string[] = [];
const listeners = new Set<() => void>();
let version = 0;
let running = false;

const keyFor = (scene: SceneId, variant: Variant) => `${PREFIX}${scene}${variant === 'tall' ? '' : `@${variant}`}`;

export const isSampleSrc = (src: string) => src.startsWith(PREFIX);

function parseKey(key: string) {
  const [scene, variant = 'tall'] = key.slice(PREFIX.length).split('@');
  return scene in PHOTOS && variant in SIZES ? { scene: scene as SceneId, variant: variant as Variant } : null;
}

/** One scene cropped to a variant. The caller owns the image. */
export function renderScene(scene: SceneId, variant: Variant = 'tall') {
  return cropScene(scene, variant);
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function pump() {
  running = true;
  while (queue.length) {
    const key = queue.shift()!;
    const parsed = parseKey(key);
    if (!parsed || images.has(key)) continue;
    try {
      const image = await renderScene(parsed.scene, parsed.variant);
      if (image) images.set(key, image);
      else failed.add(key);
    } catch {
      failed.add(key);
    }
    version++;
    listeners.forEach((l) => l());
    await nextFrame();
  }
  running = false;
}

function request(keys: string[]) {
  for (const k of keys) {
    if (!images.has(k) && !failed.has(k) && !queue.includes(k)) queue.push(k);
  }
  if (!running && queue.length) pump();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

// `_version` makes the inputs change when the cache does, so the React
// Compiler doesn't reuse a stale result (same trick as images.ts).
function missing(keys: string[], _version: number) {
  return keys.filter((k) => !images.has(k) && !failed.has(k)).join('|');
}

function mapFor(keys: string[], _version: number): ImageMap {
  const out: ImageMap = {};
  for (const k of keys) out[k] = images.get(k);
  return out;
}

/**
 * Sample images for these keys, drawing any that aren't made yet. `ready`
 * once every one has been drawn (or failed, which then shows as a blank).
 */
function useSampleKeys(keys: string[]) {
  const v = useSyncExternalStore(subscribe, () => version);
  const todo = missing(keys, v);
  useEffect(() => {
    if (todo) request(todo.split('|'));
  }, [todo]);
  return { images: mapFor(keys, v), ready: !todo };
}

/**
 * A template's preview doc with sample photos in its slots (or its plain
 * empty slots with `empty`), plus the images to draw it with.
 */
export function useSamplePreview(t: Template, empty = false): { doc: Doc; images: ImageMap; ready: boolean } {
  const doc = empty ? templatePreview(t) : samplePreview(t);
  const { images, ready } = useSampleKeys(sampleKeys(doc));
  return { doc, images, ready };
}

export const isScene = (s: string): s is SceneId => s in PHOTOS;

/** One scene, portrait-shaped (onboarding tiles). */
export function useSceneImage(scene: SceneId): SkImage | undefined {
  const key = keyFor(scene, 'tall');
  return useSampleKeys([key]).images[key];
}

function sampleKeys(doc: Doc) {
  return [...new Set(doc.layers.flatMap((l) => (l.type === 'photo' && isSampleSrc(l.src) ? [l.src] : [])))];
}

// ---------------------------------------------------------------------------
// Filling templates.

/** Scenes that suit each kind of template; anything else draws from all of them. */
const POOLS: Record<string, SceneId[]> = {
  travel: ['traveler', 'lake', 'palms', 'hiker', 'street', 'ocean', 'peaks', 'skyline', 'cabin'],
  panorama: ['peaks', 'sunset', 'ocean', 'dunes', 'lake', 'stars', 'forest'],
  'photo dump': ['friends', 'berries', 'camera', 'concert', 'stilllife', 'summer', 'bokeh', 'street', 'cafe', 'strawberries'],
  editorial: ['portrait', 'stilllife', 'camera', 'summer', 'dunes', 'room', 'book', 'knit'],
  business: ['stilllife', 'camera', 'street', 'room', 'cafe', 'skyline', 'pourover', 'portrait'],
  minimal: ['dunes', 'room', 'palms', 'ocean', 'hiker', 'stilllife', 'forest'],
  story: ['summer', 'portrait', 'traveler', 'skyline', 'concert', 'lake'],
  events: ['concert', 'stage', 'friends', 'bokeh', 'portrait', 'cake', 'summer'],
  food: ['strawberries', 'cake', 'tea', 'pourover', 'berries', 'stilllife', 'cafe'],
  music: ['vinyl', 'stage', 'concert', 'bokeh', 'friends', 'street'],
  fashion: ['knit', 'heels', 'portrait', 'summer', 'street', 'traveler'],
};

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function poolFor(t: Pick<Template, 'category' | 'samples'>): SceneId[] {
  const own = t.samples?.filter(isScene);
  if (own?.length) return own;
  return POOLS[t.category.toLowerCase()] ?? SCENE_IDS;
}

const variantFor = (aspect: number): Variant => (aspect >= 1.9 ? 'wide' : aspect >= 1.2 ? 'land' : 'tall');

/**
 * A copy of `doc` with every empty slot showing a sample photo, picked
 * deterministically from the template so a thumbnail always looks the same.
 * For previews only: these `sample:` srcs must never be saved.
 */
export function fillWithSamples(doc: Doc, t: Pick<Template, 'id' | 'category' | 'samples'>): Doc {
  const slots = doc.layers.filter((l) => l.type === 'photo' && !l.src).length;
  const own = poolFor(t);
  // Busy layouts borrow from the other scenes before repeating any.
  const pool = slots > own.length ? [...own, ...SCENE_IDS.filter((s) => !own.includes(s))] : own;
  // A template's own list fills its slots in order; category pools start at a
  // place picked by the id, so neighbouring thumbnails don't all match.
  const start = t.samples?.some(isScene) ? 0 : hash(t.id) % pool.length;
  let n = 0;
  const layers = doc.layers.map((l) => {
    if (l.type !== 'photo' || l.src) return l;
    const inner = frameInner(l);
    const variant = variantFor(inner.width / inner.height);
    const { width, height } = SIZES[variant];
    const scene = pool[(start + n++) % pool.length];
    return { ...l, src: keyFor(scene, variant), aspect: width / height, crop: undefined };
  });
  return { ...doc, layers };
}

const filled = new WeakMap<Doc, Doc>();

/** The template's cached preview doc, filled with sample photos. */
export function samplePreview(t: Template): Doc {
  const base = templatePreview(t);
  let doc = filled.get(base);
  if (!doc) {
    doc = fillWithSamples(base, t);
    filled.set(base, doc);
  }
  return doc;
}
