import { Canvas, Group, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/brand-mark';
import { CollectionCarousel } from '@/components/collection-banner';
import { BackgroundFill } from '@/components/doc-renderer';
import { DOCK_SPACE } from '@/components/dock';
import { BrushSwash, HeroCollage } from '@/components/home-hero';
import { useNamePrompt } from '@/components/menu-sheet';
import { ShelfProjectCard } from '@/components/project-card';
import { TemplateCard, startFromTemplate } from '@/components/template-thumb';
import { Icon, IconButton, PressableScale } from '@/components/ui';
import { useFavorites } from '@/lib/favorites';
import { releaseImages } from '@/lib/images';
import { type ProjectSummary, deleteProject, duplicateProject, listProjects, renameProject } from '@/lib/projects';
import { getInterests, hasOnboarded, takeSampleRequest } from '@/lib/settings';
import { useMyTemplates } from '@/lib/my-templates';
import { TEMPLATES, type Template, featured, forYou, useTemplates } from '@/lib/templates';
import { textureBackground } from '@/lib/textures';
import { useUi } from '@/lib/ui-state';
import { C, R, T } from '@/theme';

const RECENT = 6;
const INK = '#16120B';
const PAPER = textureBackground('paper', '#F1EADF');
const PHOTOS_CARD_H = 104;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const favorites = useFavorites();
  const templates = useTemplates();
  const mine = useMyTemplates();
  const [prompt, promptElement] = useNamePrompt();
  const openNew = () => useUi.getState().setNewProject(true);
  // Once scrolled, a scrim keeps the status bar readable over the cards.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });
  const scrim = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.get(), [20, 90], [0, 1], 'clamp') }));

  const refresh = useCallback(() => {
    listProjects().then(setProjects);
    setInterests(getInterests());
    // Onboarding's "open a sample" lands here once the intro has closed.
    if (takeSampleRequest()) {
      const template = TEMPLATES.find((t) => t.id === 'polaroid-wall') ?? TEMPLATES[0];
      startFromTemplate({ ...template, name: 'My first carousel' });
    }
  }, []);
  useFocusEffect(refresh);

  // First launch: the introduction.
  useEffect(() => {
    if (!hasOnboarded()) router.push('/onboarding');
  }, []);

  const picks = forYou(templates, interests);
  const suggested = (picks.length ? picks : featured(templates)).slice(0, 8);
  const favoriteTemplates = favorites
    .map((id) => templates.find((t) => t.id === id))
    .filter((t): t is Template => !!t);
  const recent = projects?.slice(0, RECENT) ?? [];

  const actionsFor = (p: ProjectSummary) => [
    {
      label: 'Rename',
      icon: { ios: 'pencil', android: 'edit' } as const,
      onPress: () => prompt('Rename', p.doc.name, (name) => renameProject(p.doc.id, name).then(refresh)),
    },
    {
      label: 'Duplicate',
      icon: { ios: 'plus.square.on.square', android: 'content_copy' } as const,
      onPress: () => duplicateProject(p.doc.id).then(refresh),
    },
    {
      label: 'Delete',
      icon: { ios: 'trash', android: 'delete' } as const,
      destructive: true,
      onPress: () =>
        Alert.alert(`Delete “${p.doc.name}”?`, 'This removes the carousel and its imported media.', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              deleteProject(p.doc.id);
              releaseImages(p.doc.id);
              refresh();
            },
          },
        ]),
    },
  ];

  const heroH = insets.top + 262;
  const cardW = width - 40;
  const shelfW = Math.round((width - 40) * 0.47);
  const scrimH = insets.top + 28;

  return (
    <View style={styles.screen}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={styles.screen}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + DOCK_SPACE, gap: 34 }}>
        <View style={[styles.hero, { paddingTop: insets.top + 14 }]}>
          <HeroCollage width={Math.round(width * 0.68)} height={heroH} />
          <Animated.View entering={FadeInDown.duration(500)} style={styles.heroText}>
            <BrandMark width={60} />
            <Text style={styles.wordmark}>Seam</Text>
            <Animated.View entering={FadeIn.delay(350).duration(600)} style={styles.swash}>
              <BrushSwash width={150} />
            </Animated.View>
            <Text style={styles.tagline}>Turn your photos{'\n'}into beautiful stories.</Text>
            <Text style={styles.motto}>Carousels without edges.</Text>
          </Animated.View>
          <View style={[styles.search, { top: insets.top + 4 }]}>
            <IconButton
              label="Search templates"
              tone="filled"
              icon={{ ios: 'magnifyingglass', android: 'search' }}
              onPress={() => router.push({ pathname: '/templates', params: { search: '1' } })}
            />
          </View>
        </View>

        {projects && recent.length === 0 && (
          <Animated.View entering={FadeInDown.delay(80).duration(500)}>
            <PressableScale onPress={openNew} scaleTo={0.98} style={styles.startCard}>
              <View style={styles.startIcon}>
                <Icon name={{ ios: 'plus', android: 'add' }} size={22} color={C.accentInk} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.startTitle}>Make your first carousel</Text>
                <Text style={styles.startDetail}>Pick a format, or start from a template below.</Text>
              </View>
            </PressableScale>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.photosShadow}>
          <PressableScale
            onPress={() => router.push('/photos')}
            scaleTo={0.98}
            accessibilityRole="button"
            accessibilityLabel="Start from photos"
            style={styles.photosCard}>
            <Canvas style={[StyleSheet.absoluteFill, { width: cardW, height: PHOTOS_CARD_H }]} pointerEvents="none">
              {/* Paper at template scale, so its grain matches the templates'. */}
              <Group transform={[{ scale: 1 / 3 }]}>
                <BackgroundFill background={PAPER} width={cardW * 3} height={PHOTOS_CARD_H * 3} />
              </Group>
            </Canvas>
            <View style={styles.photosIcon}>
              <Icon name={{ ios: 'photo.on.rectangle', android: 'photo_library' }} size={26} color="#F1EADF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.photosTitle}>Start from photos</Text>
              <Text style={styles.photosDetail} numberOfLines={2}>
                Pick your photos and Seam suggests the perfect layouts.
              </Text>
            </View>
            <View style={styles.photosGo}>
              <Icon name={{ ios: 'arrow.right', android: 'arrow_forward' }} size={17} color="#F1EADF" />
            </View>
          </PressableScale>
        </Animated.View>

        {recent.length > 0 && (
          <Animated.View entering={FadeInDown.delay(80).duration(500)} style={{ gap: 16 }}>
            <SectionHeader title="Recent" onSeeAll={() => router.navigate('/projects')} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -20 }}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 16 }}>
              {recent.map((p) => (
                <ShelfProjectCard
                  key={p.doc.id}
                  project={p}
                  width={shelfW}
                  onPress={() => router.push(`/editor/${p.doc.id}`)}
                  actions={actionsFor(p)}
                />
              ))}
            </ScrollView>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(140).duration(500)} style={{ gap: 16 }}>
          <SectionHeader title="Collections" onSeeAll={() => router.push('/templates')} />
          <CollectionCarousel templates={templates} width={width} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
          <TemplateRow
            title={picks.length ? 'For you' : 'Featured'}
            templates={suggested}
            width={width}
            onSeeAll={() => router.push({ pathname: '/templates', params: picks.length ? { filter: 'foryou' } : {} })}
          />
        </Animated.View>

        {mine.length > 0 && (
          <Animated.View entering={FadeInDown.duration(400)}>
            <TemplateRow
              title="Your templates"
              templates={mine}
              width={width}
              onSeeAll={() => router.push({ pathname: '/templates', params: { filter: 'mine' } })}
            />
          </Animated.View>
        )}

        {favoriteTemplates.length > 0 && (
          <Animated.View entering={FadeInDown.duration(400)}>
            <TemplateRow
              title="Favorites"
              templates={favoriteTemplates}
              width={width}
              onSeeAll={() => router.push({ pathname: '/templates', params: { filter: 'favorites' } })}
            />
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(260).duration(500)}>
          <TemplateRow
            title="All templates"
            templates={templates.filter((t) => !suggested.includes(t) && !mine.includes(t)).slice(0, 10)}
            width={width}
            onSeeAll={() => router.push('/templates')}
          />
        </Animated.View>
      </Animated.ScrollView>

      <Animated.View pointerEvents="none" style={[styles.scrim, { height: scrimH }, scrim]}>
        <Canvas style={{ width, height: scrimH }}>
          <Rect x={0} y={0} width={width} height={scrimH}>
            <LinearGradient start={vec(0, 0)} end={vec(0, scrimH)} colors={[C.bg, C.bg + 'E6', C.bg + '00']} positions={[0, 0.6, 1]} />
          </Rect>
        </Canvas>
      </Animated.View>
      {promptElement}
    </View>
  );
}

function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll: () => void }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Pressable onPress={onSeeAll} hitSlop={10} accessibilityRole="button" accessibilityLabel={`See all ${title}`} style={styles.linkRow}>
        <Text style={styles.link}>See all</Text>
        <Icon name={{ ios: 'arrow.right', android: 'arrow_forward' }} size={13} color={C.accent} />
      </Pressable>
    </View>
  );
}

/** A titled, horizontally scrolling row of template cards. */
function TemplateRow({
  title,
  templates,
  width,
  onSeeAll,
}: {
  title: string;
  templates: Template[];
  width: number;
  onSeeAll: () => void;
}) {
  if (templates.length === 0) return null;
  return (
    <View style={{ gap: 16 }}>
      <SectionHeader title={title} onSeeAll={onSeeAll} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -20 }}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 18 }}>
        {templates.map((t) => (
          <TemplateCard key={t.id} template={t} height={150} maxWidth={width * 0.72} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0 },
  // Full-bleed, so the collage can run to the screen's edge and under the status bar.
  hero: { marginHorizontal: -20, paddingHorizontal: 20, marginBottom: -6 },
  heroText: { alignItems: 'flex-start', maxWidth: 230 },
  search: { position: 'absolute', right: 20 },
  wordmark: { ...T.display, fontSize: 70, letterSpacing: -1.5, lineHeight: 74, marginTop: 16 },
  swash: { marginTop: -2, marginLeft: 6 },
  tagline: { ...T.displayItalic, color: '#CFC9BF', fontSize: 24, lineHeight: 28, marginTop: 14 },
  motto: { ...T.medium, color: C.textDim, fontSize: 11, letterSpacing: 2.4, textTransform: 'uppercase', marginTop: 14 },
  photosShadow: {
    borderRadius: R.lg,
    shadowColor: '#E8DCC6',
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 4 },
  },
  photosCard: {
    height: PHOTOS_CARD_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    borderRadius: R.lg,
    overflow: 'hidden',
    backgroundColor: '#F1EADF',
  },
  photosIcon: { width: 60, height: 60, borderRadius: 17, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
  photosTitle: { ...T.display, color: INK, fontSize: 25, lineHeight: 28 },
  photosDetail: { ...T.body, color: '#6E675D', fontSize: 13, lineHeight: 18, marginTop: 3 },
  photosGo: { width: 44, height: 44, borderRadius: 22, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
  startCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: R.lg,
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.lineSoft,
  },
  startIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startTitle: { ...T.semibold, fontSize: 16 },
  startDetail: { ...T.body, color: C.textDim, fontSize: 13, marginTop: 2 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 20 },
  sectionTitle: { ...T.display, fontSize: 30, lineHeight: 34 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  link: { ...T.medium, color: C.accent, fontSize: 15 },
});
