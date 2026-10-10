import { Directory, Paths } from 'expo-file-system';
import { Image } from 'expo-image';

import { deleteProject, listProjects, removeUnusedPhotos } from './projects';

// What Seam keeps on the phone, for Settings → Storage.

const sizeOf = (dir: Directory) => {
  try {
    return dir.exists ? (dir.size ?? 0) : 0;
  } catch {
    return 0;
  }
};

export const cacheSize = () => sizeOf(new Directory(Paths.cache));
export const projectsSize = () => sizeOf(new Directory(Paths.document, 'projects'));
export const brandSize = () => sizeOf(new Directory(Paths.document, 'brand')) + sizeOf(new Directory(Paths.document, 'fonts'));

/**
 * Empties the cache folder (export scratch files, video posters, picker
 * copies, image caches). Projects and the brand kit live in documents and are
 * not touched. Returns the bytes freed.
 */
export async function clearCache() {
  const before = cacheSize();
  for (const entry of new Directory(Paths.cache).list()) {
    try {
      entry.delete();
    } catch {
      // Something still has it open; it'll go next time.
    }
  }
  await Promise.all([Image.clearDiskCache().catch(() => false), Image.clearMemoryCache().catch(() => false)]);
  return Math.max(0, before - cacheSize());
}

/** Deletes media no layer uses any more (left behind by deleted layers and undo). */
export async function removeUnusedMedia() {
  const before = projectsSize();
  for (const { doc } of await listProjects()) removeUnusedPhotos(doc);
  return Math.max(0, before - projectsSize());
}

export async function deleteAllProjects() {
  const projects = await listProjects();
  projects.forEach((p) => deleteProject(p.doc.id));
  return projects.length;
}

/** "12.4 MB" */
export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}
