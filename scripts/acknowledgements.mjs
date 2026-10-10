#!/usr/bin/env node
// Builds src/generated/acknowledgements.json: everything Seam ships that
// someone else made, with its licence.
//
//   node scripts/acknowledgements.mjs            export the app, then collect
//   node scripts/acknowledgements.mjs <dir>      reuse an `expo export --source-maps` output
//
// - JavaScript packages: read from the release bundles' source maps, so only
//   code that actually ships is listed (no build tools).
// - Native modules: autolinked pods from ios/Podfile.lock.
// - Native third-party code (Skia, codecs, React Native's C++ deps, Android
//   libraries): curated below; their licence texts are fetched once into
//   scripts/licenses/ and committed, so later runs work offline.
// - Fonts: every bundled font file, with copyright and designer read from its
//   own name table.
//
// Re-run after adding or upgrading dependencies.

import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LICENSES = join(ROOT, 'scripts/licenses');
const OUT = join(ROOT, 'src/generated/acknowledgements.json');
const PLATFORMS = ['ios', 'android'];

// Native code that has no npm package of its own. `via` says what brings it in.
const NATIVE = [
  // React Native's engine and C++ dependencies (both platforms).
  { id: 'hermes', name: 'Hermes', via: 'React Native', license: 'MIT', url: 'https://github.com/facebook/hermes', text: 'https://raw.githubusercontent.com/facebook/hermes/main/LICENSE' },
  { id: 'folly', name: 'Folly', via: 'React Native', license: 'Apache-2.0', url: 'https://github.com/facebook/folly', text: 'https://raw.githubusercontent.com/facebook/folly/main/LICENSE', copyright: ['Copyright (c) Meta Platforms, Inc. and affiliates.'] },
  { id: 'boost', name: 'Boost', via: 'React Native', license: 'BSL-1.0', url: 'https://www.boost.org', text: 'https://www.boost.org/LICENSE_1_0.txt' },
  { id: 'glog', name: 'glog', via: 'React Native', license: 'BSD-3-Clause', url: 'https://github.com/google/glog', text: 'https://raw.githubusercontent.com/google/glog/master/LICENSE.md' },
  { id: 'fmt', name: '{fmt}', via: 'React Native', license: 'MIT', url: 'https://github.com/fmtlib/fmt', text: 'https://raw.githubusercontent.com/fmtlib/fmt/master/LICENSE' },
  { id: 'double-conversion', name: 'double-conversion', via: 'React Native', license: 'BSD-3-Clause', url: 'https://github.com/google/double-conversion', text: 'https://raw.githubusercontent.com/google/double-conversion/master/LICENSE' },
  { id: 'fast_float', name: 'fast_float', via: 'React Native', license: 'MIT', url: 'https://github.com/fastfloat/fast_float', text: 'https://raw.githubusercontent.com/fastfloat/fast_float/main/LICENSE-MIT' },
  { id: 'socketrocket', name: 'SocketRocket', via: 'React Native', license: 'BSD-3-Clause', platforms: ['ios'], url: 'https://github.com/facebookincubator/SocketRocket', text: 'https://raw.githubusercontent.com/facebookincubator/SocketRocket/main/LICENSE' },

  // Skia and what it compiles in (checked against the prebuilt libraries' symbols).
  { id: 'skia', name: 'Skia', via: 'React Native Skia', license: 'BSD-3-Clause', url: 'https://skia.org', text: 'https://raw.githubusercontent.com/google/skia/main/LICENSE' },
  { id: 'harfbuzz', name: 'HarfBuzz', via: 'Skia', license: 'MIT-Modern-Variant', url: 'https://harfbuzz.github.io', text: 'https://raw.githubusercontent.com/harfbuzz/harfbuzz/main/COPYING' },
  { id: 'libgrapheme', name: 'libgrapheme', via: 'Skia', license: 'ISC', platforms: ['ios'], url: 'https://libs.suckless.org/libgrapheme/', text: 'https://git.suckless.org/libgrapheme/file/LICENSE.html', html: true },
  { id: 'expat', name: 'Expat', via: 'Skia', license: 'MIT', url: 'https://libexpat.github.io', text: 'https://raw.githubusercontent.com/libexpat/libexpat/master/expat/COPYING' },
  { id: 'libpng', name: 'libpng', via: 'Skia', license: 'libpng-2.0', url: 'http://www.libpng.org/pub/png/libpng.html', text: 'https://raw.githubusercontent.com/pnggroup/libpng/libpng16/LICENSE' },
  {
    id: 'libjpeg-turbo',
    name: 'libjpeg-turbo',
    via: 'Skia',
    license: 'IJG AND BSD-3-Clause AND Zlib',
    note: 'This software is based in part on the work of the Independent JPEG Group.',
    url: 'https://libjpeg-turbo.org',
    text: 'https://raw.githubusercontent.com/libjpeg-turbo/libjpeg-turbo/main/LICENSE.md',
  },
  { id: 'libwebp', name: 'libwebp', via: 'Skia, SDWebImageWebPCoder', license: 'BSD-3-Clause', url: 'https://chromium.googlesource.com/webm/libwebp', text: 'https://raw.githubusercontent.com/webmproject/libwebp/main/COPYING' },
  { id: 'zlib', name: 'zlib', via: 'Skia', license: 'Zlib', url: 'https://zlib.net', text: 'https://raw.githubusercontent.com/madler/zlib/develop/LICENSE' },
  { id: 'wuffs', name: 'Wuffs', via: 'Skia', license: 'Apache-2.0 OR MIT', url: 'https://github.com/google/wuffs', text: 'https://raw.githubusercontent.com/google/wuffs/main/LICENSE' },
  {
    id: 'dng-sdk',
    name: 'DNG SDK',
    via: 'Skia',
    license: 'Adobe DNG SDK License',
    note: 'This product includes DNG technology under license by Adobe Systems Incorporated.',
    url: 'https://helpx.adobe.com/camera-raw/digital-negative.html',
    text: 'https://android.googlesource.com/platform/external/dng_sdk/+/refs/heads/main/LICENSE?format=TEXT',
    base64: true,
  },
  { id: 'piex', name: 'piex', via: 'Skia', license: 'Apache-2.0', url: 'https://github.com/google/piex', text: 'https://raw.githubusercontent.com/google/piex/master/LICENSE', copyright: ['Copyright 2015 Google Inc.'] },

  // expo-image's decoders.
  { id: 'sdwebimage', name: 'SDWebImage', via: 'expo-image', license: 'MIT', platforms: ['ios'], url: 'https://github.com/SDWebImage/SDWebImage', text: 'https://raw.githubusercontent.com/SDWebImage/SDWebImage/master/LICENSE' },
  { id: 'sdwebimage-webp', name: 'SDWebImageWebPCoder', via: 'expo-image', license: 'MIT', platforms: ['ios'], url: 'https://github.com/SDWebImage/SDWebImageWebPCoder', text: 'https://raw.githubusercontent.com/SDWebImage/SDWebImageWebPCoder/master/LICENSE' },
  { id: 'sdwebimage-svg', name: 'SDWebImageSVGCoder', via: 'expo-image', license: 'MIT', platforms: ['ios'], url: 'https://github.com/SDWebImage/SDWebImageSVGCoder', text: 'https://raw.githubusercontent.com/SDWebImage/SDWebImageSVGCoder/master/LICENSE' },
  { id: 'sdwebimage-avif', name: 'SDWebImageAVIFCoder', via: 'expo-image', license: 'MIT', platforms: ['ios'], url: 'https://github.com/SDWebImage/SDWebImageAVIFCoder', text: 'https://raw.githubusercontent.com/SDWebImage/SDWebImageAVIFCoder/master/LICENSE' },
  { id: 'libavif', name: 'libavif', via: 'expo-image (AVIF photos)', license: 'BSD-2-Clause', url: 'https://github.com/AOMediaCodec/libavif', text: 'https://raw.githubusercontent.com/AOMediaCodec/libavif/main/LICENSE' },
  { id: 'libaom', name: 'libaom', via: 'libavif', license: 'BSD-2-Clause', platforms: ['ios'], url: 'https://aomedia.googlesource.com/aom/', text: 'https://aomedia.googlesource.com/aom/+/refs/heads/main/LICENSE?format=TEXT', base64: true },
  { id: 'libgav1', name: 'libgav1', via: 'libavif', license: 'Apache-2.0', platforms: ['android'], url: 'https://chromium.googlesource.com/codecs/libgav1/', text: 'https://chromium.googlesource.com/codecs/libgav1/+/refs/heads/main/LICENSE?format=TEXT', base64: true, copyright: ['Copyright 2019 The libgav1 Authors'] },
  { id: 'glide', name: 'Glide', via: 'expo-image', license: 'BSD-2-Clause AND MIT AND Apache-2.0', platforms: ['android'], url: 'https://github.com/bumptech/glide', text: 'https://raw.githubusercontent.com/bumptech/glide/master/LICENSE' },
  { id: 'glide-transformations', name: 'Glide Transformations', via: 'expo-image', license: 'Apache-2.0', platforms: ['android'], url: 'https://github.com/wasabeef/glide-transformations', text: 'https://raw.githubusercontent.com/wasabeef/glide-transformations/main/LICENSE', copyright: ['Copyright (C) 2020 Wasabeef'] },
  { id: 'apng4android', name: 'APNG4Android', via: 'expo-image', license: 'Apache-2.0', platforms: ['android'], url: 'https://github.com/penfeizhou/APNG4Android', text: 'https://raw.githubusercontent.com/penfeizhou/APNG4Android/master/LICENSE', copyright: ['Copyright 2019 Zhou Pengfei'] },
  { id: 'androidsvg', name: 'AndroidSVG', via: 'expo-image', license: 'Apache-2.0', platforms: ['android'], url: 'https://bigbadaboom.github.io/androidsvg/', text: 'https://raw.githubusercontent.com/BigBadaboom/androidsvg/master/LICENSE', copyright: ['Copyright 2013 Paul LeBeau, Cave Rock Software Ltd.'] },

  // Android runtime libraries.
  { id: 'androidx', name: 'AndroidX (Jetpack)', via: 'React Native, Expo', license: 'Apache-2.0', platforms: ['android'], url: 'https://developer.android.com/jetpack/androidx', text: 'https://www.apache.org/licenses/LICENSE-2.0.txt', copyright: ['Copyright The Android Open Source Project'] },
  { id: 'kotlin', name: 'Kotlin', via: 'Expo', license: 'Apache-2.0', platforms: ['android'], url: 'https://kotlinlang.org', text: 'https://raw.githubusercontent.com/JetBrains/kotlin/master/license/LICENSE.txt', copyright: ['Copyright 2010-2025 JetBrains s.r.o. and Kotlin Programming Language contributors'] },
  { id: 'kotlinx-coroutines', name: 'kotlinx.coroutines', via: 'Expo', license: 'Apache-2.0', platforms: ['android'], url: 'https://github.com/Kotlin/kotlinx.coroutines', text: 'https://raw.githubusercontent.com/Kotlin/kotlinx.coroutines/master/LICENSE.txt', copyright: ['Copyright 2016-2025 JetBrains s.r.o. and contributors'] },
  { id: 'fresco', name: 'Fresco', via: 'React Native', license: 'MIT', platforms: ['android'], url: 'https://frescolib.org', text: 'https://raw.githubusercontent.com/facebook/fresco/main/LICENSE' },
  { id: 'soloader', name: 'SoLoader', via: 'React Native', license: 'Apache-2.0', platforms: ['android'], url: 'https://github.com/facebook/SoLoader', text: 'https://raw.githubusercontent.com/facebook/SoLoader/main/LICENSE', copyright: ['Copyright (c) Facebook, Inc. and its affiliates.'] },
  { id: 'fbjni', name: 'fbjni', via: 'React Native', license: 'Apache-2.0', platforms: ['android'], url: 'https://github.com/facebookincubator/fbjni', text: 'https://raw.githubusercontent.com/facebookincubator/fbjni/main/LICENSE', copyright: ['Copyright (c) Facebook, Inc. and its affiliates.'] },
  { id: 'okhttp', name: 'OkHttp', via: 'React Native, expo-image', license: 'Apache-2.0', platforms: ['android'], url: 'https://square.github.io/okhttp/', text: 'https://raw.githubusercontent.com/square/okhttp/master/LICENSE.txt', copyright: ['Copyright 2019 Square, Inc.'] },
  { id: 'okio', name: 'Okio', via: 'React Native', license: 'Apache-2.0', platforms: ['android'], url: 'https://square.github.io/okio/', text: 'https://raw.githubusercontent.com/square/okio/master/LICENSE.txt', copyright: ['Copyright 2013 Square, Inc.'] },
  { id: 'jsr305', name: 'JSR 305 annotations', via: 'React Native', license: 'BSD-3-Clause', platforms: ['android'], url: 'https://code.google.com/archive/p/jsr-305/', text: 'https://raw.githubusercontent.com/amaembo/jsr-305/master/ri/LICENSE' },
  { id: 'javax-inject', name: 'javax.inject', via: 'React Native', license: 'Apache-2.0', platforms: ['android'], url: 'https://github.com/javax-inject/javax-inject', text: 'https://www.apache.org/licenses/LICENSE-2.0.txt', copyright: ['Copyright (C) 2009 The JSR-330 Expert Group'] },
];

// Covered by the Fonts section (the packages only wrap the font files).
const SKIP = new Set(['scrl-d']);
// Packages whose licence file carries no copyright line of its own.
const OWNERS = [[/^(@react-native\/|metro-runtime$)/, 'Copyright (c) Meta Platforms, Inc. and affiliates.']];
const isFontPackage = (name) => name.startsWith('@expo-google-fonts/');

// ---------------------------------------------------------------------------

const read = (p) => readFileSync(p, 'utf8');
const json = (p) => JSON.parse(read(p));

function exportApp() {
  const dir = mkdtempSync(join(tmpdir(), 'seam-ack-'));
  console.log(`Exporting release bundles to ${dir}…`);
  execFileSync('npx', ['expo', 'export', ...PLATFORMS.flatMap((p) => ['--platform', p]), '--source-maps', '--dump-assetmap', '--output-dir', dir], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  return dir;
}

/** package dir (relative to ROOT) -> platforms it ships on */
function bundledPackages(exportDir) {
  const found = new Map();
  for (const platform of PLATFORMS) {
    const dir = join(exportDir, '_expo/static/js', platform);
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.map'))) {
      for (const source of json(join(dir, file)).sources) {
        const i = source.lastIndexOf('node_modules/');
        if (i < 0) continue;
        const rest = source.slice(i + 'node_modules/'.length).split('/');
        const name = rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
        const pkgDir = source.slice(0, i).replace(/^\//, '') + 'node_modules/' + name;
        if (!found.has(pkgDir)) found.set(pkgDir, new Set());
        found.get(pkgDir).add(platform);
      }
    }
  }
  return found;
}

/** Autolinked native modules that might not appear in the JS bundle. */
function podPackages() {
  const lock = join(ROOT, 'ios/Podfile.lock');
  if (!existsSync(lock)) return [];
  const dirs = new Set();
  for (const [, path] of read(lock).matchAll(/:path: "?\.\.\/(node_modules\/(?:@[^/"]+\/)?[^/"]+)/g)) dirs.add(path);
  return [...dirs];
}

const LICENSE_FILES = /^(licen[cs]e|copying)(\.(md|txt|markdown))?$/i;

function findLicenseFile(dir) {
  const file = readdirSync(dir).find((f) => LICENSE_FILES.test(f));
  return file ? read(join(dir, file)) : null;
}

const TITLE = /^\s*(the\s+)?[\w.\- ]{0,40}\blicen[cs]e\b(\s*\([\w.\- ]+\))?\s*:?\s*$/i;
const COPYRIGHT = /^\s*(copyright\b(?!\s+notice)|\(c\)\s*\d|©)/i;

/** Splits a licence into its leading copyright lines and the shared body. */
function splitLicense(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const copyright = [];
  let i = 0;
  while (i < lines.length && (lines[i].trim() === '' || TITLE.test(lines[i]))) i++;
  while (i < lines.length && (lines[i].trim() === '' || COPYRIGHT.test(lines[i]) || (copyright.length && /^\s{2,}\S/.test(lines[i])))) {
    if (lines[i].trim()) copyright.push(lines[i].trim());
    i++;
  }
  const body = lines.slice(i).join('\n').trim();
  // A licence that is nothing but a notice keeps its notice as the body.
  return body.length > 80 ? { copyright, body } : { copyright: [], body: text.trim() };
}

const texts = new Map();
function addText(body) {
  const key = body.replace(/\s+/g, ' ').trim();
  const id = createHash('sha1').update(key).digest('hex').slice(0, 10);
  if (!texts.has(id)) texts.set(id, body);
  return id;
}

const licenseId = (pkg) =>
  typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? (Array.isArray(pkg.licenses) ? pkg.licenses.map((l) => l.type).join(' OR ') : 'UNKNOWN');

const person = (p) => (typeof p === 'string' ? p.replace(/\s*[<(].*$/, '') : p?.name);

function repoUrl(pkg) {
  let url = pkg.homepage || (typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url);
  if (!url) return `https://www.npmjs.com/package/${pkg.name}`;
  url = url.replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://').replace(/^ssh:\/\/git@/, 'https://');
  if (/^github:/.test(url)) url = `https://github.com/${url.slice(7)}`;
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) url = `https://github.com/${url}`;
  return url.split('#readme')[0];
}

function collectPackages(bundled) {
  const pods = podPackages();
  for (const dir of pods) if (!bundled.has(dir)) bundled.set(dir, new Set(PLATFORMS));
  const byKey = new Map();
  for (const [dir, platforms] of bundled) {
    const abs = join(ROOT, dir);
    if (!existsSync(join(abs, 'package.json'))) continue;
    const pkg = json(join(abs, 'package.json'));
    if (SKIP.has(pkg.name) || isFontPackage(pkg.name)) continue;
    const key = `${pkg.name}@${pkg.version}`;
    if (byKey.has(key)) {
      platforms.forEach((p) => byKey.get(key).platforms.add(p));
      continue;
    }
    const raw = findLicenseFile(abs);
    const { copyright, body } = raw ? splitLicense(raw) : { copyright: [], body: null };
    const author = person(pkg.author);
    byKey.set(key, {
      name: pkg.name,
      version: pkg.version,
      license: licenseId(pkg),
      copyright: copyright.length
        ? copyright
        : author
          ? [`Copyright (c) ${author}`]
          : OWNERS.filter(([re]) => re.test(pkg.name)).map(([, line]) => line),
      url: repoUrl(pkg),
      text: body ? addText(body) : null,
      platforms: new Set(platforms),
    });
  }
  // Packages that ship without a licence file get the standard text for their licence.
  const standard = {};
  for (const p of byKey.values()) if (p.text && !standard[p.license]) standard[p.license] = p.text;
  for (const p of byKey.values()) if (!p.text) p.text = standard[p.license] ?? null;
  return [...byKey.values()]
    .map((p) => ({ ...p, platforms: [...p.platforms].sort() }))
    .sort((a, b) => a.name.replace(/^@/, '').localeCompare(b.name.replace(/^@/, '')));
}

async function collectNative() {
  mkdirSync(LICENSES, { recursive: true });
  const out = [];
  for (const n of NATIVE) {
    const cache = join(LICENSES, `${n.id}.txt`);
    if (!existsSync(cache)) {
      process.stdout.write(`Fetching licence for ${n.name}… `);
      const res = await fetch(n.text);
      if (!res.ok) throw new Error(`${n.text}: HTTP ${res.status}`);
      let body = await res.text();
      if (n.base64) body = Buffer.from(body, 'base64').toString('utf8');
      if (n.html) body = decodeHtml(body);
      writeFileSync(cache, body);
      console.log('ok');
    }
    const { copyright, body } = splitLicense(read(cache));
    out.push({
      id: n.id,
      name: n.name,
      via: n.via,
      license: n.license,
      copyright: n.copyright ?? copyright,
      note: n.note,
      url: n.url,
      text: addText(body),
      platforms: n.platforms ?? PLATFORMS,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** The licence inside a cgit/stagit file page: the <pre> block, untagged. */
function decodeHtml(html) {
  const pre = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i)?.[1] ?? html;
  return pre
    .replace(/<a [^>]*class="line"[^>]*>\s*\d+<\/a>\s?/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

// TrueType/OpenType `name` table: 0 copyright, 1 family, 2 style, 9 designer,
// 12 designer URL, 13 licence description, 14 licence URL, 16 typographic family.
function fontNames(buf) {
  const tables = buf.readUInt16BE(4);
  for (let t = 0; t < tables; t++) {
    const rec = 12 + t * 16;
    if (buf.toString('latin1', rec, rec + 4) !== 'name') continue;
    const base = buf.readUInt32BE(rec + 8);
    const count = buf.readUInt16BE(base + 2);
    const strings = base + buf.readUInt16BE(base + 4);
    const names = {};
    for (let i = 0; i < count; i++) {
      const r = base + 6 + i * 12;
      const [platform, encoding, language, id, length, offset] = [0, 2, 4, 6, 8, 10].map((o) => buf.readUInt16BE(r + o));
      const start = strings + offset;
      if (platform === 3 && (encoding === 1 || encoding === 10) && language === 0x409) {
        let s = '';
        for (let j = 0; j < length; j += 2) s += String.fromCharCode(buf.readUInt16BE(start + j));
        names[id] = s;
      } else if (platform === 1 && encoding === 0 && language === 0 && !(id in names)) {
        names[id] = buf.toString('latin1', start, start + length);
      }
    }
    return names;
  }
  return {};
}

function collectFonts(exportDir, bundled) {
  const assets = json(join(exportDir, 'assetmap.json'));
  const families = new Map();
  for (const asset of Object.values(assets)) {
    if (!['ttf', 'otf'].includes(asset.type)) continue;
    const rel = asset.httpServerLocation.replace(/^\/assets\/?/, '').replace(/\?.*$/, '');
    const file = join(ROOT, rel, `${asset.name}.${asset.type}`);
    const names = fontNames(readFileSync(file));
    const family = names[16] || names[1];
    const pkgDir = rel.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)/)?.[1];
    if (!families.has(family)) {
      const licence = pkgDir && ['LICENSE_FONT', 'OFL.txt', 'LICENSE'].map((f) => join(ROOT, pkgDir, f)).find(existsSync);
      const { body } = licence ? splitLicense(read(licence)) : { body: null };
      const ofl = /SIL OPEN FONT LICENSE/i.test(body ?? '');
      families.set(family, {
        family,
        styles: [],
        copyright: (names[0] ?? '').trim(),
        designer: names[9]?.trim(),
        designerUrl: names[12]?.trim(),
        license: ofl ? 'OFL-1.1' : body && /Apache License/i.test(body) ? 'Apache-2.0' : 'See licence',
        licenseUrl: names[14]?.trim(),
        text: body ? addText(body) : null,
        platforms: [...(bundled.get(pkgDir) ?? PLATFORMS)].sort(),
      });
    }
    families.get(family).styles.push(names[17] || names[2]);
  }
  return [...families.values()].sort((a, b) => a.family.localeCompare(b.family));
}

const exportDir = process.argv[2] ?? exportApp();
const cleanUp = () => !process.argv[2] && rmSync(exportDir, { recursive: true, force: true });
const bundled = bundledPackages(exportDir);
const fonts = collectFonts(exportDir, bundled);
const packages = collectPackages(bundled);
const native = await collectNative();

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify({ packages, native, fonts, texts: Object.fromEntries(texts) }, null, 0) + '\n',
);
cleanUp();
console.log(`Wrote ${packages.length} packages, ${native.length} native libraries, ${fonts.length} font families, ${texts.size} licence texts to ${OUT.replace(ROOT + '/', '')}`);
