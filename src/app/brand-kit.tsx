import { getDocumentAsync } from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ColorWell } from '@/components/color-well';
import { useNamePrompt } from '@/components/menu-sheet';
import { Icon, IconButton, PressableScale } from '@/components/ui';
import {
  BRAND_FONT_LIMIT,
  addBrandColor,
  addBrandLogo,
  brandLogoUri,
  normalizeHex,
  removeBrandColor,
  removeBrandLogo,
  toggleBrandFont,
  useBrandColors,
  useBrandFonts,
  useBrandLogos,
} from '@/lib/brand';
import { allFonts, importFont, useFontsVersion } from '@/lib/fonts';
import { C, R, T } from '@/theme';

/** Brand colours, logos and fonts, all in one place. */
export default function BrandKitScreen() {
  const insets = useSafeAreaInsets();
  const colors = useBrandColors();
  const logos = useBrandLogos();
  const fonts = useBrandFonts();
  useFontsVersion();
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prompt, promptElement] = useNamePrompt();

  const saveDraft = () => {
    if (!draft) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addBrandColor(draft);
    setDraft(null);
  };

  const enterHex = () =>
    prompt('Add a colour (hex)', '', (value) => {
      const hex = normalizeHex(value);
      if (hex) addBrandColor(hex);
      else Alert.alert('Not a colour', 'Use a hex code like #D9C29C.');
    });

  const askRemoveColor = (c: string) =>
    Alert.alert(`Remove ${c}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeBrandColor(c) },
    ]);

  const importLogo = async (from: 'photos' | 'files') => {
    try {
      let picked: { uri: string; size?: { width: number; height: number } } | null = null;
      if (from === 'photos') {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 1,
          // Keep PNGs as PNGs so transparent logos stay transparent.
          preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
        });
        if (result.canceled || !result.assets[0]) return;
        const a = result.assets[0];
        picked = { uri: a.uri, size: { width: a.width, height: a.height } };
      } else {
        const result = await getDocumentAsync({ type: ['image/png', 'image/jpeg', 'image/heic', 'image/webp'], copyToCacheDirectory: true });
        if (result.canceled || !result.assets[0]) return;
        picked = { uri: result.assets[0].uri };
      }
      setBusy(true);
      await addBrandLogo(picked.uri, picked.size);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Could not add the logo', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const addLogo = () =>
    Alert.alert('Add a logo', 'A PNG with a transparent background works best.', [
      { text: 'From Photos', onPress: () => importLogo('photos') },
      { text: 'From Files', onPress: () => importLogo('files') },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const askRemoveLogo = (id: string) =>
    Alert.alert('Remove this logo?', 'Carousels that already use it keep their copy.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeBrandLogo(id) },
    ]);

  const toggleFont = (id: Parameters<typeof toggleBrandFont>[0]) => {
    Haptics.selectionAsync();
    if (!toggleBrandFont(id)) Alert.alert('Brand kit is full', `Keep up to ${BRAND_FONT_LIMIT} brand fonts. Remove one first.`);
  };

  const addFont = async () => {
    try {
      const id = await importFont();
      if (id) toggleBrandFont(id);
    } catch (e) {
      Alert.alert('Could not add the font', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <IconButton label="Back" icon={{ ios: 'chevron.left', android: 'arrow_back' }} onPress={() => router.back()} />
        <Text style={styles.headerTitle}>Brand kit</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40, gap: 28 }}>
        <Text style={styles.intro}>
          Your kit shows up first wherever you pick colours, in the text editor, and under Shapes → Brand in the editor.
        </Text>

        <View style={styles.section}>
          <SectionTitle title="Colours" detail={`${colors.length}`} />
          <View style={styles.swatches}>
            {colors.map((c) => (
              <Pressable
                key={c}
                onLongPress={() => askRemoveColor(c)}
                onPress={() => askRemoveColor(c)}
                accessibilityLabel={`${c}, tap to remove`}
                style={styles.swatchWrap}>
                <View style={[styles.swatch, { backgroundColor: c }]} />
                <Text style={styles.swatchHex}>{c}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.addColor}>
            <ColorWell value={draft} onChange={setDraft} />
            <View style={[styles.draftDot, { backgroundColor: draft ?? 'transparent' }, !draft && styles.draftEmpty]} />
            <Text style={styles.draftText}>{draft ?? 'Pick a colour'}</Text>
            <View style={{ flex: 1 }} />
            <Pressable onPress={enterHex} hitSlop={8}>
              <Text style={styles.link}>Hex…</Text>
            </Pressable>
            <PressableScale onPress={saveDraft} disabled={!draft} style={[styles.pill, !draft && { opacity: 0.4 }]}>
              <Text style={styles.pillText}>Save</Text>
            </PressableScale>
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle title="Logos" detail={`${logos.length}`} />
          <View style={styles.logos}>
            {logos.map((l) => (
              <Pressable key={l.id} onLongPress={() => askRemoveLogo(l.id)} onPress={() => askRemoveLogo(l.id)} style={styles.logo}>
                <Checker />
                <Image source={{ uri: brandLogoUri(l) }} style={styles.logoImage} contentFit="contain" />
              </Pressable>
            ))}
            <Pressable onPress={addLogo} disabled={busy} style={[styles.logo, styles.logoAdd]} accessibilityLabel="Add a logo">
              {busy ? (
                <ActivityIndicator color={C.text} />
              ) : (
                <>
                  <Icon name={{ ios: 'plus', android: 'add' }} size={20} color={C.textDim} />
                  <Text style={styles.logoAddText}>Add logo</Text>
                </>
              )}
            </Pressable>
          </View>
          <Text style={styles.hint}>Tap a logo to remove it. In the editor, add logos from Shapes → Brand.</Text>
        </View>

        <View style={styles.section}>
          <SectionTitle title="Fonts" detail={`${fonts.length} of ${BRAND_FONT_LIMIT}`} />
          <View style={styles.fontList}>
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
          <Pressable onPress={addFont} hitSlop={8} style={styles.importFont}>
            <Icon name={{ ios: 'plus.circle', android: 'add_circle' }} size={16} color={C.accent} />
            <Text style={styles.link}>Import a font (.ttf or .otf)</Text>
          </Pressable>
        </View>
      </ScrollView>
      {promptElement}
    </View>
  );
}

function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionDetail}>{detail}</Text>
    </View>
  );
}

/** Transparency checkerboard behind logos. */
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
  intro: { ...T.body, color: C.textDim, fontSize: 14, lineHeight: 20 },
  section: { gap: 14 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { ...T.display, fontSize: 26 },
  sectionDetail: { ...T.medium, color: C.textDim, fontSize: 13 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  swatchWrap: { alignItems: 'center', gap: 6 },
  swatch: { width: 52, height: 52, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: '#FFFFFF33' },
  swatchHex: { ...T.medium, color: C.textDim, fontSize: 10, fontVariant: ['tabular-nums'] },
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
  logoAdd: { alignItems: 'center', justifyContent: 'center', gap: 4, borderStyle: 'dashed', borderColor: C.line, borderWidth: 1 },
  logoAddText: { ...T.medium, color: C.textDim, fontSize: 12 },
  checker: { flexDirection: 'row', flexWrap: 'wrap' },
  checkerCell: { width: `${100 / 12}%`, height: `${100 / 9}%` },
  hint: { ...T.body, color: C.textFaint, fontSize: 12, lineHeight: 17 },
  fontList: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.lineSoft,
    overflow: 'hidden',
  },
  fontRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 56 },
  fontDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  fontSample: { color: C.text, fontSize: 21, flex: 1, marginRight: 12 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: C.accent, borderColor: C.accent },
  importFont: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
});
