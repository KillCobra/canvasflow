import { releaseImages } from './images';
import { renderTileBytes, updateThumbnail } from './export';
import { createDoc, loadProject, saveProject, writeProjectImage } from './projects';
import { ASPECTS, type Doc, GRID_ASPECT, type PhotoLayer, SLIDE_WIDTH, tileCount, uid } from './types';

// Grid cover carousels: a tile of a grid puzzle that is also the first slide
// of a carousel. Posting that carousel in the tile's place keeps the puzzle
// whole on the profile, and tapping the tile opens a full carousel.
//
// The tile is baked into the carousel as a locked, full-bleed photo on slide 1
// and re-rendered whenever the puzzle is closed in the editor.

const coverName = (tile: number) => `cover-${tile}.jpg`;

/** Makes tile `tile` of `grid` the cover of a new carousel. Returns the carousel's id. */
export async function createCoverCarousel(grid: Doc, tile: number): Promise<string> {
  const H = ASPECTS[GRID_ASPECT].height;
  const doc = createDoc(GRID_ASPECT, 3);
  saveProject(doc, { create: true });
  const src = writeProjectImage(doc.id, coverName(tile), await renderTileBytes(grid, tile));
  const cover: PhotoLayer = {
    id: uid(),
    type: 'photo',
    src,
    aspect: SLIDE_WIDTH / H,
    x: SLIDE_WIDTH / 2,
    y: H / 2,
    w: SLIDE_WIDTH,
    h: H,
    scale: 1,
    rotation: 0,
    opacity: 1,
    radius: 0,
    border: 0,
    borderColor: '#FFFFFF',
    locked: true,
  };
  const now = Date.now();
  const carousel: Doc = {
    ...doc,
    // Named by posting order (post 1 goes up first), matching the export and the planner.
    name: `${grid.name} · post ${tileCount(grid) - tile}`,
    background: grid.background,
    layers: [cover],
    coverOf: { grid: grid.id, tile, layer: cover.id },
    updatedAt: now + 1,
  };
  saveProject(carousel);
  await updateThumbnail(carousel).catch(() => {});
  return carousel.id;
}

/** Re-renders every cover tile of `grid` into its carousel (call after the puzzle changes). */
export async function refreshCovers(grid: Doc) {
  for (const [key, id] of Object.entries(grid.covers ?? {})) {
    const tile = Number(key);
    const carousel = await loadProject(id);
    if (!carousel?.coverOf || carousel.coverOf.grid !== grid.id) continue;
    const layer = carousel.layers.find((l) => l.id === carousel.coverOf!.layer);
    if (layer?.type !== 'photo') continue;
    writeProjectImage(id, layer.src, await renderTileBytes(grid, tile));
    // Drop the cached decode so the new tile shows next time it opens.
    releaseImages(id);
    const updated = { ...carousel, updatedAt: Date.now() };
    saveProject(updated);
    await updateThumbnail(updated).catch(() => {});
  }
}

/** Unlinks a cover: the carousel keeps its first slide as a normal photo. */
export async function unlinkCover(grid: Doc, tile: number): Promise<Doc> {
  const id = grid.covers?.[tile];
  if (id) {
    const carousel = await loadProject(id);
    if (carousel?.coverOf) {
      const layers = carousel.layers.map((l) => (l.id === carousel.coverOf!.layer ? { ...l, locked: false } : l));
      saveProject({ ...carousel, coverOf: undefined, layers, updatedAt: Date.now() });
    }
  }
  const covers = { ...(grid.covers ?? {}) };
  delete covers[tile];
  return { ...grid, covers };
}
