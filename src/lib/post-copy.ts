import * as Device from 'expo-device';

import { brandProfile } from './brand';
import { bounds } from './geometry';
import { previewUri } from './projects';
import { ASPECTS, type Doc, type PhotoLayer, SLIDE_WIDTH, type TextLayer, tileCount } from './types';

import { aiAvailability, generatePostCopy } from '../../modules/seam-ai';
import { classifyImage, isVisionAvailable } from '../../modules/seam-vision';

// Caption, hashtags and alt text for a post. On iOS 26+ with Apple
// Intelligence they come from Apple's on-device model; otherwise from the
// carousel's own text and what Vision sees in the photos. Nothing is sent
// anywhere either way.

export type PostCopyResult = {
  caption: string;
  hashtags: string[];
  /** One sentence per slide (or per post, for a grid puzzle). */
  altText: string[];
  source: 'ai' | 'basic';
  /** Shown above the caption when the on-device model was tried and failed. */
  note?: string;
};

type Slide = { texts: string[]; labels: string[] };

const unique = <T>(list: T[]) => [...new Set(list)];

/** What's on each slide: its words (biggest first) and what its main photo shows. */
async function describe(doc: Doc): Promise<Slide[]> {
  const grid = doc.grid != null;
  const count = grid ? tileCount(doc) : doc.slideCount;
  const slides: Slide[] = Array.from({ length: count }, () => ({ texts: [], labels: [] }));
  const slideOf = (x: number, y: number) => {
    if (!grid) return Math.max(0, Math.min(count - 1, Math.floor(x / SLIDE_WIDTH)));
    const rows = doc.grid ?? 1;
    const tileH = ASPECTS[doc.aspect].height;
    const col = Math.max(0, Math.min(doc.slideCount - 1, Math.floor(x / SLIDE_WIDTH)));
    const row = Math.max(0, Math.min(rows - 1, Math.floor(y / tileH)));
    return row * doc.slideCount + col;
  };

  const texts = doc.layers
    .filter((l): l is TextLayer => l.type === 'text' && !l.hidden && !l.sticker && !!l.text.trim())
    .sort((a, b) => b.size * b.scale - a.size * a.scale);
  for (const t of texts) slides[slideOf(t.x, t.y)].texts.push(t.text.replace(/\s+/g, ' ').trim());

  // The Simulator's classifier returns the same few labels for every photo, so only label on a device.
  if (isVisionAvailable() && Device.isDevice) {
    // The biggest photo on each slide stands for it.
    const photos = doc.layers
      .filter((l): l is PhotoLayer => l.type === 'photo' && !!l.src && !l.hidden && !l.video)
      .sort((a, b) => b.w * b.h * b.scale - a.w * a.h * a.scale);
    const done = new Set<number>();
    for (const p of photos) {
      const s = slideOf(p.x, p.y);
      if (done.has(s)) continue;
      done.add(s);
      try {
        slides[s].labels = await classifyImage(previewUri(doc.id, p.src), 5);
      } catch {
        // Leave it unlabelled.
      }
    }
    // A photo spanning several slides labels the ones it covers that have none.
    for (const p of photos) {
      if (!grid) {
        const b = bounds(p);
        const from = Math.max(0, Math.floor(b.left / SLIDE_WIDTH));
        const to = Math.min(count - 1, Math.floor((b.right - 1) / SLIDE_WIDTH));
        const own = slides[slideOf(p.x, p.y)].labels;
        for (let i = from; i <= to; i++) if (!slides[i].labels.length) slides[i].labels = own;
      }
    }
  }
  return slides;
}

function contextFor(doc: Doc, slides: Slide[]) {
  const profile = brandProfile();
  const lines: string[] = [];
  if (profile.name) lines.push(`Posted by: ${profile.name}${profile.handle ? ` (@${profile.handle})` : ''}`);
  if (profile.tagline) lines.push(`About them: ${profile.tagline}`);
  if (doc.name && doc.name !== 'Untitled') lines.push(`Project title: ${doc.name}`);
  lines.push(doc.grid != null ? 'Format: a grid puzzle (one picture split across several posts)' : 'Format: a swipeable carousel');
  slides.forEach((s, i) => {
    const parts = [];
    if (s.texts.length) parts.push(`text "${s.texts.join(' / ')}"`);
    if (s.labels.length) parts.push(`photo of ${s.labels.join(', ')}`);
    lines.push(`Slide ${i + 1}: ${parts.join('; ') || 'design only'}`);
  });
  return lines.join('\n');
}

const toTag = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** A caption and tags put together from the carousel's own words and photo labels. */
function basicCopy(doc: Doc, slides: Slide[]): PostCopyResult {
  const profile = brandProfile();
  const headline = slides.find((s) => s.texts.length)?.texts[0];
  const labels = unique(slides.flatMap((s) => s.labels));
  const title = doc.name && doc.name !== 'Untitled' ? doc.name : undefined;
  const lead = headline ?? title ?? (labels.length ? `A little ${labels[0]} moment` : 'New post');
  const swipe = doc.grid != null ? '' : ` Swipe through all ${slides.length} →`;
  const caption = `${lead.replace(/[.!?]*$/, '.')}${profile.tagline ? ` ${profile.tagline}` : ''}${swipe}`.trim();
  const hashtags = unique(
    [
      ...labels.map(toTag),
      ...(title ? title.split(/\s+/).map(toTag) : []),
      profile.name ? toTag(profile.name) : '',
      doc.grid != null ? 'instagrid' : 'carousel',
      'photodump',
    ].filter((t) => t.length > 2),
  ).slice(0, 12);
  const altText = slides.map((s, i) => {
    const what = s.labels.length ? `A photo showing ${s.labels.slice(0, 3).join(', ')}` : 'A designed slide';
    const words = s.texts.length ? `, with the text “${s.texts.join(' ')}”` : '';
    return `${doc.grid != null ? 'Post' : 'Slide'} ${i + 1}: ${what}${words}.`;
  });
  return { caption, hashtags, altText, source: 'basic' };
}

export async function writePostCopy(doc: Doc): Promise<PostCopyResult> {
  const slides = await describe(doc);
  if (aiAvailability() === 'available') {
    try {
      const copy = await generatePostCopy(contextFor(doc, slides), slides.length);
      if (copy.caption.trim()) {
        return {
          caption: copy.caption.trim(),
          hashtags: unique(copy.hashtags.map(toTag).filter(Boolean)).slice(0, 15),
          altText: slides.map((_, i) => copy.altText[i]?.trim() || basicCopy(doc, slides).altText[i]),
          source: 'ai',
        };
      }
    } catch {
      // The model can be listed as available yet not loaded (still downloading,
      // or not installed in the Simulator): use the basic copy, and say so.
      return { ...basicCopy(doc, slides), note: 'Apple Intelligence couldn’t write this one, so it’s written from your slides. Try Rewrite in a moment.' };
    }
  }
  return basicCopy(doc, slides);
}

/** Why the on-device model isn't writing the copy, for a one-line note. */
export function aiNote() {
  switch (aiAvailability()) {
    case 'available':
      return null;
    case 'notEnabled':
      return 'Turn on Apple Intelligence for richer captions written on your iPhone.';
    case 'notReady':
      return 'Apple Intelligence is still getting ready; richer captions will follow.';
    case 'deviceNotEligible':
      return 'Written from your slides. Richer captions need an iPhone with Apple Intelligence.';
    default:
      return 'Written from your slides. Richer captions need iOS 26 with Apple Intelligence.';
  }
}
