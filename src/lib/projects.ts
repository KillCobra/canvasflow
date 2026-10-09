import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { getThumbnailAsync } from 'expo-video-thumbnails';

import { type NormRect, detectFaces, isVisionAvailable, liftSubject } from '../../modules/seam-vision';

import { type AspectId, type Doc, uid } from './types';

// Each project lives in documents/projects/<id>/ with doc.json, its imported
// photos (full size for export plus a small preview copy for editing) and a
// thumb.jpg. Photos are referenced by file name so documents survive the app
// container path changing between installs.

/** Large enough that a panorama stretched across several slides stays sharp. */
const MAX_PHOTO_EDGE = 4096;
/** What the editor and preview draw; export always uses the full file. */
const PREVIEW_EDGE = 1280;

const PREVIEW_PREFIX = 'p_';
const RESERVED = new Set(['doc.json', 'doc.json.tmp', 'thumb.jpg']);

function root() {
  const dir = new Directory(Paths.document, 'projects');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** The project folder; only created when `create` is set, so stray writes can't resurrect a deleted project. */
function projectDir(id: string, create = false) {
  const dir = new Directory(root(), id);
  if (create && !dir.exists) dir.create({ intermediates: true });
  return dir;
}

const VIDEO_EXT = /\.(mp4|mov|m4v)$/i;

export const isVideoSrc = (src: string) => VIDEO_EXT.test(src);

/** Small still used for editing; for a video it's the poster frame. */
export function previewName(src: string) {
  return PREVIEW_PREFIX + src.replace(VIDEO_EXT, '.jpg');
}

export function assetUri(docId: string, src: string) {
  return new File(projectDir(docId), src).uri;
}

/** Preview copy if it exists (older projects may not have one), else the full photo. */
export function previewUri(docId: string, src: string) {
  const preview = new File(projectDir(docId), previewName(src));
  return preview.exists || isVideoSrc(src) ? preview.uri : assetUri(docId, src);
}

export function thumbUri(docId: string) {
  const file = new File(projectDir(docId), 'thumb.jpg');
  return file.exists ? file.uri : null;
}

export function createDoc(aspect: AspectId, slideCount = 3): Doc {
  const now = Date.now();
  return {
    id: uid(),
    name: 'Untitled',
    aspect,
    slideCount,
    background: { kind: 'solid', color: '#F4EFE6' },
    layers: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Writes to a temp file and swaps it in, so a crash mid-write can't corrupt the project. */
export function saveProject(doc: Doc, { create = false } = {}) {
  const dir = projectDir(doc.id, create);
  if (!dir.exists) return;
  const tmp = new File(dir, 'doc.json.tmp');
  tmp.write(JSON.stringify(doc));
  tmp.moveSync(new File(dir, 'doc.json'), { overwrite: true });
}

export async function loadProject(id: string): Promise<Doc | null> {
  try {
    const file = new File(root(), id, 'doc.json');
    if (!file.exists) return null;
    return JSON.parse(await file.text()) as Doc;
  } catch {
    return null;
  }
}

export type ProjectSummary = { doc: Doc; thumb: string | null };

export async function listProjects(): Promise<ProjectSummary[]> {
  const out: ProjectSummary[] = [];
  for (const entry of root().list()) {
    if (!(entry instanceof Directory)) continue;
    const doc = await loadProject(entry.name);
    if (doc) out.push({ doc, thumb: thumbUri(doc.id) });
  }
  return out.sort((a, b) => b.doc.updatedAt - a.doc.updatedAt);
}

export function deleteProject(id: string) {
  const dir = projectDir(id);
  if (dir.exists) dir.delete();
}

export async function duplicateProject(id: string) {
  const doc = await loadProject(id);
  if (!doc) return;
  const copy: Doc = { ...doc, id: uid(), name: `${doc.name} copy`, updatedAt: Date.now() };
  const from = projectDir(id);
  const to = projectDir(copy.id, true);
  for (const entry of from.list()) {
    if (entry instanceof File && entry.name !== 'doc.json' && entry.name !== 'doc.json.tmp') {
      await entry.copy(new File(to, entry.name));
    }
  }
  saveProject(copy);
}

/** Removes photos no layer references any more (deleted layers, discarded undo states). */
export function removeUnusedPhotos(doc: Doc) {
  const dir = projectDir(doc.id);
  if (!dir.exists) return;
  const used = new Set<string>();
  for (const l of doc.layers) {
    if (l.type === 'photo') used.add(l.src).add(previewName(l.src));
  }
  for (const entry of dir.list()) {
    if (entry instanceof File && !RESERVED.has(entry.name) && !used.has(entry.name)) {
      entry.delete();
    }
  }
}

async function writeResized(
  uri: string,
  longest: number,
  size: { width: number; height: number },
  out: File,
  compress: number,
  format = SaveFormat.JPEG,
) {
  const context = ImageManipulator.manipulate(uri);
  if (Math.max(size.width, size.height) > longest) {
    context.resize(size.width >= size.height ? { width: longest } : { height: longest });
  }
  const image = await context.renderAsync();
  try {
    const result = await image.saveAsync({ compress, format });
    await new File(result.uri).move(out);
    return result;
  } finally {
    image.release();
    context.release();
  }
}

/** Copies a picked photo into the project folder: a full-size file plus a small preview. */
export async function importPhoto(
  docId: string,
  uri: string,
  size: { width: number; height: number },
) {
  const dir = projectDir(docId, true);
  const name = `${uid()}.jpg`;
  const full = await writeResized(uri, MAX_PHOTO_EDGE, size, new File(dir, name), 0.92);
  await writeResized(uri, PREVIEW_EDGE, size, new File(dir, previewName(name)), 0.85);
  return { src: name, width: full.width, height: full.height };
}

/**
 * Faces in a photo, for the seam warnings. Undefined when this build can't
 * look (Expo Go), so the photo is checked again in a build that can.
 */
export async function detectPhotoFaces(docId: string, src: string): Promise<NormRect[] | undefined> {
  if (!isVisionAvailable() || isVideoSrc(src)) return undefined;
  try {
    return await detectFaces(previewUri(docId, src));
  } catch {
    return undefined;
  }
}

/**
 * Lifts the subject out of a project photo into a new transparent PNG (plus
 * its preview). `rect` is where the cutout sits in the source, normalized.
 * Null when Vision finds no subject.
 */
export async function importCutout(docId: string, src: string) {
  const dir = projectDir(docId, true);
  const name = `${uid()}.png`;
  const out = new File(dir, name);
  const lifted = await liftSubject(assetUri(docId, src), out.uri, 2048);
  if (!lifted) return null;
  await writeResized(out.uri, PREVIEW_EDGE, lifted, new File(dir, previewName(name)), 1, SaveFormat.PNG);
  return { src: name, width: lifted.width, height: lifted.height, rect: lifted.rect };
}

/**
 * Copies a picked video into the project folder and saves a poster frame
 * (the editor draws the poster wherever the video isn't playing).
 */
export async function importVideo(docId: string, uri: string, durationMs: number) {
  const dir = projectDir(docId, true);
  const ext = (uri.match(VIDEO_EXT)?.[1] ?? 'mp4').toLowerCase();
  const name = `${uid()}.${ext}`;
  await new File(uri).copy(new File(dir, name));
  const poster = await getThumbnailAsync(uri, { time: 0, quality: 0.85 });
  await writeResized(poster.uri, PREVIEW_EDGE, poster, new File(dir, previewName(name)), 0.85);
  return { src: name, width: poster.width, height: poster.height, duration: durationMs / 1000 };
}

export function writeThumb(docId: string, bytes: Uint8Array) {
  const dir = projectDir(docId);
  if (!dir.exists) return;
  const file = new File(dir, 'thumb.jpg');
  if (file.exists) file.delete();
  file.write(bytes);
}

export async function renameProject(id: string, name: string) {
  const doc = await loadProject(id);
  if (doc) saveProject({ ...doc, name, updatedAt: Date.now() });
}
