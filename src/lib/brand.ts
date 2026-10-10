import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

// The user's brand palette: colours saved from any colour row, kept in
// documents/brand.json and shown first wherever colours are picked.

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
