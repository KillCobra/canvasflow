import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useSyncExternalStore } from 'react';

import { uid } from './types';

// The grid planner's plan: carousels and grid puzzles queued for the profile
// (newest first, as Instagram shows them), plus photos of what's already
// posted so the new posts can be judged against the feed. Kept in
// documents/grid-plan.json; posted photos are small copies in documents/grid.

export type PostedPhoto = { id: string; file: string };
export type GridPlan = { items: string[]; posted: PostedPhoto[] };

const EMPTY: GridPlan = { items: [], posted: [] };
const MAX_POSTED = 30;

const planFile = () => new File(Paths.document, 'grid-plan.json');
function postedDir() {
  const dir = new Directory(Paths.document, 'grid');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

const listeners = new Set<() => void>();
let plan: GridPlan | null = null;

function read(): GridPlan {
  try {
    if (!planFile().exists) return EMPTY;
    const raw = JSON.parse(planFile().textSync()) as Partial<GridPlan>;
    const items = Array.isArray(raw.items) ? raw.items.filter((i): i is string => typeof i === 'string') : [];
    const posted = Array.isArray(raw.posted)
      ? raw.posted.filter((p): p is PostedPhoto => typeof p?.id === 'string' && typeof p?.file === 'string' && new File(postedDir(), p.file).exists)
      : [];
    return { items: [...new Set(items)], posted };
  } catch {
    return EMPTY;
  }
}

const current = () => (plan ??= read());

function save(next: GridPlan) {
  plan = next;
  try {
    planFile().write(JSON.stringify(next));
  } catch {
    // In memory for this session.
  }
  listeners.forEach((l) => l());
}

export function useGridPlan(): GridPlan {
  return useSyncExternalStore((l) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, current);
}

export const postedUri = (p: PostedPhoto) => new File(postedDir(), p.file).uri;

/** Queues a project as the newest post (top of the grid). */
export function addToPlan(projectId: string) {
  const p = current();
  save({ ...p, items: [projectId, ...p.items.filter((i) => i !== projectId)] });
}

export function removeFromPlan(projectId: string) {
  const p = current();
  save({ ...p, items: p.items.filter((i) => i !== projectId) });
}

export const isPlanned = (projectId: string) => current().items.includes(projectId);

/** Moves a planned project up (-1, newer) or down (+1, older) the grid. */
export function movePlanned(projectId: string, delta: number) {
  const p = current();
  const from = p.items.indexOf(projectId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= p.items.length) return;
  const items = [...p.items];
  items.splice(to, 0, items.splice(from, 1)[0]);
  save({ ...p, items });
}

/** Drops projects that no longer exist (deleted elsewhere). */
export function prunePlan(existing: Set<string>) {
  const p = current();
  const items = p.items.filter((i) => existing.has(i));
  if (items.length !== p.items.length) save({ ...p, items });
}

/**
 * Adds photos of posts already on the profile, newest first (pick them in the
 * order they appear on the profile, top-left first).
 */
export async function addPosted(uris: string[]) {
  const room = MAX_POSTED - current().posted.length;
  const added: PostedPhoto[] = [];
  for (const uri of uris.slice(0, Math.max(0, room))) {
    const context = ImageManipulator.manipulate(uri);
    context.resize({ width: 540 });
    const image = await context.renderAsync();
    try {
      const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });
      const id = uid();
      const file = `${id}.jpg`;
      await new File(result.uri).move(new File(postedDir(), file));
      added.push({ id, file });
    } finally {
      image.release();
      context.release();
    }
  }
  const p = current();
  save({ ...p, posted: [...p.posted, ...added] });
  return added.length;
}

export function removePosted(id: string) {
  const p = current();
  const photo = p.posted.find((x) => x.id === id);
  if (photo) {
    const f = new File(postedDir(), photo.file);
    if (f.exists) f.delete();
  }
  save({ ...p, posted: p.posted.filter((x) => x.id !== id) });
}

export function clearPosted() {
  for (const photo of current().posted) {
    const f = new File(postedDir(), photo.file);
    if (f.exists) f.delete();
  }
  save({ ...current(), posted: [] });
}

export const POSTED_LIMIT = MAX_POSTED;
