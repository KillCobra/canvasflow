import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/brand-mark';
import { DOCK_SPACE } from '@/components/dock';
import { Row, Section } from '@/components/list';
import { useNamePrompt } from '@/components/menu-sheet';
import { Icon, IconButton, PressableScale } from '@/components/ui';
import { APP_VERSION, BUILD, RUNTIME } from '@/lib/app-info';
import { brandLogoUri, useBrandColors, useBrandFonts, useBrandLogos } from '@/lib/brand';
import { LATEST_NEWS } from '@/lib/changelog';
import { useFavorites } from '@/lib/favorites';
import { fontInfo } from '@/lib/fonts';
import { type ProjectSummary, listProjects } from '@/lib/projects';
import { updateSettings, useSettings } from '@/lib/settings';
import { C, R, T } from '@/theme';

/** "You": your name and numbers, the brand kit, What's New, settings and the app version. */
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const colors = useBrandColors();
  const logos = useBrandLogos();
  const fonts = useBrandFonts();
  const favorites = useFavorites();
  const [prompt, promptElement] = useNamePrompt();

  useFocusEffect(
    useCallback(() => {
      listProjects().then(setProjects);
    }, []),
  );

  const name = settings.name?.trim();
  const slides = projects.reduce((n, p) => n + p.doc.slideCount, 0);
  const since = settings.since ? new Date(settings.since) : new Date();
  const kitEmpty = colors.length === 0 && logos.length === 0 && fonts.length === 0;
  const unseenNews = settings.seenNews !== LATEST_NEWS;

  const editName = () => prompt('Your name', name ?? '', (value) => updateSettings({ name: value }));

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + DOCK_SPACE, gap: 26 }}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>You</Text>
        <IconButton label="Settings" tone="filled" icon={{ ios: 'gearshape', android: 'settings' }} onPress={() => router.push('/settings')} />
      </View>

      <Animated.View entering={FadeInDown.duration(450)} style={styles.card}>
        <Pressable onPress={editName} style={styles.identity} accessibilityRole="button" accessibilityLabel="Edit your name">
          <View style={styles.avatar}>
            {name ? (
              <Text style={styles.initials}>{initials(name)}</Text>
            ) : (
              <Icon name={{ ios: 'person.fill', android: 'person' }} size={26} color={C.accentInk} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {name || 'Add your name'}
            </Text>
            <Text style={styles.since}>
              Creating since {since.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </Text>
          </View>
          <Icon name={{ ios: 'pencil', android: 'edit' }} size={15} color={C.textDim} />
        </Pressable>
        <View style={styles.stats}>
          <Stat value={projects.length} label={projects.length === 1 ? 'Carousel' : 'Carousels'} />
          <View style={styles.statDivider} />
          <Stat value={slides} label="Slides" />
          <View style={styles.statDivider} />
          <Stat value={settings.exports ?? 0} label="Saved" />
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(60).duration(450)} style={{ gap: 10 }}>
        <PressableScale onPress={() => router.push('/brand-kit')} scaleTo={0.98} style={styles.kit}>
          <View style={styles.kitHeader}>
            <View style={styles.kitIcon}>
              <Icon name={{ ios: 'paintpalette.fill', android: 'palette' }} size={18} color={C.accentInk} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.kitTitle}>Brand kit</Text>
              <Text style={styles.kitDetail}>
                {kitEmpty
                  ? 'Save your colours, logos and fonts in one place'
                  : `${colors.length} ${colors.length === 1 ? 'colour' : 'colours'} · ${logos.length} ${logos.length === 1 ? 'logo' : 'logos'} · ${fonts.length} ${fonts.length === 1 ? 'font' : 'fonts'}`}
              </Text>
            </View>
            <Icon name={{ ios: 'chevron.right', android: 'chevron_right' }} size={14} color={C.textDim} />
          </View>
          {!kitEmpty && (
            <View style={styles.kitPreview}>
              {colors.slice(0, 7).map((c) => (
                <View key={c} style={[styles.kitColor, { backgroundColor: c }]} />
              ))}
              {logos.slice(0, 3).map((l) => (
                <View key={l.id} style={styles.kitLogo}>
                  <Image source={{ uri: brandLogoUri(l) }} style={StyleSheet.absoluteFill} contentFit="contain" />
                </View>
              ))}
              {fonts.slice(0, 2).map((f) => (
                <Text key={f} style={[styles.kitFont, { fontFamily: fontInfo(f).rn }]} numberOfLines={1}>
                  Aa
                </Text>
              ))}
            </View>
          )}
        </PressableScale>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(120).duration(450)}>
        <Section>
          <Row
            icon={{ ios: 'sparkles', android: 'auto_awesome' }}
            tint={C.accent}
            title="What’s new"
            detail="The latest in Seam"
            badge={unseenNews ? 'New' : undefined}
            onPress={() => router.push('/whats-new')}
          />
          <Row
            icon={{ ios: 'heart', android: 'favorite' }}
            title="Favorite templates"
            value={String(favorites.length)}
            onPress={() => router.push({ pathname: '/templates', params: { filter: 'favorites' } })}
          />
          <Row
            icon={{ ios: 'gearshape', android: 'settings' }}
            title="Settings"
            detail="Defaults, export, storage and cache"
            onPress={() => router.push('/settings')}
          />
          <Row
            icon={{ ios: 'hands.sparkles', android: 'volunteer_activism' }}
            title="Acknowledgements"
            detail="Photographers, typefaces and open source"
            onPress={() => router.push('/acknowledgements')}
          />
          <Row
            icon={{ ios: 'play.rectangle', android: 'slideshow' }}
            title="Replay the introduction"
            onPress={() => router.push('/onboarding')}
            last
          />
        </Section>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(180).duration(450)} style={styles.about}>
        <BrandMark width={44} />
        <Text style={styles.aboutName}>Seam</Text>
        <Text style={styles.aboutVersion}>
          Version {APP_VERSION} ({BUILD})
        </Text>
        <Text style={styles.aboutMeta}>{RUNTIME}</Text>
        <Text style={styles.aboutMeta}>No watermark, ever. Everything stays on your phone.</Text>
      </Animated.View>
      {promptElement}
    </ScrollView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...T.display, fontSize: 44, letterSpacing: -0.5 },
  card: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 18,
    gap: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.lineSoft,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { ...T.display, color: C.accentInk, fontSize: 26 },
  name: { ...T.display, fontSize: 26 },
  since: { ...T.body, color: C.textDim, fontSize: 13, marginTop: 2 },
  stats: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceHi, borderRadius: R.md, paddingVertical: 14 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { ...T.display, fontSize: 26, fontVariant: ['tabular-nums'] },
  statLabel: { ...T.medium, color: C.textDim, fontSize: 12 },
  statDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: C.line },
  kit: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 16,
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.lineSoft,
  },
  kitHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  kitIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kitTitle: { ...T.semibold, fontSize: 16 },
  kitDetail: { ...T.body, color: C.textDim, fontSize: 13, marginTop: 2 },
  kitPreview: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  kitColor: { width: 28, height: 28, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: '#FFFFFF33' },
  kitLogo: { width: 40, height: 28, borderRadius: 6, backgroundColor: C.surfaceHi, overflow: 'hidden' },
  kitFont: { fontSize: 20, color: C.text, paddingHorizontal: 4 },
  about: { alignItems: 'center', gap: 4, paddingTop: 8 },
  aboutName: { ...T.display, fontSize: 24, marginTop: 6 },
  aboutVersion: { ...T.medium, color: C.textDim, fontSize: 13 },
  aboutMeta: { ...T.body, color: C.textFaint, fontSize: 12, textAlign: 'center' },
});
