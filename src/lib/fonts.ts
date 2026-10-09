import { type SkTypefaceFontProvider, Skia } from '@shopify/react-native-skia';
import { getDocumentAsync } from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { loadAsync } from 'expo-font';
import { useSyncExternalStore } from 'react';

import { type BuiltinFontId, FONTS, type FontId } from './types';

// Bundled fonts. The same files back the React Native UI (by key) and the
// Skia canvas (by family), so text looks identical in the editor, the text
// input and the exported JPEGs on every platform.

export const UI_FONT_FILES = {
  Inter_400Regular: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
  Inter_500Medium: require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
  Inter_600SemiBold: require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
  Inter_700Bold: require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'),
  InstrumentSerif_400Regular: require('@expo-google-fonts/instrument-serif/400Regular/InstrumentSerif_400Regular.ttf'),
  InstrumentSerif_400Regular_Italic: require('@expo-google-fonts/instrument-serif/400Regular_Italic/InstrumentSerif_400Regular_Italic.ttf'),
  PlayfairDisplay_700Bold: require('@expo-google-fonts/playfair-display/700Bold/PlayfairDisplay_700Bold.ttf'),
  SpaceGrotesk_500Medium: require('@expo-google-fonts/space-grotesk/500Medium/SpaceGrotesk_500Medium.ttf'),
  DMMono_500Medium: require('@expo-google-fonts/dm-mono/500Medium/DMMono_500Medium.ttf'),
  Caveat_700Bold: require('@expo-google-fonts/caveat/700Bold/Caveat_700Bold.ttf'),
  BebasNeue_400Regular: require('@expo-google-fonts/bebas-neue/400Regular/BebasNeue_400Regular.ttf'),
};

/** Skia family name -> font files, for the canvas typeface provider. */
export const CANVAS_FONT_FILES = {
  Inter: [UI_FONT_FILES.Inter_700Bold],
  'Instrument Serif': [UI_FONT_FILES.InstrumentSerif_400Regular],
  'Instrument Serif Italic': [UI_FONT_FILES.InstrumentSerif_400Regular_Italic],
  'Playfair Display': [UI_FONT_FILES.PlayfairDisplay_700Bold],
  'Space Grotesk': [UI_FONT_FILES.SpaceGrotesk_500Medium],
  'DM Mono': [UI_FONT_FILES.DMMono_500Medium],
  Caveat: [UI_FONT_FILES.Caveat_700Bold],
  'Bebas Neue': [UI_FONT_FILES.BebasNeue_400Regular],
};

let provider: SkTypefaceFontProvider | null = null;
let version = 0;

/** Called once the canvas fonts have loaded (see the root layout). */
export function setCanvasFonts(p: SkTypefaceFontProvider) {
  if (provider === p) return;
  provider = p;
  version++;
}

export function canvasFonts() {
  return provider;
}

/** Bumps when fonts load, so cached paragraphs built before can be dropped. */
export function canvasFontsVersion() {
  return version;
}

// ---------------------------------------------------------------------------
// Fonts imported from Files. Kept in documents/fonts/ with an index, and
// registered with both the Skia provider (canvas) and expo-font (text input)
// on launch, under `custom:<family>` ids.

type CustomFont = { family: string; file: string };

const custom = new Map<string, CustomFont>();
const listeners = new Set<() => void>();

const rnKey = (family: string) => `Custom_${family.replace(/[^A-Za-z0-9]/g, '_')}`;

function fontsDir() {
  const dir = new Directory(Paths.document, 'fonts');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

const indexFile = () => new File(fontsDir(), 'index.json');

function bump() {
  version++;
  listeners.forEach((l) => l());
}

/** Re-renders the caller when fonts are added (paragraph caches key on the version). */
export function useFontsVersion() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
}

export type FontInfo = { label: string; family: string; rn: string; weight: number };

export function fontInfo(id: FontId): FontInfo {
  if (id.startsWith('custom:')) {
    const family = id.slice('custom:'.length);
    if (custom.has(family)) return { label: family, family, rn: rnKey(family), weight: 400 };
    return FONTS.sans;
  }
  return FONTS[id as BuiltinFontId] ?? FONTS.sans;
}

export function allFonts(): { id: FontId; info: FontInfo }[] {
  return [
    ...(Object.keys(FONTS) as BuiltinFontId[]).map((id) => ({ id: id as FontId, info: FONTS[id] })),
    ...[...custom.keys()].map((family) => {
      const id = `custom:${family}` as FontId;
      return { id, info: fontInfo(id) };
    }),
  ];
}

async function register(font: CustomFont) {
  const file = new File(fontsDir(), font.file);
  if (!file.exists) return false;
  const typeface = Skia.Typeface.MakeFreeTypeFaceFromData(await Skia.Data.fromURI(file.uri));
  if (!typeface || !provider) return false;
  provider.registerFont(typeface, font.family);
  await loadAsync({ [rnKey(font.family)]: file.uri }).catch(() => {});
  custom.set(font.family, font);
  return true;
}

/** Registers previously imported fonts. Call once the canvas fonts are ready. */
export async function loadCustomFonts() {
  if (!indexFile().exists) return;
  try {
    const list = JSON.parse(await indexFile().text()) as CustomFont[];
    for (const font of list) await register(font).catch(() => false);
    bump();
  } catch {
    // A broken index just means no custom fonts.
  }
}

function saveIndex() {
  indexFile().write(JSON.stringify([...custom.values()]));
}

/**
 * Lets the user pick a .ttf/.otf from Files and adds it. Resolves the new
 * font id, or null if cancelled.
 */
export async function importFont(): Promise<FontId | null> {
  const result = await getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  const ext = asset.name.match(/\.(ttf|otf)$/i)?.[1]?.toLowerCase();
  if (!ext) throw new Error('Pick a .ttf or .otf font file.');

  let family = asset.name
    .replace(/\.(ttf|otf)$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  const base = family;
  for (let n = 2; custom.has(family) || family in CANVAS_FONT_FILES; n++) family = `${base} ${n}`;

  const name = `${Date.now().toString(36)}.${ext}`;
  await new File(asset.uri).copy(new File(fontsDir(), name));
  const font = { family, file: name };
  if (!(await register(font))) {
    new File(fontsDir(), name).delete();
    throw new Error('That file could not be read as a font.');
  }
  saveIndex();
  bump();
  return `custom:${family}`;
}
