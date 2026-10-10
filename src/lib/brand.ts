import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useSyncExternalStore } from 'react';

import { type FontId, uid } from './types';

// The brand kit. Colours saved from any colour row (documents/brand.json,
// shown first wherever colours are picked), logos, and brand fonts.

const MAX_COLORS = 24;

const file = () => new File(Paths.document, 'brand.json');
const listeners = new Set<() => void>();

/** #RGB / #RRGGBB(AA) in any case -> #RRGGBB, or null if it isn't a hex colour. */
export function normalizeHex(value: string) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1].slice(0, 6);
  return `#${h.toUpperCase()}`;
}

function read(): string[] {
  try {
    if (!file().exists) return [];
    const list = JSON.parse(file().textSync());
    if (!Array.isArray(list)) return [];
    return list.flatMap((c) => (typeof c === 'string' && normalizeHex(c) ? [normalizeHex(c)!] : [])).slice(0, MAX_COLORS);
  } catch {
    return [];
  }
}

let colors: string[] | null = null;

function current() {
  if (colors === null) colors = read();
  return colors;
}

function save(next: string[]) {
  colors = next;
  try {
    file().write(JSON.stringify(next));
  } catch {
    // Still updated in memory for this session.
  }
  listeners.forEach((l) => l());
}

export function useBrandColors(): string[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    current,
  );
}

export const isBrandColor = (color: string | null | undefined) => {
  const hex = color ? normalizeHex(color) : null;
  return !!hex && current().includes(hex);
};

/** Adds a colour to the front of the palette (no-op if it's already there). */
export function addBrandColor(color: string) {
  const hex = normalizeHex(color);
  if (!hex || current().includes(hex)) return;
  save([hex, ...current()].slice(0, MAX_COLORS));
}

export function removeBrandColor(color: string) {
  const hex = normalizeHex(color);
  save(current().filter((c) => c !== hex));
}

// ---------------------------------------------------------------------------
// Logos: transparent PNGs kept in documents/brand/logos, listed in index.json
// with their size so a layer can be made without decoding them first.

export type BrandLogo = { id: string; file: string; width: number; height: number };

const MAX_LOGO_EDGE = 1200;
const logoListeners = new Set<() => void>();

function logosDir() {
  const dir = new Directory(Paths.document, 'brand', 'logos');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}
const logoIndex = () => new File(logosDir(), 'index.json');

function readLogos(): BrandLogo[] {
  try {
    if (!logoIndex().exists) return [];
    const list = JSON.parse(logoIndex().textSync());
    if (!Array.isArray(list)) return [];
    return list.filter(
      (l): l is BrandLogo =>
        !!l && typeof l.id === 'string' && typeof l.file === 'string' && l.width > 0 && l.height > 0 && new File(logosDir(), l.file).exists,
    );
  } catch {
    return [];
  }
}

let logos: BrandLogo[] | null = null;
const currentLogos = () => (logos ??= readLogos());

function saveLogos(next: BrandLogo[]) {
  logos = next;
  try {
    logoIndex().write(JSON.stringify(next));
  } catch {
    // In memory for this session.
  }
  logoListeners.forEach((l) => l());
}

export function useBrandLogos(): BrandLogo[] {
  return useSyncExternalStore((l) => {
    logoListeners.add(l);
    return () => logoListeners.delete(l);
  }, currentLogos);
}

export const brandLogoUri = (logo: BrandLogo) => new File(logosDir(), logo.file).uri;

/** Copies an image into the kit as a PNG (keeping transparency), capped at 1200px. */
export async function addBrandLogo(uri: string, size?: { width: number; height: number }) {
  const context = ImageManipulator.manipulate(uri);
  if (size && Math.max(size.width, size.height) > MAX_LOGO_EDGE) {
    context.resize(size.width >= size.height ? { width: MAX_LOGO_EDGE } : { height: MAX_LOGO_EDGE });
  }
  const image = await context.renderAsync();
  try {
    let result = await image.saveAsync({ format: SaveFormat.PNG });
    // Without a size up front, shrink after the fact if it came in huge.
    if (!size && Math.max(result.width, result.height) > MAX_LOGO_EDGE) {
      const again = ImageManipulator.manipulate(result.uri);
      again.resize(result.width >= result.height ? { width: MAX_LOGO_EDGE } : { height: MAX_LOGO_EDGE });
      const smaller = await again.renderAsync();
      result = await smaller.saveAsync({ format: SaveFormat.PNG });
      smaller.release();
      again.release();
    }
    const id = uid();
    const name = `${id}.png`;
    await new File(result.uri).move(new File(logosDir(), name));
    const logo: BrandLogo = { id, file: name, width: result.width, height: result.height };
    saveLogos([logo, ...currentLogos()]);
    return logo;
  } finally {
    image.release();
    context.release();
  }
}

export function removeBrandLogo(id: string) {
  const logo = currentLogos().find((l) => l.id === id);
  if (logo) {
    const f = new File(logosDir(), logo.file);
    if (f.exists) f.delete();
  }
  saveLogos(currentLogos().filter((l) => l.id !== id));
}

// ---------------------------------------------------------------------------
// Fonts: the typefaces that represent the brand, listed first in the text editor.

const MAX_FONTS = 4;
const fontsFile = () => new File(Paths.document, 'brand-fonts.json');
const fontListeners = new Set<() => void>();

function readFonts(): FontId[] {
  try {
    if (!fontsFile().exists) return [];
    const list = JSON.parse(fontsFile().textSync());
    return Array.isArray(list) ? (list.filter((f) => typeof f === 'string') as FontId[]).slice(0, MAX_FONTS) : [];
  } catch {
    return [];
  }
}

let fonts: FontId[] | null = null;
const currentFonts = () => (fonts ??= readFonts());

export function useBrandFonts(): FontId[] {
  return useSyncExternalStore((l) => {
    fontListeners.add(l);
    return () => fontListeners.delete(l);
  }, currentFonts);
}

/** Adds or removes a brand font. Returns false if the kit is already full. */
export function toggleBrandFont(id: FontId) {
  const list = currentFonts();
  const next = list.includes(id) ? list.filter((f) => f !== id) : [...list, id];
  if (next.length > MAX_FONTS) return false;
  fonts = next;
  try {
    fontsFile().write(JSON.stringify(next));
  } catch {
    // In memory for this session.
  }
  fontListeners.forEach((l) => l());
  return true;
}

export const BRAND_FONT_LIMIT = MAX_FONTS;
