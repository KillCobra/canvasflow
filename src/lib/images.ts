import { type SkImage, Skia } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';

import { assetUri, isVideoSrc, previewUri } from './projects';
import type { Layer } from './types';

// Decoded preview-size photos shared by the editor, preview and thumbnail
// renderers, keyed by project id + file name. Full-size photos are only
// decoded during export and disposed straight after (see loadFullImage).

const MAX_CACHED = 30;
const cache = new Map<string, SkImage>();
const pending = new Map<string, Promise<SkImage | null>>();

const key = (docId: string, src: string) => `${docId}/${src}`;

async function decode(uri: string) {
  const data = await Skia.Data.fromURI(uri);
  return Skia.Image.MakeImageFromEncoded(data);
}

function remember(k: string, image: SkImage) {
  cache.delete(k);
  cache.set(k, image);
  // Map iteration order is insertion order, so the first key is the least recently used.
  while (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next().value as string;
    cache.get(oldest)?.dispose();
    cache.delete(oldest);
  }
}

export function loadSkImage(docId: string, src: string): Promise<SkImage | null> {
  const k = key(docId, src);
  const hit = cache.get(k);
  if (hit) return Promise.resolve(hit);
  let job = pending.get(k);
  if (!job) {
    job = decode(previewUri(docId, src))
      .then((image) => {
        if (image) remember(k, image);
        return image;
      })
      .catch(() => null)
      .finally(() => pending.delete(k));
    pending.set(k, job);
  }
  return job;
}

/** Full-resolution decode for export (a video's poster frame). The caller owns and must dispose it. */
export function loadFullImage(docId: string, src: string): Promise<SkImage | null> {
  return decode(isVideoSrc(src) ? previewUri(docId, src) : assetUri(docId, src)).catch(() => null);
}

/** Frees every cached photo of a project (editor closed or project deleted). */
export function releaseImages(docId: string) {
  for (const [k, image] of cache) {
    if (k.startsWith(`${docId}/`)) {
      image.dispose();
      cache.delete(k);
    }
  }
}

export type ImageMap = Record<string, SkImage | undefined>;

// `_version` is unused but makes the call's inputs change when the cache
// does, so the React Compiler doesn't reuse a stale result.
export function imageMapFor(docId: string, layers: Layer[], _version = 0): ImageMap {
  const out: ImageMap = {};
  for (const layer of layers) {
    if (layer.type === 'photo' && layer.src) out[layer.src] = cache.get(key(docId, layer.src));
  }
  return out;
}

export async function preloadImages(docId: string, layers: Layer[]) {
  await Promise.all(
    layers.flatMap((l) => (l.type === 'photo' && l.src ? [loadSkImage(docId, l.src)] : [])),
  );
  return imageMapFor(docId, layers);
}

function missingSources(docId: string, layers: Layer[], _version: number) {
  return layers
    .flatMap((l) => (l.type === 'photo' && l.src && !cache.has(key(docId, l.src)) ? [l.src] : []))
    .join('|');
}

/** Returns decoded images for every photo layer, re-rendering as they arrive. */
export function useSkImages(docId: string, layers: Layer[]): ImageMap {
  const [version, setVersion] = useState(0);
  const missingKey = missingSources(docId, layers, version);

  useEffect(() => {
    if (!missingKey) return;
    let alive = true;
    Promise.all(missingKey.split('|').map((src) => loadSkImage(docId, src))).then(() => {
      if (alive) setVersion((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [docId, missingKey]);

  return imageMapFor(docId, layers, version);
}
