import type { BrandProfile } from './brand';
import { applyBrand, variantCount } from './brand-apply';
import { fontInfo } from './fonts';
import type { Doc, FontId } from './types';

// "Shuffle style": the same layout in other colourways and type pairings.
// Every variant goes through the brand recolouring engine, so text stays
// readable and the page keeps a sensible structure; the brand kit's own looks
// come first when it has colours.

const PALETTES: { name: string; colors: string[] }[] = [
  { name: 'Sand', colors: ['#F2EFE9', '#16120B', '#C8553D', '#D9C29C'] },
  { name: 'Midnight', colors: ['#0F1115', '#F4F1EA', '#E2B714', '#5C7AEA'] },
  { name: 'Sage', colors: ['#EEF1EA', '#1F2A24', '#81B29A', '#E07A5F'] },
  { name: 'Blush', colors: ['#F9E7E1', '#2B1E1E', '#E5989B', '#6D597A'] },
  { name: 'Harbour', colors: ['#E8F1F5', '#0B2236', '#3D5A80', '#EE6C4D'] },
  { name: 'Mustard', colors: ['#F7F1E1', '#1F1A10', '#E9B44C', '#1B998B'] },
  { name: 'Forest', colors: ['#14261C', '#F1EBDD', '#D9A441', '#8FB996'] },
  { name: 'Grape', colors: ['#1E1530', '#F5EEFF', '#B388EB', '#FFD166'] },
  { name: 'Terracotta', colors: ['#F3E3D3', '#3A2418', '#C8553D', '#2F6690'] },
  { name: 'Lime', colors: ['#F4F7EC', '#17200F', '#9BC53D', '#FF6F59'] },
  { name: 'Cherry', colors: ['#FFF5F2', '#2A0B0B', '#D7263D', '#1B998B'] },
  { name: 'Ink', colors: ['#FFFFFF', '#111111', '#2D5BFF', '#FF4F79'] },
];

/** Heading and body faces that sit well together. */
const FONT_PAIRS: [FontId, FontId][] = [
  ['editorial', 'sans'],
  ['serif', 'rounded'],
  ['condensed', 'mono'],
  ['italic', 'sans'],
  ['script', 'rounded'],
  ['condensed', 'serif'],
  ['editorial', 'mono'],
  ['serif', 'sans'],
];

export type StyleVariant = { key: string; label: string; doc: Doc };

type Kit = { colors: string[]; fonts: FontId[]; profile: BrandProfile };

/** What a variant looks like at a glance: its page colour and the colours and fonts of its text. */
function signature(doc: Doc) {
  const bg = doc.background.kind === 'solid' ? doc.background.color : doc.background.colors[0];
  const marks = doc.layers
    .map((l) => (l.type === 'text' ? `${l.color}${l.font}${l.fill ?? ''}` : l.type === 'shape' ? l.color : ''))
    .filter(Boolean);
  return `${bg}|${[...new Set(marks)].sort().join(',')}`;
}

/** `count` restyled versions of `doc`; a different `seed` gives a different set. */
export function shuffleVariants(doc: Doc, kit: Kit, seed: number, count = 6): StyleVariant[] {
  const out: StyleVariant[] = [];
  const seen = new Set<string>([signature(doc)]);
  const push = (key: string, label: string, next: Doc) => {
    const sig = signature(next);
    if (seen.has(sig)) return;
    seen.add(sig);
    out.push({ key, label, doc: next });
  };

  // The brand's own looks lead the first set: the calm one and the boldest one.
  if (seed === 0 && kit.colors.length) {
    const looks = variantCount(kit);
    for (const v of looks > 2 ? [0, looks - 2] : looks > 1 ? [0, 1] : [0]) {
      const result = applyBrand(doc, kit, { colors: true, fonts: kit.fonts.length > 0, details: false, variant: v });
      push(`brand-${v}`, looks > 1 ? `Your brand · look ${v + 1}` : 'Your brand', result.doc);
    }
  }

  const page = (doc.background.kind === 'solid' ? doc.background.color : doc.background.colors[0]).toUpperCase();
  let i = 0;
  while (out.length < count && i < count * 6) {
    const palette = PALETTES[(seed * 5 + i * 7) % PALETTES.length];
    const pair = FONT_PAIRS[(seed * 3 + i * 5) % FONT_PAIRS.length];
    // Alternate calm looks (page in the palette's paper) with bold ones (page in its accent).
    const variant = (seed + i) % 2 === 0 ? 0 : 2;
    i++;
    if (palette.colors[0] === page) continue;
    const result = applyBrand(
      doc,
      { colors: palette.colors, fonts: pair, profile: kit.profile },
      { colors: true, fonts: true, details: false, variant },
    );
    push(`${palette.name}-${pair.join('-')}-${variant}`, `${palette.name} · ${fontInfo(pair[0]).label} & ${fontInfo(pair[1]).label}`, result.doc);
  }
  return out;
}
