import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/brand-mark';
import { CollectionCarousel } from '@/components/collection-banner';
import { DOCK_SPACE } from '@/components/dock';
import { ProjectCard } from '@/components/project-card';
import { TemplateCard, startFromTemplate } from '@/components/template-thumb';
import { Eyebrow, Icon, IconButton, PressableScale } from '@/components/ui';
import { useFavorites } from '@/lib/favorites';
import { type ProjectSummary, listProjects } from '@/lib/projects';
import { getInterests, hasOnboarded, takeSampleRequest } from '@/lib/settings';
import { useMyTemplates } from '@/lib/my-templates';
import { TEMPLATES, type Template, featured, forYou, useTemplates } from '@/lib/templates';
import { useUi } from '@/lib/ui-state';
import { C, R, T } from '@/theme';

const RECENT = 6;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const favorites = useFavorites();
  const templates = useTemplates();
  const mine = useMyTemplates();
  const openNew = () => useUi.getState().setNewProject(true);

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

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 18, paddingHorizontal: 20, paddingBottom: insets.bottom + DOCK_SPACE, gap: 34 }}>
      <Animated.View entering={FadeInDown.duration(500)} style={styles.hero}>
        <BrandMark width={66} />
        <Text style={styles.wordmark}>Seam</Text>
        <Text style={styles.tagline}>Carousels without edges.</Text>
        <View style={styles.search}>
          <IconButton
            label="Search templates"
            tone="filled"
            icon={{ ios: 'magnifyingglass', android: 'search' }}
            onPress={() => router.push({ pathname: '/templates', params: { search: '1' } })}
          />
        </View>
      </Animated.View>

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

      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <PressableScale onPress={() => router.push('/photos')} scaleTo={0.98} style={styles.photosCard}>
          <View style={styles.photosIcon}>
            <Icon name={{ ios: 'photo.stack', android: 'photo_library' }} size={20} color={C.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.startTitle}>Start from photos</Text>
            <Text style={styles.startDetail}>Pick your photos; Seam suggests the layouts that fit them.</Text>
          </View>
          <Icon name={{ ios: 'chevron.right', android: 'chevron_right' }} size={14} color={C.textFaint} />
        </PressableScale>
      </Animated.View>

      {recent.length > 0 && (
        <Animated.View entering={FadeInDown.delay(80).duration(500)} style={{ gap: 14 }}>
          <SectionHeader title="Recent" onSeeAll={() => router.navigate('/projects')} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -20 }}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}>
            {recent.map((p) => (
              <ProjectCard key={p.doc.id} project={p} width={132} onPress={() => router.push(`/editor/${p.doc.id}`)} />
            ))}
          </ScrollView>
        </Animated.View>
      )}

      <Animated.View entering={FadeInDown.delay(140).duration(500)} style={{ gap: 14 }}>
        <Eyebrow>Collections</Eyebrow>
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
    </ScrollView>
  );
}

function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll: () => void }) {
  return (
    <View style={styles.sectionRow}>
      <Eyebrow>{title}</Eyebrow>
      <Pressable onPress={onSeeAll} hitSlop={10}>
        <Text style={styles.link}>See all</Text>
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
    <View style={{ gap: 14 }}>
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
  hero: { gap: 2 },
  search: { position: 'absolute', top: 0, right: -6 },
  wordmark: { ...T.display, fontSize: 64, letterSpacing: -1, lineHeight: 70, marginTop: 14 },
  tagline: { ...T.displayItalic, color: C.textDim, fontSize: 21, marginTop: 2 },
  photosCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: R.lg,
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.lineSoft,
  },
  photosIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.accent + '1F', alignItems: 'center', justifyContent: 'center' },
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
  link: { ...T.medium, color: C.accent, fontSize: 13 },
});
