import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useSyncExternalStore } from 'react';

import { type FontId, uid } from './types';

// The brand kit: colours (documents/brand.json, shown first wherever colours
// are picked), logos and other brand images, fonts, and the brand's details
// (name, handle, website, tagline) that fill in templates and the grid planner.

/** Tiny observable value persisted as JSON in the documents folder. */
function persisted<T>(name: string, parse: (raw: unknown) => T, fallback: T) {
  const file = () => new File(Paths.document, name);
  const listeners = new Set<() => void>();
  let value: T | null = null;
  const get = () => {
    if (value === null) {
      try {
        value = file().exists ? parse(JSON.parse(file().textSync())) : fallback;
      } catch {
        value = fallback;
      }
    }
    return value;
  };
  const set = (next: T) => {
    value = next;
    try {
      file().write(JSON.stringify(next));
    } catch {
      // Still updated in memory for this session.
    }
    listeners.forEach((l) => l());
  };
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  };
  const use = () => useSyncExternalStore(subscribe, get);
  return { get, set, use };
}

// ---------------------------------------------------------------------------
// Colours

export const BRAND_COLOR_LIMIT = 24;

/** #RGB / #RRGGBB(AA) in any case -> #RRGGBB, or null if it isn't a hex colour. */
export function normalizeHex(value: string) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1].slice(0, 6);
  return `#${h.toUpperCase()}`;
}

const colors = persisted<string[]>(
  'brand.json',
  (raw) =>
    Array.isArray(raw)
      ? raw.flatMap((c) => (typeof c === 'string' && normalizeHex(c) ? [normalizeHex(c)!] : [])).slice(0, BRAND_COLOR_LIMIT)
      : [],
  [],
);

export const useBrandColors = colors.use;
export const brandColors = colors.get;

export const isBrandColor = (color: string | null | undefined) => {
  const hex = color ? normalizeHex(color) : null;
  return !!hex && colors.get().includes(hex);
};

/** Adds a colour to the front of the palette (no-op if it's already there). Returns false when full. */
export function addBrandColor(color: string) {
  const hex = normalizeHex(color);
  if (!hex || colors.get().includes(hex)) return true;
  if (colors.get().length >= BRAND_COLOR_LIMIT) return false;
  colors.set([hex, ...colors.get()]);
  return true;
}

export function removeBrandColor(color: string) {
  const hex = normalizeHex(color);
  colors.set(colors.get().filter((c) => c !== hex));
}

/** Moves a colour to the front: the first colours lead when a carousel is recoloured. */
export function promoteBrandColor(color: string) {
  const hex = normalizeHex(color);
  if (!hex) return;
  colors.set([hex, ...colors.get().filter((c) => c !== hex)]);
}

// ---------------------------------------------------------------------------
// Images: logos and brand assets (stickers, product shots, patterns). Each kind
// lives in its own folder under documents/brand with an index.json that keeps
// sizes, so a layer can be made without decoding the file first.

export type BrandImage = { id: string; file: string; width: number; height: number; /** Has transparency. */ alpha?: boolean };
export type BrandLogo = BrandImage;

const MAX_EDGE = 1200;

function imageCollection(folder: string, limit: number) {
  const dir = () => {
    const d = new Directory(Paths.document, 'brand', folder);
    if (!d.exists) d.create({ intermediates: true });
    return d;
  };
  const index = () => new File(dir(), 'index.json');
  const listeners = new Set<() => void>();
  let items: BrandImage[] | null = null;

  const read = (): BrandImage[] => {
    try {
      if (!index().exists) return [];
      const list = JSON.parse(index().textSync());
      if (!Array.isArray(list)) return [];
      return list.filter(
        (l): l is BrandImage =>
          !!l && typeof l.id === 'string' && typeof l.file === 'string' && l.width > 0 && l.height > 0 && new File(dir(), l.file).exists,
      );
    } catch {
      return [];
    }
  };
  const current = () => (items ??= read());
  const save = (next: BrandImage[]) => {
    items = next;
    try {
      index().write(JSON.stringify(next));
    } catch {
      // In memory for this session.
    }
    listeners.forEach((l) => l());
  };

  return {
    limit,
    current,
    use: () =>
      useSyncExternalStore((l) => {
        listeners.add(l);
        return () => {
          listeners.delete(l);
        };
      }, current),
    uri: (item: BrandImage) => new File(dir(), item.file).uri,
    /**
     * Copies an image in, capped at 1200px. PNGs (anything that may be
     * transparent) stay PNG; photos are stored as JPEG.
     */
    async add(uri: string, opts: { size?: { width: number; height: number }; alpha?: boolean } = {}) {
      if (current().length >= limit) throw new Error(`Your kit holds up to ${limit}. Remove one first.`);
      const alpha = opts.alpha ?? true;
      const format = alpha ? SaveFormat.PNG : SaveFormat.JPEG;
      const context = ImageManipulator.manipulate(uri);
      const { size } = opts;
      if (size && Math.max(size.width, size.height) > MAX_EDGE) {
        context.resize(size.width >= size.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
      }
      const image = await context.renderAsync();
      try {
        let result = await image.saveAsync({ format, compress: alpha ? 1 : 0.9 });
        // Without a size up front, shrink after the fact if it came in huge.
        if (!size && Math.max(result.width, result.height) > MAX_EDGE) {
          const again = ImageManipulator.manipulate(result.uri);
          again.resize(result.width >= result.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
          const smaller = await again.renderAsync();
          result = await smaller.saveAsync({ format, compress: alpha ? 1 : 0.9 });
          smaller.release();
          again.release();
        }
        const id = uid();
        const name = `${id}.${alpha ? 'png' : 'jpg'}`;
        await new File(result.uri).move(new File(dir(), name));
        const item: BrandImage = { id, file: name, width: result.width, height: result.height, alpha };
        save([item, ...current()]);
        return item;
      } finally {
        image.release();
        context.release();
      }
    },
    remove(id: string) {
      const item = current().find((l) => l.id === id);
      if (item) {
        const f = new File(dir(), item.file);
        if (f.exists) f.delete();
      }
      save(current().filter((l) => l.id !== id));
    },
  };
}

const logos = imageCollection('logos', 6);
const assets = imageCollection('assets', 24);

export const BRAND_LOGO_LIMIT = logos.limit;
export const BRAND_ASSET_LIMIT = assets.limit;

export const useBrandLogos = logos.use;
export const brandLogos = logos.current;
export const brandLogoUri = logos.uri;
export const addBrandLogo = (uri: string, size?: { width: number; height: number }) => logos.add(uri, { size, alpha: true });
export const removeBrandLogo = logos.remove;

export const useBrandAssets = assets.use;
export const brandAssetUri = assets.uri;
export const addBrandAsset = assets.add;
export const removeBrandAsset = assets.remove;

// ---------------------------------------------------------------------------
// Fonts: the typefaces that represent the brand, listed first in the text
// editor. The first is the heading face, the second the body face.

export const BRAND_FONT_LIMIT = 4;

const fonts = persisted<FontId[]>(
  'brand-fonts.json',
  (raw) => (Array.isArray(raw) ? (raw.filter((f) => typeof f === 'string') as FontId[]).slice(0, BRAND_FONT_LIMIT) : []),
  [],
);

export const useBrandFonts = fonts.use;
export const brandFonts = fonts.get;

/** Adds or removes a brand font. Returns false if the kit is already full. */
export function toggleBrandFont(id: FontId) {
  const list = fonts.get();
  const next = list.includes(id) ? list.filter((f) => f !== id) : [...list, id];
  if (next.length > BRAND_FONT_LIMIT) return false;
  fonts.set(next);
  return true;
}

/** Makes a brand font the heading face (first in the list). */
export function promoteBrandFont(id: FontId) {
  if (!fonts.get().includes(id)) return;
  fonts.set([id, ...fonts.get().filter((f) => f !== id)]);
}

// ---------------------------------------------------------------------------
// Details

export type BrandProfile = { name: string; handle: string; website: string; tagline: string };

const EMPTY_PROFILE: BrandProfile = { name: '', handle: '', website: '', tagline: '' };

const profile = persisted<BrandProfile>(
  'brand-profile.json',
  (raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    return { name: str(r.name), handle: str(r.handle), website: str(r.website), tagline: str(r.tagline) };
  },
  EMPTY_PROFILE,
);

export const useBrandProfile = profile.use;
export const brandProfile = profile.get;

export function updateBrandProfile(patch: Partial<BrandProfile>) {
  const next = { ...profile.get(), ...patch };
  // Handles are stored without the @, keeping only what Instagram allows.
  next.handle = next.handle.trim().replace(/^@+/, '').replace(/[^A-Za-z0-9._]/g, '').slice(0, 30);
  next.website = next.website.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
  next.name = next.name.trim();
  next.tagline = next.tagline.trim();
  profile.set(next);
}

/** True once anything is in the kit; the recolour tools need colours or fonts. */
export function brandIsEmpty() {
  const p = profile.get();
  return !colors.get().length && !fonts.get().length && !logos.current().length && !p.handle && !p.name;
}
