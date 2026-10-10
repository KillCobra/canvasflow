import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import type { Template } from './template-kit';
import { type Doc, type Layer, uid } from './types';

// Templates the user saved from their own carousels. The design is kept as a
// doc with every photo turned back into an empty slot (frames, borders and
// filters stay), in documents/my-templates.json.

type Saved = { id: string; name: string; createdAt: number; doc: Doc };

const file = () => new File(Paths.document, 'my-templates.json');
const listeners = new Set<() => void>();
let saved: Saved[] | null = null;
let asTemplates: Template[] | null = null;

function read(): Saved[] {
  try {
    if (!file().exists) return [];
    const list = JSON.parse(file().textSync());
    return Array.isArray(list) ? list.filter((s): s is Saved => typeof s?.id === 'string' && !!s?.doc?.layers) : [];
  } catch {
    return [];
  }
}

const current = () => (saved ??= read());

function save(next: Saved[]) {
  saved = next;
  asTemplates = null;
  try {
    file().write(JSON.stringify(next));
  } catch {
    // In memory for this session.
  }
  listeners.forEach((l) => l());
}

/** Photos and videos become empty slots; everything else is kept as designed. */
function strip(layer: Layer): Layer {
  if (layer.type !== 'photo') return layer;
  const { video: _video, faces: _faces, crop: _crop, cutout: _cutout, ...rest } = layer;
  return { ...rest, src: '', slot: true, cell: true, aspect: layer.w / layer.h };
}

export const MY_TEMPLATE_CATEGORY = 'Mine';

const toTemplate = (s: Saved): Template => ({
  id: `mine:${s.id}`,
  name: s.name,
  category: MY_TEMPLATE_CATEGORY,
  aspect: s.doc.aspect,
  slideCount: s.doc.slideCount,
  background: s.doc.background,
  items: [],
  doc: s.doc,
  tags: ['mine', 'my templates'],
});

export function myTemplates(): Template[] {
  return (asTemplates ??= current().map(toTemplate));
}

export function useMyTemplates(): Template[] {
  return useSyncExternalStore((l) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, myTemplates);
}

/** Saves the carousel's design as a template; returns its template id. */
export function saveAsTemplate(doc: Doc, name: string) {
  const id = uid();
  const design: Doc = {
    ...doc,
    id,
    name,
    folder: undefined,
    layers: doc.layers.filter((l) => !l.hidden).map(strip),
  };
  save([{ id, name: name.trim() || doc.name, createdAt: Date.now(), doc: design }, ...current()]);
  return `mine:${id}`;
}

export const isMyTemplate = (t: Pick<Template, 'id'>) => t.id.startsWith('mine:');

export function deleteMyTemplate(templateId: string) {
  const id = templateId.replace(/^mine:/, '');
  save(current().filter((s) => s.id !== id));
}

export function renameMyTemplate(templateId: string, name: string) {
  const id = templateId.replace(/^mine:/, '');
  save(current().map((s) => (s.id === id ? { ...s, name: name.trim() || s.name, doc: { ...s.doc, name } } : s)));
}
