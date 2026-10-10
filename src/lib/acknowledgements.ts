import { Platform } from 'react-native';

import data from '@/generated/acknowledgements.json';

// Typed access to src/generated/acknowledgements.json (made by
// scripts/acknowledgements.mjs), narrowed to what ships on this platform.

type Shipped = { platforms: string[] };

export type Package = Shipped & {
  name: string;
  version: string;
  license: string;
  copyright: string[];
  url: string;
  text: string | null;
};

export type NativeLibrary = Shipped & {
  id: string;
  name: string;
  via: string;
  license: string;
  copyright: string[];
  /** A notice the licence asks every product to carry. */
  note?: string;
  url: string;
  text: string;
};

export type Typeface = Shipped & {
  family: string;
  styles: string[];
  copyright: string;
  designer?: string;
  designerUrl?: string;
  license: string;
  licenseUrl?: string;
  text: string | null;
};

export type CreditKind = 'package' | 'native' | 'font';

const all = data as unknown as {
  packages: Package[];
  native: NativeLibrary[];
  fonts: Typeface[];
  texts: Record<string, string>;
};

const here = <T extends Shipped>(items: T[]) =>
  Platform.OS === 'ios' || Platform.OS === 'android' ? items.filter((i) => i.platforms.includes(Platform.OS)) : items;

export const PACKAGES = here(all.packages);
export const NATIVE_LIBRARIES = here(all.native);
export const TYPEFACES = here(all.fonts);

export const packageId = (p: Package) => `${p.name}@${p.version}`;

export function licenseText(id: string | null) {
  return id ? all.texts[id] ?? null : null;
}

/** Readable licence names for the SPDX ids the data uses. */
export function licenseName(spdx: string) {
  const names: Record<string, string> = {
    MIT: 'MIT License',
    ISC: 'ISC License',
    'Apache-2.0': 'Apache License 2.0',
    'BSD-2-Clause': 'BSD 2-Clause',
    'BSD-3-Clause': 'BSD 3-Clause',
    'BSL-1.0': 'Boost Software License',
    'OFL-1.1': 'SIL Open Font License 1.1',
    Zlib: 'zlib License',
    'libpng-2.0': 'libpng License',
    'MIT-Modern-Variant': '“Old MIT” License',
  };
  return spdx
    .split(/ (AND|OR) /)
    .map((part) => (part === 'AND' ? '+' : part === 'OR' ? 'or' : names[part] ?? part))
    .join(' ');
}
