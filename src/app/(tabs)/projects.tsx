import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DOCK_SPACE } from '@/components/dock';
import { useNamePrompt } from '@/components/menu-sheet';
import { ProjectCard } from '@/components/project-card';
import { ProjectMenu } from '@/components/project-menu';
import { ProjectGridSkeleton } from '@/components/skeleton';
import { Chip, Icon, IconButton, PressableScale } from '@/components/ui';
import { releaseImages } from '@/lib/images';
import {
  type Folder,
  type ProjectSummary,
  createFolder,
  deleteFolder,
  deleteProject,
  duplicateProject,
  listFolders,
  listProjects,
  moveToFolder,
  renameFolder,
  renameProject,
} from '@/lib/projects';
import { useUi } from '@/lib/ui-state';
import { C, R, T } from '@/theme';

const GAP = 14;

type Sort = 'edited' | 'created' | 'name';
const SORT_LABEL: Record<Sort, string> = { edited: 'Recently edited', created: 'Newest first', name: 'Name' };

export default function ProjectsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [sort, setSort] = useState<Sort>('edited');
  const folderId = useUi((s) => s.folder);
  const setFolderId = useUi((s) => s.setFolder);
  const [prompt, promptElement] = useNamePrompt();

  const refresh = useCallback(() => {
    listProjects().then(setProjects);
    setFolders(listFolders());
  }, []);
  useFocusEffect(refresh);

  // A folder that was deleted elsewhere falls back to All.
  const folder = folders.find((f) => f.id === folderId) ?? null;
  const visible =
    projects
      ?.filter((p) => !folder || p.doc.folder === folder.id)
      .sort((a, b) =>
        sort === 'name'
          ? a.doc.name.localeCompare(b.doc.name)
          : sort === 'created'
            ? b.doc.createdAt - a.doc.createdAt
            : b.doc.updatedAt - a.doc.updatedAt,
      ) ?? null;

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

  const chooseSort = () =>
    Alert.alert('Sort by', undefined, [
      ...(Object.keys(SORT_LABEL) as Sort[]).map((s) => ({
        text: s === sort ? `✓ ${SORT_LABEL[s]}` : SORT_LABEL[s],
        onPress: () => setSort(s),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);

  const cardW = (width - 20 * 2 - GAP) / 2;
  const count = (id: string | null) => projects?.filter((p) => !id || p.doc.folder === id).length ?? 0;

  const header = (
    <View style={{ gap: 18, marginBottom: 8 }}>
      <View style={styles.titleRow}>
        <View>
          <Text style={styles.title}>Projects</Text>
          <Text style={styles.subtitle}>
            {projects ? `${projects.length} ${projects.length === 1 ? 'carousel' : 'carousels'} · ${SORT_LABEL[sort]}` : ' '}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {folder && (
            <IconButton
              label={`${folder.name} options`}
              tone="filled"
              icon={{ ios: 'ellipsis', android: 'more_horiz' }}
              onPress={() => folderActions(folder)}
            />
          )}
          <IconButton label="Grid planner" tone="filled" icon={{ ios: 'square.grid.3x3', android: 'grid_on' }} onPress={() => router.push('/grid')} />
          <IconButton label="Sort" tone="filled" icon={{ ios: 'arrow.up.arrow.down', android: 'sort' }} onPress={chooseSort} />
        </View>
      </View>

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
              <Icon name={{ ios: 'folder.badge.plus', android: 'create_new_folder' }} size={13} color={C.textDim} />
              <Text style={[styles.chipText, { color: C.textDim }]}>New folder</Text>
            </View>
          }
          onPress={() => newFolder()}
        />
      </ScrollView>
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <FlatList
        data={visible ?? []}
        keyExtractor={(p) => p.doc.id}
        numColumns={2}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + DOCK_SPACE, gap: 22 }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          !visible ? (
            <ProjectGridSkeleton cardWidth={cardW} gap={GAP} />
          ) : folder ? (
            <Text style={styles.empty}>Nothing in {folder.name} yet. Long-press a carousel and choose Move to folder.</Text>
          ) : (
            <View style={styles.emptyCard}>
              <Icon name={{ ios: 'square.stack', android: 'folder' }} size={30} color={C.textDim} />
              <Text style={styles.emptyTitle}>No carousels yet</Text>
              <Text style={styles.empty}>Tap + to start one. Everything you make is saved here automatically.</Text>
              <PressableScale onPress={() => useUi.getState().setNewProject(true)} style={styles.emptyButton}>
                <Text style={styles.emptyButtonText}>New carousel</Text>
              </PressableScale>
            </View>
          )
        }
        renderItem={({ item, index }) => (
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
              <ProjectCard project={item} width={cardW} onPress={() => router.push(`/editor/${item.doc.id}`)} />
            </ProjectMenu>
          </Animated.View>
        )}
      />
      {promptElement}
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  title: { ...T.display, fontSize: 44, letterSpacing: -0.5 },
  subtitle: { ...T.medium, color: C.textDim, fontSize: 13, marginTop: 2 },
  folders: { paddingHorizontal: 20, gap: 8, alignItems: 'center' },
  chipText: { ...T.medium, fontSize: 13, color: C.text },
  newFolder: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  empty: { ...T.body, color: C.textDim, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  emptyCard: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 36,
    paddingHorizontal: 24,
    borderRadius: R.lg,
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.lineSoft,
  },
  emptyTitle: { ...T.display, fontSize: 24 },
  emptyButton: {
    marginTop: 6,
    height: 44,
    paddingHorizontal: 22,
    borderRadius: R.pill,
    backgroundColor: C.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyButtonText: { ...T.semibold, color: C.bg, fontSize: 14 },
});
