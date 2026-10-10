import { getDocumentAsync } from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ColorWell } from '@/components/color-well';
import { Row, Section } from '@/components/list';
import { useNamePrompt } from '@/components/menu-sheet';
import { Icon, IconButton, PressableScale } from '@/components/ui';
import {
  BRAND_ASSET_LIMIT,
  BRAND_COLOR_LIMIT,
  BRAND_FONT_LIMIT,
  BRAND_LOGO_LIMIT,
  type BrandImage,
  type BrandProfile,
  addBrandAsset,
  addBrandColor,
  addBrandLogo,
  brandAssetUri,
  brandLogoUri,
  normalizeHex,
  promoteBrandColor,
  promoteBrandFont,
  removeBrandAsset,
  removeBrandColor,
  removeBrandLogo,
  toggleBrandFont,
  updateBrandProfile,
  useBrandAssets,
  useBrandColors,
  useBrandFonts,
  useBrandLogos,
  useBrandProfile,
} from '@/lib/brand';
import { allFonts, fontInfo, importFont, useFontsVersion } from '@/lib/fonts';
import { paletteFromImage } from '@/lib/palette';
import type { FontId } from '@/lib/types';
import { C, R, T } from '@/theme';

type Picked = { uri: string; size?: { width: number; height: number }; alpha: boolean };

const isPng = (name?: string | null, mime?: string | null) => mime === 'image/png' || /\.png$/i.test(name ?? '');

/** Logos, brand images, colours, fonts and details, in one place. */
export default function BrandKitScreen() {
  const insets = useSafeAreaInsets();
  const colors = useBrandColors();
  const logos = useBrandLogos();
  const assets = useBrandAssets();
  const fonts = useBrandFonts();
  const profile = useBrandProfile();
  useFontsVersion();
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'logo' | 'asset' | 'palette'>(null);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [choosingFonts, setChoosingFonts] = useState(false);
  const [prompt, promptElement] = useNamePrompt();

  const full = (what: string, limit: number) => Alert.alert('Brand kit is full', `Keep up to ${limit} ${what}. Remove one first.`);

  // --- Colours ---------------------------------------------------------------

  const saveColor = (hex: string) => {
    if (!addBrandColor(hex)) return full('colours', BRAND_COLOR_LIMIT);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSuggested((s) => s.filter((c) => c !== hex));
  };

  const enterHex = () =>
    prompt('Add a colour', '', (value) => {
      const hex = normalizeHex(value);
      if (hex) saveColor(hex);
      else Alert.alert('Not a colour', 'Use a hex code like #D9C29C.');
    }, { placeholder: 'A hex code, like #D9C29C' });

  const colorActions = (c: string, i: number) =>
    Alert.alert(c, i === 0 ? 'Your lead colour.' : undefined, [
      ...(i > 0 ? [{ text: 'Make lead colour', onPress: () => promoteBrandColor(c) }] : []),
      { text: 'Remove', style: 'destructive' as const, onPress: () => removeBrandColor(c) },
      { text: 'Cancel', style: 'cancel' as const },
    ]);

  const suggestFrom = async (uri: string) => {
    setBusy('palette');
    try {
      const found = (await paletteFromImage(uri, 6)).filter((c) => !colors.includes(c));
      setSuggested(found);
      if (!found.length) Alert.alert('Nothing new', 'Those colours are already in your kit.');
    } catch (e) {
      Alert.alert('Could not read the colours', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const suggest = () =>
    Alert.alert('Find colours', 'Pull the main colours out of an image.', [
      ...(logos[0] ? [{ text: 'From my logo', onPress: () => suggestFrom(brandLogoUri(logos[0])) }] : []),
      {
        text: 'From a photo',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
          if (!result.canceled && result.assets[0]) suggestFrom(result.assets[0].uri);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  // --- Images ----------------------------------------------------------------

  const pickImages = async (from: 'photos' | 'files', limit: number): Promise<Picked[]> => {
    if (from === 'photos') {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        allowsMultipleSelection: limit > 1,
        selectionLimit: limit,
        // Keep PNGs as PNGs so transparent logos stay transparent.
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
      });
      if (result.canceled) return [];
      return result.assets.map((a) => ({
        uri: a.uri,
        size: { width: a.width, height: a.height },
        alpha: isPng(a.fileName ?? a.uri, a.mimeType),
      }));
    }
    const result = await getDocumentAsync({
      type: ['image/png', 'image/jpeg', 'image/heic', 'image/webp'],
      copyToCacheDirectory: true,
      multiple: limit > 1,
    });
    if (result.canceled) return [];
    return result.assets.slice(0, limit).map((a) => ({ uri: a.uri, alpha: isPng(a.name, a.mimeType) }));
  };

  const importImages = async (kind: 'logo' | 'asset', from: 'photos' | 'files') => {
    const room = kind === 'logo' ? BRAND_LOGO_LIMIT - logos.length : BRAND_ASSET_LIMIT - assets.length;
    try {
      const picked = await pickImages(from, kind === 'logo' ? 1 : room);
      if (!picked.length) return;
      setBusy(kind);
      for (const p of picked) {
        if (kind === 'logo') await addBrandLogo(p.uri, p.size);
        else await addBrandAsset(p.uri, { size: p.size, alpha: p.alpha });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert(`Could not add the ${kind === 'logo' ? 'logo' : 'image'}`, e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const addImage = (kind: 'logo' | 'asset') => {
    const count = kind === 'logo' ? logos.length : assets.length;
    const limit = kind === 'logo' ? BRAND_LOGO_LIMIT : BRAND_ASSET_LIMIT;
    if (count >= limit) return full(kind === 'logo' ? 'logos' : 'brand images', limit);
    Alert.alert(
      kind === 'logo' ? 'Add a logo' : 'Add brand images',
      kind === 'logo'
        ? 'A PNG with a transparent background works best.'
        : 'Stickers, product shots, patterns: anything you put in posts often. Transparent PNGs drop in as stickers.',
      [
        { text: 'From Photos', onPress: () => importImages(kind, 'photos') },
        { text: 'From Files', onPress: () => importImages(kind, 'files') },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const askRemove = (kind: 'logo' | 'asset', item: BrandImage) =>
    Alert.alert(kind === 'logo' ? 'Remove this logo?' : 'Remove this image?', 'Carousels that already use it keep their copy.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => (kind === 'logo' ? removeBrandLogo : removeBrandAsset)(item.id) },
    ]);

  // --- Fonts -----------------------------------------------------------------

  const toggleFont = (id: FontId) => {
    Haptics.selectionAsync();
    if (!toggleBrandFont(id)) full('fonts', BRAND_FONT_LIMIT);
  };

  const addFont = async () => {
    try {
      const id = await importFont();
      if (id && !toggleBrandFont(id)) full('fonts', BRAND_FONT_LIMIT);
    } catch (e) {
      Alert.alert('Could not add the font', e instanceof Error ? e.message : String(e));
    }
  };

  const fontActions = (id: FontId, i: number) =>
    Alert.alert(fontInfo(id).label, i === 0 ? 'Used for headings.' : i === 1 ? 'Used for body text.' : undefined, [
      ...(i > 0 ? [{ text: 'Use for headings', onPress: () => promoteBrandFont(id) }] : []),
      { text: 'Remove from kit', style: 'destructive' as const, onPress: () => toggleBrandFont(id) },
      { text: 'Cancel', style: 'cancel' as const },
    ]);

  // --- Details ---------------------------------------------------------------

  const editDetail = (key: keyof BrandProfile, title: string, placeholder: string) =>
    prompt(title, key === 'handle' && profile.handle ? `@${profile.handle}` : profile[key], (value) => updateBrandProfile({ [key]: value }), {
      placeholder,
      allowEmpty: true,
    });

  const heading = fonts[0] ? fontInfo(fonts[0]) : null;
  const body = fonts[1] ? fontInfo(fonts[1]) : heading;
  const boardBg = colors[1] ?? colors[0];

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <IconButton label="Back" icon={{ ios: 'chevron.left', android: 'arrow_back' }} onPress={() => router.back()} />
        <Text style={styles.headerTitle}>Brand kit</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 48, gap: 30 }}>
        {/* The kit at a glance. */}
        <View style={[styles.board, { backgroundColor: boardBg ?? C.surface }]}>
          <View style={styles.boardTop}>
            {logos[0] ? (
              <Image source={{ uri: brandLogoUri(logos[0]) }} style={styles.boardLogo} contentFit="contain" />
            ) : (
              <View style={[styles.boardLogo, styles.boardLogoEmpty]}>
                <Icon name={{ ios: 'seal', android: 'verified' }} size={22} color={inkOn(boardBg, 0.6)} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.boardName, heading && { fontFamily: heading.rn }, { color: inkOn(boardBg) }]} numberOfLines={1}>
                {profile.name || 'Your brand'}
              </Text>
              <Text style={[styles.boardHandle, body && { fontFamily: body.rn }, { color: inkOn(boardBg, 0.7) }]} numberOfLines={1}>
                {profile.handle ? `@${profile.handle}` : 'Add your handle below'}
              </Text>
            </View>
          </View>
          {!!profile.tagline && (
            <Text style={[styles.boardTagline, body && { fontFamily: body.rn }, { color: inkOn(boardBg, 0.85) }]}>{profile.tagline}</Text>
          )}
          <View style={styles.boardPalette}>
            {(colors.length ? colors.slice(0, 8) : [C.surfaceHi, C.line, C.textFaint]).map((c, i) => (
              <View key={`${c}${i}`} style={[styles.boardChip, { backgroundColor: c }]} />
            ))}
          </View>
        </View>

        <Section title="Details" footer="Your handle replaces @yourname in templates and heads the grid planner.">
          <Row title="Name" value={profile.name || 'Add'} onPress={() => editDetail('name', 'Brand name', 'Your brand or your name')} />
          <Row
            title="Handle"
            value={profile.handle ? `@${profile.handle}` : 'Add'}
            onPress={() => editDetail('handle', 'Instagram handle', 'Like @yourname')}
          />
          <Row title="Website" value={profile.website || 'Add'} onPress={() => editDetail('website', 'Website', 'Like yourbrand.com')} />
          <Row
            title="Tagline"
            detail={profile.tagline || undefined}
            value={profile.tagline ? undefined : 'Add'}
            onPress={() => editDetail('tagline', 'Tagline or bio', 'A line about what you make')}
            last
          />
        </Section>

        <View style={styles.section}>
          <SectionTitle title="Logos" count={logos.length} limit={BRAND_LOGO_LIMIT} />
          <View style={styles.logos}>
            {logos.map((l) => (
              <Pressable key={l.id} onPress={() => askRemove('logo', l)} style={styles.logo} accessibilityLabel="Logo, tap to remove">
                <Checker />
                <Image source={{ uri: brandLogoUri(l) }} style={styles.logoImage} contentFit="contain" />
              </Pressable>
            ))}
            {logos.length < BRAND_LOGO_LIMIT && (
              <AddTile label="Add logo" busy={busy === 'logo'} onPress={() => addImage('logo')} style={styles.logo} />
            )}
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle title="Brand images" count={assets.length} limit={BRAND_ASSET_LIMIT} />
          <View style={styles.assets}>
            {assets.map((a) => (
              <Pressable key={a.id} onPress={() => askRemove('asset', a)} style={styles.asset} accessibilityLabel="Brand image, tap to remove">
                {a.alpha && <Checker />}
                <Image source={{ uri: brandAssetUri(a) }} style={StyleSheet.absoluteFill} contentFit={a.alpha ? 'contain' : 'cover'} />
              </Pressable>
            ))}
            {assets.length < BRAND_ASSET_LIMIT && <AddTile busy={busy === 'asset'} onPress={() => addImage('asset')} style={styles.asset} />}
          </View>
          <Text style={styles.hint}>Stickers, product shots and patterns. Add them from Shapes → Brand in the editor.</Text>
        </View>

        <View style={styles.section}>
          <SectionTitle title="Colours" count={colors.length} limit={BRAND_COLOR_LIMIT} />
          {colors.length > 0 && (
            <View style={styles.swatches}>
              {colors.map((c, i) => (
                <Pressable key={c} onPress={() => colorActions(c, i)} accessibilityLabel={`${c}, options`} style={styles.swatchWrap}>
                  <View style={[styles.swatch, { backgroundColor: c }]}>
                    {i === 0 && <Icon name={{ ios: 'star.fill', android: 'star' }} size={12} color={inkOn(c)} />}
                  </View>
                  <Text style={styles.swatchHex}>{c}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {suggested.length > 0 && (
            <View style={styles.suggested}>
              <Text style={styles.suggestedTitle}>Found in your image · tap to add</Text>
              <View style={styles.swatches}>
                {suggested.map((c) => (
                  <Pressable key={c} onPress={() => saveColor(c)} style={styles.swatchWrap} accessibilityLabel={`Add ${c}`}>
                    <View style={[styles.swatch, styles.swatchSuggested, { backgroundColor: c }]}>
                      <Icon name={{ ios: 'plus', android: 'add' }} size={14} color={inkOn(c)} />
                    </View>
                    <Text style={styles.swatchHex}>{c}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          <View style={styles.addColor}>
            <ColorWell value={draft} onChange={setDraft} />
            <View style={[styles.draftDot, { backgroundColor: draft ?? 'transparent' }, !draft && styles.draftEmpty]} />
            <Text style={styles.draftText}>{draft ?? 'Pick a colour'}</Text>
            <View style={{ flex: 1 }} />
            <Pressable onPress={enterHex} hitSlop={8}>
              <Text style={styles.link}>Hex…</Text>
            </Pressable>
            <PressableScale
              onPress={() => {
                if (draft) saveColor(draft);
                setDraft(null);
              }}
              disabled={!draft}
              style={[styles.pill, !draft && { opacity: 0.4 }]}>
              <Text style={styles.pillText}>Save</Text>
            </PressableScale>
          </View>
          <Pressable onPress={suggest} disabled={busy === 'palette'} hitSlop={8} style={styles.inlineAction}>
            {busy === 'palette' ? (
              <ActivityIndicator color={C.accent} size="small" />
            ) : (
              <Icon name={{ ios: 'eyedropper.halffull', android: 'colorize' }} size={16} color={C.accent} />
            )}
            <Text style={styles.link}>Find colours in your logo or a photo</Text>
          </Pressable>
          <Text style={styles.hint}>The starred colour leads when you apply the kit to a carousel. Tap a colour for options.</Text>
        </View>

        <View style={styles.section}>
          <SectionTitle title="Fonts" count={fonts.length} limit={BRAND_FONT_LIMIT} />
          {fonts.length > 0 && (
            <View style={styles.card}>
              {fonts.map((id, i) => {
                const info = fontInfo(id);
                return (
                  <Pressable
                    key={id}
                    onPress={() => fontActions(id, i)}
                    style={({ pressed }) => [styles.fontRow, i < fonts.length - 1 && styles.fontDivider, pressed && { opacity: 0.6 }]}>
                    <Text style={[styles.fontSample, { fontFamily: info.rn }]} numberOfLines={1}>
                      {info.label}
                    </Text>
                    <Text style={styles.fontRole}>{i === 0 ? 'Headings' : i === 1 ? 'Body' : 'Extra'}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <Pressable onPress={() => setChoosingFonts((v) => !v)} hitSlop={8} style={styles.inlineAction}>
            <Icon
              name={{ ios: choosingFonts ? 'chevron.up' : 'textformat', android: choosingFonts ? 'expand_less' : 'title' }}
              size={16}
              color={C.accent}
            />
            <Text style={styles.link}>{choosingFonts ? 'Done' : fonts.length ? 'Change fonts' : 'Choose brand fonts'}</Text>
          </Pressable>
          {choosingFonts && (
            <>
              <View style={styles.card}>
                {allFonts().map(({ id, info }, i, list) => {
                  const on = fonts.includes(id);
                  return (
                    <Pressable
                      key={id}
                      onPress={() => toggleFont(id)}
                      style={({ pressed }) => [styles.fontRow, i < list.length - 1 && styles.fontDivider, pressed && { opacity: 0.6 }]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}>
                      <Text style={[styles.fontSample, { fontFamily: info.rn }]} numberOfLines={1}>
                        {info.label}
                      </Text>
                      <View style={[styles.check, on && styles.checkOn]}>
                        {on && <Icon name={{ ios: 'checkmark', android: 'check' }} size={12} color={C.accentInk} />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable onPress={addFont} hitSlop={8} style={styles.inlineAction}>
                <Icon name={{ ios: 'plus.circle', android: 'add_circle' }} size={16} color={C.accent} />
                <Text style={styles.link}>Import a font (.ttf or .otf)</Text>
              </Pressable>
            </>
          )}
          <Text style={styles.hint}>The first font is for headings, the second for body text.</Text>
        </View>

        <View style={styles.tip}>
          <Icon name={{ ios: 'wand.and.stars', android: 'auto_fix_high' }} size={18} color={C.accent} />
          <Text style={styles.tipText}>
            Put it to work: in any carousel, open ••• → Apply brand kit, or pick a template and tap “With my brand”.
          </Text>
        </View>
      </ScrollView>
      {promptElement}
    </View>
  );
}

/** Dark or light ink for text sitting on `bg`. */
function inkOn(bg: string | undefined, alpha = 1) {
  const hex = bg ?? C.surface;
  const n = parseInt(hex.slice(1, 7), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0');
  return lum > 0.6 ? `#16120B${a}` : `#F2EFE9${a}`;
}

function SectionTitle({ title, count, limit }: { title: string; count: number; limit: number }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionDetail}>
        {count}/{limit}
      </Text>
    </View>
  );
}

function AddTile({ label, busy, onPress, style }: { label?: string; busy: boolean; onPress: () => void; style: object }) {
  return (
    <Pressable onPress={onPress} disabled={busy} style={[style, styles.addTile]} accessibilityLabel={label ?? 'Add'}>
      {busy ? (
        <ActivityIndicator color={C.text} />
      ) : (
        <>
          <Icon name={{ ios: 'plus', android: 'add' }} size={20} color={C.textDim} />
          {label && <Text style={styles.addTileText}>{label}</Text>}
        </>
      )}
    </Pressable>
  );
}

/** Transparency checkerboard behind logos and stickers. */
function Checker() {
  const cols = 12;
  const cells = Array.from({ length: cols * 9 }, (_, i) => i);
  return (
    <View style={[StyleSheet.absoluteFill, styles.checker]}>
      {cells.map((i) => (
        <View key={i} style={[styles.checkerCell, (Math.floor(i / cols) + i) % 2 === 0 && { backgroundColor: '#FFFFFF0D' }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, height: 52 },
  headerTitle: { ...T.display, fontSize: 24 },
  board: {
    borderRadius: R.lg,
    padding: 18,
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.lineSoft,
  },
  boardTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  boardLogo: { width: 56, height: 56, borderRadius: 14 },
  boardLogoEmpty: { backgroundColor: '#00000022', alignItems: 'center', justifyContent: 'center' },
  boardName: { ...T.display, fontSize: 28 },
  boardHandle: { ...T.medium, fontSize: 14 },
  boardTagline: { ...T.body, fontSize: 14, lineHeight: 20 },
  boardPalette: { flexDirection: 'row', gap: 6 },
  boardChip: { flex: 1, height: 26, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: '#FFFFFF33' },
  section: { gap: 14 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  sectionTitle: { ...T.display, fontSize: 26 },
  sectionDetail: { ...T.medium, color: C.textDim, fontSize: 14, fontVariant: ['tabular-nums'] },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  swatchWrap: { alignItems: 'center', gap: 6 },
  swatch: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FFFFFF33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchSuggested: { borderWidth: 1.5, borderColor: C.accent, borderStyle: 'dashed' },
  swatchHex: { ...T.medium, color: C.textDim, fontSize: 10, fontVariant: ['tabular-nums'] },
  suggested: { gap: 10, padding: 14, borderRadius: R.md, backgroundColor: C.surface },
  suggestedTitle: { ...T.medium, color: C.textDim, fontSize: 12 },
  addColor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: R.md,
    paddingLeft: 8,
    paddingRight: 8,
    height: 58,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.lineSoft,
  },
  draftDot: { width: 22, height: 22, borderRadius: 11 },
  draftEmpty: { borderWidth: 1, borderColor: C.line, borderStyle: 'dashed' },
  draftText: { ...T.medium, color: C.textDim, fontSize: 14, fontVariant: ['tabular-nums'] },
  link: { ...T.medium, color: C.accent, fontSize: 14 },
  inlineAction: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  pill: { height: 38, paddingHorizontal: 16, borderRadius: R.pill, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },
  pillText: { ...T.semibold, color: C.bg, fontSize: 14 },
  logos: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  logo: {
    width: 104,
    height: 78,
    borderRadius: R.md,
    backgroundColor: C.surface,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.lineSoft,
  },
  logoImage: { ...StyleSheet.absoluteFill, margin: 10 },
  assets: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  asset: {
    width: 76,
    height: 76,
    borderRadius: 18,
    backgroundColor: C.surface,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.lineSoft,
  },
  addTile: { alignItems: 'center', justifyContent: 'center', gap: 4, borderStyle: 'dashed', borderColor: C.line, borderWidth: 1 },
  addTileText: { ...T.medium, color: C.textDim, fontSize: 12 },
  checker: { flexDirection: 'row', flexWrap: 'wrap' },
  checkerCell: { width: `${100 / 12}%`, height: `${100 / 9}%` },
  hint: { ...T.body, color: C.textFaint, fontSize: 12, lineHeight: 17 },
  card: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.lineSoft,
    overflow: 'hidden',
  },
  fontRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 56 },
  fontDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  fontSample: { color: C.text, fontSize: 21, flex: 1, marginRight: 12 },
  fontRole: { ...T.medium, color: C.textDim, fontSize: 13 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: C.accent, borderColor: C.accent },
  tip: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: R.lg,
    backgroundColor: C.accent + '14',
    borderWidth: 1,
    borderColor: C.accent + '40',
  },
  tipText: { ...T.body, color: C.text, fontSize: 13, lineHeight: 19, flex: 1 },
});
