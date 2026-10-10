import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

// Favourite templates by id, newest first, in documents/favorites.json.

const file = () => new File(Paths.document, 'favorites.json');
const listeners = new Set<() => void>();
let ids: string[] | null = null;

/** Read once, then served from memory (useSyncExternalStore needs a stable snapshot). */
function load(): string[] {
  if (ids) return ids;
  try {
    const parsed: unknown = file().exists ? JSON.parse(file().textSync()) : [];
    ids = Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    ids = [];
  }
  return ids;
}

export function toggleFavorite(id: string) {
  const list = load();
  ids = list.includes(id) ? list.filter((v) => v !== id) : [id, ...list];
  try {
    file().write(JSON.stringify(ids));
  } catch {
    // Keep the in-memory list; it'll be written with the next change.
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Favourite template ids, most recently added first. */
export function useFavorites(): string[] {
  return useSyncExternalStore(subscribe, load);
}
