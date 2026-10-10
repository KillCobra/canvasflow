import { frameInner } from './geometry';
import { applyLayout } from './layouts';
import { createDoc, detectPhotoFaces, importPhoto, saveProject } from './projects';
import { defaultAspect } from './settings';
import { type Template, instantiate, templatePreview } from './templates';
import { ASPECTS, type Crop, type Doc, type NormRect, type PhotoLayer, SLIDE_WIDTH, uid } from './types';

// "Start from photos": pick photos first, see the templates that suit them
// filled with those photos, then build the carousel with crops that keep
// faces centred and off the seams.

export type PickedPhoto = {
  /** Original asset (imported at full size when the carousel is built). */
  uri: string;
  width: number;
  height: number;
  /** Key in the preview image map, e.g. 'pick:0'. */
  key: string;
  faces?: NormRect[];
};

/** Empty photo slots, in fill order (left to right, then top to bottom). */
export function slotsOf(doc: Doc) {
  return doc.layers
    .filter((l): l is PhotoLayer => l.type === 'photo' && !l.src)
    .sort((a, b) => a.x - b.x || a.y - b.y);
}

const slotCount = (t: Template) => (t.doc ? t.doc.layers.filter((l) => l.type === 'photo').length : t.items.filter((i) => i.kind === 'slot').length);

/**
 * Templates that suit these photos, best first: as many slots as photos,
 * then a slot or two to spare, and slots whose shape matches each photo.
 */
export function suggestTemplates(templates: Template[], photos: PickedPhoto[], limit = 12): Template[] {
  const n = photos.length;
  return templates
    .filter((t) => t.doc?.grid == null)
    .map((t, index) => {
      const slots = slotCount(t);
      if (slots === 0) return null;
      let score = slots === n ? 0 : slots > n ? (slots - n) * 1.4 : (n - slots) * 2.5;
      // Shape match: compare each photo with the slot it would fill.
      const order = slotsOf(templatePreview(t));
      order.slice(0, n).forEach((slot, i) => {
        const inner = frameInner(slot);
        const slotPortrait = inner.height > inner.width * 1.08;
        const slotLandscape = inner.width > inner.height * 1.08;
        const p = photos[i];
        const photoPortrait = p.height > p.width * 1.08;
        const photoLandscape = p.width > p.height * 1.08;
        if ((slotPortrait && photoLandscape) || (slotLandscape && photoPortrait)) score += 0.6;
      });
      return { t, score, index };
    })
    .filter((x): x is { t: Template; score: number; index: number } => !!x)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, limit)
    .map((x) => x.t);
}

/**
 * Where to crop `photo` inside `slot` so the main face is centred, and moved
 * off any seam that would run through it.
 */
export function faceCrop(slot: PhotoLayer, aspect: number, faces?: NormRect[]): Crop | undefined {
  const face = faces?.[0];
  if (!face) return undefined;
  const inner = frameInner(slot);
  const w = inner.width;
  const h = inner.height;
  const cover = aspect > w / h ? { iw: h * aspect, ih: h } : { iw: w, ih: w / aspect };
  const ox = (cover.iw - w) / 2;
  const oy = (cover.ih - h) / 2;
  const fx = face.x + face.width / 2;
  const fy = face.y + face.height / 2;

  // Aim the face at the frame's centre, unless a seam runs through there:
  // then at the middle of the slide that holds most of the frame.
  let targetX = 0;
  const left = slot.x - w / 2;
  const right = slot.x + w / 2;
  const faceHalf = (face.width * cover.iw) / 2;
  for (let seam = Math.ceil(left / SLIDE_WIDTH) * SLIDE_WIDTH; seam < right; seam += SLIDE_WIDTH) {
    if (Math.abs(seam - slot.x) < faceHalf + 40) {
      const slide = Math.floor(slot.x / SLIDE_WIDTH);
      const centres = [slide - 1, slide, slide + 1].map((s) => s * SLIDE_WIDTH + SLIDE_WIDTH / 2).filter((c) => c > left && c < right);
      const best = centres.sort((a, b) => Math.abs(a - slot.x) - Math.abs(b - slot.x))[0];
      if (best != null) targetX = best - slot.x;
    }
  }
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  const x = ox > 0.5 ? clamp((targetX - (fx - 0.5) * cover.iw) / ox) : 0;
  // A little above centre reads better for faces.
  const y = oy > 0.5 ? clamp((-h * 0.06 - (fy - 0.5) * cover.ih) / oy) : 0;
  return { x, y, zoom: 1 };
}

/** A preview of `template` with these photos in its slots (preview image keys, not files). */
export function fillPreview(template: Template, photos: PickedPhoto[]): Doc {
  const base = templatePreview(template);
  const order = slotsOf(base);
  const fill = new Map(order.slice(0, photos.length).map((slot, i) => [slot.id, photos[i]]));
  return {
    ...base,
    layers: base.layers.map((l) => {
      const p = fill.get(l.id);
      if (!p || l.type !== 'photo') return l;
      const aspect = p.width / p.height;
      return { ...l, src: p.key, aspect, crop: faceCrop(l, aspect, p.faces) };
    }),
  };
}

/** Photos flowing seamlessly across slides, with no template. */
export function flowPreview(photos: PickedPhoto[]): Doc {
  const aspect = defaultAspect();
  const layers: PhotoLayer[] = photos.map((p) => ({
    id: uid(),
    type: 'photo',
    src: p.key,
    aspect: p.width / p.height,
    faces: p.faces,
    x: SLIDE_WIDTH / 2,
    y: 0,
    w: SLIDE_WIDTH,
    h: SLIDE_WIDTH,
    scale: 1,
    rotation: 0,
    opacity: 1,
    radius: 0,
    border: 0,
    borderColor: '#FFFFFF',
  }));
  const res = applyLayout('seamless', layers, aspect, photos.length);
  return { ...createDoc(aspect, res.slideCount), layers: res.photos };
}

/**
 * Builds the real carousel: imports the photos at full size, finds faces,
 * and drops them into the template (or the seamless flow). Returns the doc id.
 */
export async function buildFromPhotos(
  choice: { kind: 'template'; template: Template } | { kind: 'flow' },
  photos: PickedPhoto[],
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  const base = choice.kind === 'template' ? instantiate(choice.template) : createDoc(defaultAspect(), photos.length);
  saveProject(base, { create: true });
  const imported: { src: string; aspect: number; faces?: NormRect[] }[] = [];
  for (let i = 0; i < photos.length; i++) {
    onProgress?.(i, photos.length);
    const p = photos[i];
    const file = await importPhoto(base.id, p.uri, { width: p.width, height: p.height });
    const faces = p.faces ?? (await detectPhotoFaces(base.id, file.src));
    imported.push({ src: file.src, aspect: file.width / file.height, faces });
  }
  onProgress?.(photos.length, photos.length);

  let doc: Doc;
  if (choice.kind === 'template') {
    const order = slotsOf(base);
    const fill = new Map(order.slice(0, imported.length).map((slot, i) => [slot.id, imported[i]]));
    const layers = base.layers.map((l) => {
      const p = fill.get(l.id);
      if (!p || l.type !== 'photo') return l;
      return { ...l, src: p.src, aspect: p.aspect, faces: p.faces, slot: false, crop: faceCrop(l, p.aspect, p.faces) };
    });
    // Photos beyond the template's slots go on an extra slide each, at the end.
    const extra = imported.slice(order.length).map((p, i): PhotoLayer => {
      const slide = base.slideCount + i;
      return {
        id: uid(),
        type: 'photo',
        src: p.src,
        aspect: p.aspect,
        faces: p.faces,
        x: slide * SLIDE_WIDTH + SLIDE_WIDTH / 2,
        y: 0,
        w: SLIDE_WIDTH,
        h: SLIDE_WIDTH / p.aspect,
        scale: 1,
        rotation: 0,
        opacity: 1,
        radius: 0,
        border: 0,
        borderColor: '#FFFFFF',
        cell: true,
      };
    });
    const H = ASPECTS[base.aspect].height;
    doc = {
      ...base,
      slideCount: Math.min(20, base.slideCount + extra.length),
      layers: [...extra.map((l) => ({ ...l, y: H / 2, w: SLIDE_WIDTH, h: H })), ...layers],
    };
  } else {
    const layers: PhotoLayer[] = imported.map((p) => ({
      id: uid(),
      type: 'photo',
      src: p.src,
      aspect: p.aspect,
      faces: p.faces,
      x: SLIDE_WIDTH / 2,
      y: 0,
      w: SLIDE_WIDTH,
      h: SLIDE_WIDTH,
      scale: 1,
      rotation: 0,
      opacity: 1,
      radius: 0,
      border: 0,
      borderColor: '#FFFFFF',
    }));
    const res = applyLayout('seamless', layers, base.aspect, photos.length);
    doc = { ...base, slideCount: res.slideCount, layers: res.photos };
  }
  // Count as edited, so leaving straight away doesn't discard it.
  saveProject({ ...doc, updatedAt: Date.now() + 1 });
  return doc.id;
}
