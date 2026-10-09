import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/brand-mark';
import { ProjectMenu } from '@/components/project-menu';
import { TemplateCard, startFromTemplate } from '@/components/template-thumb';
import { Eyebrow, Icon, PressableScale } from '@/components/ui';
import { releaseImages } from '@/lib/images';
import {
  type ProjectSummary,
  createDoc,
  deleteProject,
  duplicateProject,
  listProjects,
  renameProject,
  saveProject,
} from '@/lib/projects';
import { hasOnboarded, takeSampleRequest } from '@/lib/settings';
import { TEMPLATES, useTemplates } from '@/lib/templates';
import { ASPECTS, type AspectId, SLIDE_WIDTH } from '@/lib/types';
import { C, R, T } from '@/theme';

const GAP = 14;
const FEATURED = ['polaroid-wall', 'photo-dump', 'circles', 'panorama', 'headline', 'arches'];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [aspect, setAspect] = useState<AspectId>('4:5');

  const refresh = useCallback(() => {
    listProjects().then(setProjects);
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

  const create = () => {
    const doc = createDoc(aspect);
    saveProject(doc, { create: true });
    router.push(`/editor/${doc.id}`);
  };

  const rename = (p: ProjectSummary) =>
    Alert.prompt(
      'Rename',
      undefined,
      (name) => {
        if (name.trim()) renameProject(p.doc.id, name.trim()).then(refresh);
      },
      'plain-text',
      p.doc.name,
    );

  const remove = (p: ProjectSummary) =>
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
    ]);

  const cardW = (width - 20 * 2 - GAP) / 2;
  const templates = useTemplates();
  const featured = FEATURED.map((id) => templates.find((t) => t.id === id)).filter((t) => !!t);

  const header = (
    <View style={{ gap: 34, marginBottom: 26 }}>
      <Animated.View entering={FadeInDown.duration(500)} style={styles.hero}>
        <BrandMark width={66} />
        <Text style={styles.wordmark}>Seam</Text>
        <Text style={styles.tagline}>Carousels without edges.</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(80).duration(500)} style={styles.newCard}>
        <Eyebrow>Start blank</Eyebrow>
        <View style={styles.aspects}>
          {(Object.keys(ASPECTS) as AspectId[]).map((id) => {
            const h = ASPECTS[id].height;
            const selected = id === aspect;
            return (
              <Pressable key={id} onPress={() => setAspect(id)} style={styles.aspect} hitSlop={6}>
                <View
                  style={[
                    styles.aspectShape,
                    { height: (26 * h) / SLIDE_WIDTH },
                    selected && { borderColor: C.text, backgroundColor: C.surfaceHi },
                  ]}
                />
                <Text style={[styles.aspectLabel, selected && { color: C.text }]}>{id}</Text>
              </Pressable>
            );
          })}
        </View>
        <PressableScale onPress={create} style={styles.createButton}>
          <Icon name={{ ios: 'plus', android: 'add' }} size={16} color={C.bg} />
          <Text style={styles.createText}>New carousel</Text>
        </PressableScale>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(160).duration(500)} style={{ gap: 14 }}>
        <View style={styles.sectionRow}>
          <Eyebrow>Templates</Eyebrow>
          <Pressable onPress={() => router.push('/templates')} hitSlop={10}>
            <Text style={styles.link}>See all</Text>
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -20 }}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 18 }}>
          {featured.map((t) => (
            <TemplateCard key={t.id} template={t} height={150} maxWidth={width * 0.72} onPress={() => startFromTemplate(t)} />
          ))}
        </ScrollView>
      </Animated.View>

      {projects && projects.length > 0 && (
        <Animated.View entering={FadeInDown.delay(240).duration(500)}>
          <Eyebrow>Your carousels</Eyebrow>
        </Animated.View>
      )}
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 18 }]}>
      <FlatList
        data={projects ?? []}
        keyExtractor={(p) => p.doc.id}
        numColumns={2}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32, gap: 22 }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          projects ? (
            <Text style={styles.empty}>
              Your carousels will live here. Start blank or pick a template above.
            </Text>
          ) : null
        }
        renderItem={({ item, index }) => {
          return (
            <Animated.View entering={FadeInDown.delay(280 + index * 40).duration(450)}>
              <ProjectMenu
                title={item.doc.name}
                onRename={() => rename(item)}
                onDuplicate={() => duplicateProject(item.doc.id).then(refresh)}
                onDelete={() => remove(item)}>
              <PressableScale
                onPress={() => router.push(`/editor/${item.doc.id}`)}
                scaleTo={0.97}
                style={{ width: cardW }}>
                <View style={[styles.thumb, { height: cardW * 1.25 }]}>
                  {item.thumb ? (
                    <Image
                      source={{ uri: item.thumb }}
                      cachePolicy="none"
                      recyclingKey={`${item.doc.id}-${item.doc.updatedAt}`}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      transition={200}
                    />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: C.surfaceHi }]} />
                  )}
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.doc.slideCount}</Text>
                  </View>
                </View>
                <Text style={styles.cardName} numberOfLines={1}>
                  {item.doc.name}
                </Text>
                <Text style={styles.cardMeta}>
                  {item.doc.aspect} · {timeAgo(item.doc.updatedAt)}
                </Text>
              </PressableScale>
              </ProjectMenu>
            </Animated.View>
          );
        }}
      />
    </View>
  );
}

function timeAgo(t: number) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  hero: { gap: 2 },
  wordmark: { ...T.display, fontSize: 64, letterSpacing: -1, lineHeight: 70, marginTop: 14 },
  tagline: { ...T.displayItalic, color: C.textDim, fontSize: 21, marginTop: 2 },
  newCard: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 18,
    gap: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.lineSoft,
  },
  aspects: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  aspect: { alignItems: 'center', gap: 8, flex: 1 },
  aspectShape: { width: 26, borderRadius: 5, borderWidth: 1.5, borderColor: C.line },
  aspectLabel: { ...T.medium, color: C.textDim, fontSize: 12 },
  createButton: {
    height: 50,
    borderRadius: R.pill,
    backgroundColor: C.text,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  createText: { ...T.semibold, color: C.bg, fontSize: 15 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { ...T.medium, color: C.accent, fontSize: 13 },
  empty: { ...T.body, color: C.textDim, fontSize: 14, lineHeight: 21 },
  thumb: { borderRadius: R.md, overflow: 'hidden', backgroundColor: C.surface },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#0A0A0AB3',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: { ...T.semibold, color: C.text, fontSize: 11 },
  cardName: { ...T.display, fontSize: 18, marginTop: 10 },
  cardMeta: { ...T.medium, color: C.textDim, fontSize: 12, marginTop: 2 },
});
