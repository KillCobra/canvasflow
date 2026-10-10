import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/brand-mark';
import { CollectionCarousel } from '@/components/collection-banner';
import { useNamePrompt } from '@/components/menu-sheet';
import { ProjectMenu } from '@/components/project-menu';
import { ProjectGridSkeleton } from '@/components/skeleton';
import { TemplateCard, startFromTemplate } from '@/components/template-thumb';
import { Chip, Eyebrow, Icon, IconButton, PressableScale } from '@/components/ui';
import { useFavorites } from '@/lib/favorites';
import { releaseImages } from '@/lib/images';
import {
  type Folder,
  type ProjectSummary,
  createDoc,
  createFolder,
  deleteFolder,
  deleteProject,
  duplicateProject,
  listFolders,
  listProjects,
  moveToFolder,
  renameFolder,
  renameProject,
  saveProject,
} from '@/lib/projects';
import { getInterests, hasOnboarded, takeSampleRequest } from '@/lib/settings';
import { TEMPLATES, type Template, featured, forYou, useTemplates } from '@/lib/templates';
import { ASPECTS, type AspectId, SLIDE_WIDTH } from '@/lib/types';
import { C, R, T } from '@/theme';

const GAP = 14;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [aspect, setAspect] = useState<AspectId>('4:5');
  const [prompt, promptElement] = useNamePrompt();
  const favorites = useFavorites();
  const templates = useTemplates();

  const refresh = useCallback(() => {
    listProjects().then(setProjects);
    setFolders(listFolders());
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

  // A folder that was deleted elsewhere falls back to All.
  const folder = folders.find((f) => f.id === folderId) ?? null;
  const visible = projects?.filter((p) => !folder || p.doc.folder === folder.id) ?? null;

  const create = () => {
    const doc = createDoc(aspect);
    // New carousels land in the folder being looked at.
    if (folder) doc.folder = folder.id;
    saveProject(doc, { create: true });
    router.push(`/editor/${doc.id}`);
  };

  const rename = (p: ProjectSummary) =>
    prompt('Rename', p.doc.name, (name) => renameProject(p.doc.id, name).then(refresh));

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

  /** Makes a folder; with a project, files it there, otherwise opens the new folder. */
  const newFolder = (projectId?: string) =>
    prompt('New folder', '', (name) => {
      const created = createFolder(name);
      if (projectId) moveToFolder(projectId, created.id).then(refresh);
      else {
        setFolderId(created.id);
        refresh();
      }
    });

  const folderActions = (f: Folder) =>
    Alert.alert(f.name, undefined, [
      {
        text: 'Rename',
        onPress: () =>
          prompt('Rename folder', f.name, (name) => {
            renameFolder(f.id, name);
            refresh();
          }),
      },
      {
        text: 'Delete folder',
        style: 'destructive',
        onPress: () =>
          Alert.alert(`Delete “${f.name}”?`, 'Its carousels move back to All. Nothing is deleted.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                setFolderId(null);
                deleteFolder(f.id).then(refresh);
              },
            },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const cardW = (width - 20 * 2 - GAP) / 2;
  const picks = forYou(templates, interests);
  const suggested = (picks.length ? picks : featured(templates)).slice(0, 8);
  const favoriteTemplates = favorites
    .map((id) => templates.find((t) => t.id === id))
    .filter((t): t is Template => !!t);
  const count = (id: string | null) => projects?.filter((p) => !id || p.doc.folder === id).length ?? 0;
  // The section shows while loading (over the skeleton) and whenever there's something to file.
  const showLibrary = !projects || projects.length > 0 || folders.length > 0;

  const header = (
    <View style={{ gap: 34, marginBottom: 26 }}>
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
          <Text style={styles.createText}>{folder ? `New carousel in ${folder.name}` : 'New carousel'}</Text>
        </PressableScale>
      </Animated.View>

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

      {showLibrary && (
        <Animated.View entering={FadeInDown.delay(260).duration(500)} style={{ gap: 14 }}>
          <View style={styles.sectionRow}>
            <Eyebrow>Your carousels</Eyebrow>
            {folder && (
              <Pressable onPress={() => folderActions(folder)} hitSlop={10} accessibilityLabel={`${folder.name} options`}>
                <Icon name={{ ios: 'ellipsis.circle', android: 'more_horiz' }} size={20} color={C.textDim} />
              </Pressable>
            )}
          </View>
          {projects && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -20 }}
              contentContainerStyle={styles.folders}>
              <Chip
                label={<ChipText label="All" count={count(null)} selected={!folder} />}
                selected={!folder}
                onPress={() => setFolderId(null)}
              />
              {folders.map((f) => (
                <Chip
                  key={f.id}
                  label={<ChipText label={f.name} count={count(f.id)} selected={folder?.id === f.id} />}
                  selected={folder?.id === f.id}
                  onPress={() => (folder?.id === f.id ? folderActions(f) : setFolderId(f.id))}
                />
              ))}
              <Chip
                label={
                  <View style={styles.newFolder}>
                    <Icon name={{ ios: 'plus', android: 'add' }} size={12} color={C.textDim} />
                    <Text style={[styles.chipText, { color: C.textDim }]}>New folder</Text>
                  </View>
                }
                onPress={() => newFolder()}
              />
            </ScrollView>
          )}
        </Animated.View>
      )}
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 18 }]}>
      <FlatList
        data={visible ?? []}
        keyExtractor={(p) => p.doc.id}
        numColumns={2}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32, gap: 22 }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          !visible ? (
            <ProjectGridSkeleton cardWidth={cardW} gap={GAP} />
          ) : folder ? (
            <Text style={styles.empty}>
              Nothing in {folder.name} yet. Long-press a carousel and choose Move to folder.
            </Text>
          ) : (
            <Text style={styles.empty}>Your carousels will live here. Start blank or pick a template above.</Text>
          )
        }
        renderItem={({ item, index }) => {
          return (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(450)}>
              <ProjectMenu
                title={item.doc.name}
                onRename={() => rename(item)}
                onDuplicate={() => duplicateProject(item.doc.id).then(refresh)}
                onDelete={() => remove(item)}
                folders={folders}
                folder={item.doc.folder}
                onMove={(f) => moveToFolder(item.doc.id, f).then(refresh)}
                onNewFolder={() => newFolder(item.doc.id)}>
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
      {promptElement}
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
  return (
    <View style={{ gap: 14 }}>
      <View style={styles.sectionRow}>
        <Eyebrow>{title}</Eyebrow>
        <Pressable onPress={onSeeAll} hitSlop={10}>
          <Text style={styles.link}>See all</Text>
        </Pressable>
      </View>
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

function ChipText({ label, count, selected }: { label: string; count: number; selected: boolean }) {
  return (
    <Text style={[styles.chipText, selected && { color: C.bg }]} numberOfLines={1}>
      {label}
      <Text style={{ color: selected ? '#0A0A0A80' : C.textFaint }}>{`  ${count}`}</Text>
    </Text>
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
  search: { position: 'absolute', top: 0, right: -6 },
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
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 20 },
  link: { ...T.medium, color: C.accent, fontSize: 13 },
  folders: { paddingHorizontal: 20, gap: 8, alignItems: 'center' },
  chipText: { ...T.medium, fontSize: 13, color: C.text },
  newFolder: { flexDirection: 'row', alignItems: 'center', gap: 5 },
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
