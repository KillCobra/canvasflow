import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { ActionMenu } from '@/components/action-menu';
import { PostTimePicker } from '@/components/date-picker';
import { ProfileHeader } from '@/components/profile-mock';
import { ProjectCard } from '@/components/project-card';
import { Chip, Icon, IconButton, PressableScale } from '@/components/ui';
import {
  POSTED_LIMIT,
  type PostedPhoto,
  addPosted,
  addToPlan,
  isPlanned,
  markPosted,
  movePlannedTo,
  postedUri,
  prunePlan,
  removeFromPlan,
  removePosted,
  setPostTime,
  useGridPlan,
} from '@/lib/grid-plan';
import { postedPreviews, updateThumbnail } from '@/lib/export';
import { type ProjectSummary, createGridDoc, listProjects, saveProject } from '@/lib/projects';
import { MAX_GRID_ROWS, tileCount } from '@/lib/types';
import { C, R, T } from '@/theme';

const GAP = 2;

type Tile =
  | { key: string; kind: 'planned'; project: ProjectSummary; /** Tile within a grid puzzle. */ part: number; order: number }
  | { key: string; kind: 'posted'; photo: PostedPhoto };

/**
 * Plan the profile grid: queued carousels and grid puzzles on top (as the
 * newest posts), photos of what's already posted below, in a 3-column 3:4
 * grid like Instagram's. Shows the posting order and warns when a grid
 * puzzle would land out of line.
 */
export default function GridPlannerScreen() {
  // Drag-to-reorder runs in worklets; see EditorCanvas for why this opts out of the compiler.
  'use no memo';
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const plan = useGridPlan();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [numbers, setNumbers] = useState(true);
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [scheduling, setScheduling] = useState<ProjectSummary | null>(null);
  const [posting, setPosting] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTile, setDropTile] = useState<number | null>(null);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const lift = useSharedValue(0);
  const target = useSharedValue(-1);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      listProjects().then(async (list) => {
        if (!alive) return;
        prunePlan(new Set(list.map((p) => p.doc.id)));
        setProjects(list);
        // Planned projects that were never closed in the editor have no thumbnail yet.
        const missing = list.filter((p) => !p.thumb && isPlanned(p.doc.id));
        if (!missing.length) return;
        for (const p of missing) await updateThumbnail(p.doc).catch(() => {});
        if (alive) setProjects(await listProjects());
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  const byId = new Map((projects ?? []).map((p) => [p.doc.id, p]));
  const planned = plan.items.map((id) => byId.get(id)).filter((p): p is ProjectSummary => !!p);

  // Flatten into tiles, top-left first. A grid puzzle takes one tile per post.
  const plannedTiles: Tile[] = [];
  for (const project of planned) {
    const n = project.doc.grid != null ? tileCount(project.doc) : 1;
    for (let part = 0; part < n; part++) {
      plannedTiles.push({ key: `${project.doc.id}-${part}`, kind: 'planned', project, part, order: 0 });
    }
  }
  plannedTiles.forEach((t, i) => {
    if (t.kind === 'planned') t.order = plannedTiles.length - i;
  });
  const tiles: Tile[] = [...plannedTiles, ...plan.posted.map((photo): Tile => ({ key: photo.id, kind: 'posted', photo }))];

  // A puzzle only lines up if the posts above it fill whole rows.
  const misaligned = planned.filter((p) => {
    if (p.doc.grid == null) return false;
    const start = plannedTiles.findIndex((t) => t.kind === 'planned' && t.project === p);
    return start % 3 !== 0;
  });

  const tileW = (width - GAP * 2) / 3;
  const tileH = tileW * (4 / 3);

  // Next scheduled post, soonest first.
  const next = planned
    .filter((p) => plan.schedule[p.doc.id])
    .sort((a, b) => plan.schedule[a.doc.id].at - plan.schedule[b.doc.id].at)[0];

  // --- Drag to reorder: long-press a planned tile, drop it where it should go. ---
  const plannedCount = plannedTiles.length;
  const tileOwners = plannedTiles.map((t) => (t.kind === 'planned' ? t.project.doc.id : ''));
  const tileAt = (x: number, y: number) => {
    'worklet';
    const col = Math.max(0, Math.min(2, Math.floor(x / (tileW + GAP))));
    const row = Math.max(0, Math.floor(y / (tileH + GAP)));
    return row * 3 + col;
  };
  const startDrag = (tile: number) => {
    const id = tileOwners[tile];
    if (!id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDragId(id);
  };
  const drop = (tile: number) => {
    const id = dragId;
    setDragId(null);
    setDropTile(null);
    if (!id) return;
    // The item that owns the tile it was dropped on takes its place.
    const owner = tile < plannedCount ? tileOwners[tile] : plan.items[plan.items.length - 1];
    const to = plan.items.indexOf(owner);
    if (to >= 0) {
      Haptics.selectionAsync();
      movePlannedTo(id, to);
    }
  };
  const drag = Gesture.Pan()
    .activateAfterLongPress(300)
    .onStart((e) => {
      const tile = tileAt(e.x, e.y);
      if (tile >= plannedCount) return;
      dragX.set(e.x);
      dragY.set(e.y);
      lift.set(withSpring(1, { damping: 16, stiffness: 260 }));
      target.set(tile);
      scheduleOnRN(startDrag, tile);
    })
    .onUpdate((e) => {
      dragX.set(e.x);
      dragY.set(e.y);
      target.set(Math.min(tileAt(e.x, e.y), plannedCount - 1));
    })
    .onEnd((e) => {
      lift.set(withSpring(0));
      scheduleOnRN(drop, Math.min(tileAt(e.x, e.y), plannedCount - 1));
    })
    .onFinalize(() => {
      lift.set(withSpring(0));
    });
  useAnimatedReaction(
    () => target.get(),
    (t, prev) => {
      if (t !== prev && t >= 0) scheduleOnRN(setDropTile, t);
    },
  );
  const ghost = useAnimatedStyle(() => ({
    opacity: lift.get(),
    transform: [
      { translateX: dragX.get() - tileW / 2 },
      { translateY: dragY.get() - tileH / 2 },
      { scale: 0.9 + lift.get() * 0.18 },
    ],
  }));
  const dragged = dragId ? plannedTiles.find((t) => t.kind === 'planned' && t.project.doc.id === dragId) : undefined;

  const newPuzzle = (rows: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const doc = createGridDoc(rows);
    saveProject(doc, { create: true });
    addToPlan(doc.id);
    router.push(`/editor/${doc.id}`);
  };

  const pickPosted = async () => {
    const room = POSTED_LIMIT - plan.posted.length;
    if (room <= 0) {
      Alert.alert('That’s plenty', `The planner keeps up to ${POSTED_LIMIT} posted photos. Remove some first.`);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      orderedSelection: true,
      selectionLimit: room,
      quality: 0.8,
    });
    if (result.canceled || !result.assets.length) return;
    setAdding(true);
    try {
      await addPosted(result.assets.map((a) => a.uri));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Could not add the photos', e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  };

  const tileActions = (tile: Tile) => {
    Haptics.selectionAsync();
    if (tile.kind === 'posted') {
      Alert.alert('Posted photo', 'Shown so you can see how new posts sit with your feed.', [
        { text: 'Remove', style: 'destructive', onPress: () => removePosted(tile.photo.id) },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    const { doc } = tile.project;
    const when = plan.schedule[doc.id];
    const kind = doc.grid != null ? `Grid puzzle · ${tileCount(doc)} posts` : `Carousel · ${doc.slideCount} slides`;
    Alert.alert(doc.name, when ? `${kind}\nGoing up ${formatWhen(when.at)}` : kind, [
      { text: 'Open', onPress: () => router.push(`/editor/${doc.id}`) },
      { text: when ? 'Change time' : 'Schedule', onPress: () => setScheduling(tile.project) },
      { text: 'Mark as posted', onPress: () => posted(tile.project) },
      { text: 'Take off the grid', style: 'destructive' as const, onPress: () => removeFromPlan(doc.id) },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  /** Moves a planned post into the posted part of the grid, as it will look once it's up. */
  const posted = async (project: ProjectSummary) => {
    setPosting(true);
    try {
      const uris = await postedPreviews(project.doc);
      await markPosted(project.doc.id, uris);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Could not mark it as posted', e instanceof Error ? e.message : String(e));
    } finally {
      setPosting(false);
    }
  };

  const candidates = (projects ?? []).filter((p) => !plan.items.includes(p.doc.id));
  const empty = tiles.length === 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <IconButton label="Back" icon={{ ios: 'chevron.left', android: 'arrow_back' }} onPress={() => router.back()} />
        <Text style={styles.headerTitle}>Grid planner</Text>
        <ActionMenu
          label="Add to the grid"
          items={[
            {
              label: 'New grid puzzle',
              icon: { ios: 'square.grid.3x3', android: 'grid_on' },
              items: Array.from({ length: MAX_GRID_ROWS }, (_, i) => ({
                label: `${i + 1} ${i ? 'rows' : 'row'} · ${(i + 1) * 3} posts`,
                onPress: () => newPuzzle(i + 1),
              })),
            },
            { label: 'Add a carousel', icon: { ios: 'rectangle.stack.badge.plus', android: 'library_add' }, onPress: () => setPicking(true) },
            { label: 'Add posted photos', icon: { ios: 'photo.on.rectangle', android: 'add_photo_alternate' }, onPress: pickPosted },
          ]}>
          <View style={styles.addButton}>
            <Icon name={{ ios: 'plus', android: 'add' }} size={20} />
          </View>
        </ActionMenu>
      </View>

      {projects == null ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.text} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} scrollEnabled={!dragId}>
          <ProfileHeader posts={tiles.length} planned={plannedTiles.length} />

          {misaligned.length > 0 && (
            <View style={styles.warning}>
              <Icon name={{ ios: 'exclamationmark.triangle.fill', android: 'warning' }} size={16} color="#F2C14E" />
              <Text style={styles.warningText}>
                {misaligned[0].doc.name} starts mid-row, so its picture won’t line up. Move it, or add or remove posts above it until it starts a row.
              </Text>
            </View>
          )}

          {next && (
            <Pressable onPress={() => setScheduling(next)} style={styles.nextUp}>
              <Icon name={{ ios: 'bell.fill', android: 'notifications' }} size={15} color={C.accent} />
              <Text style={styles.nextUpText} numberOfLines={1}>
                Next up: <Text style={{ color: C.text }}>{next.doc.name}</Text> · {formatWhen(plan.schedule[next.doc.id].at)}
              </Text>
            </Pressable>
          )}

          {!empty && (
            <View style={styles.toolbar}>
              <Chip label="Posting order" selected={numbers} onPress={() => setNumbers((v) => !v)} style={{ height: 32 }} />
              <Text style={styles.toolbarText}>
                {plannedTiles.length ? 'Post 1 first' : 'Nothing planned yet'}
              </Text>
              {(adding || posting) && <ActivityIndicator color={C.textDim} size="small" />}
            </View>
          )}

          {empty ? (
            <View style={styles.empty}>
              <View style={styles.emptyGrid}>
                {Array.from({ length: 9 }, (_, i) => (
                  <View key={i} style={[styles.emptyCell, i % 4 === 0 && { backgroundColor: C.accent + '33' }]} />
                ))}
              </View>
              <Text style={styles.emptyTitle}>Plan your profile</Text>
              <Text style={styles.emptyText}>
                See upcoming carousels on your grid before you post, and make grid puzzles: one picture split across 3, 6, 9 or 12 posts.
              </Text>
              <PressableScale onPress={() => newPuzzle(2)} style={styles.cta}>
                <Text style={styles.ctaText}>Make a grid puzzle</Text>
              </PressableScale>
              <View style={styles.emptyActions}>
                <Pressable onPress={() => setPicking(true)} hitSlop={8}>
                  <Text style={styles.link}>Add a carousel</Text>
                </Pressable>
                <Text style={styles.dot}>·</Text>
                <Pressable onPress={pickPosted} hitSlop={8}>
                  <Text style={styles.link}>Add posted photos</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <GestureDetector gesture={drag}>
            <View style={styles.grid}>
              {tiles.map((tile, i) => (
                <Pressable
                  key={tile.key}
                  onPress={() => tileActions(tile)}
                  style={({ pressed }) => [
                    { width: tileW, height: tileH },
                    styles.tile,
                    pressed && { opacity: 0.7 },
                    tile.kind === 'planned' && tile.project.doc.id === dragId && { opacity: 0.35 },
                  ]}>
                  <TileImage tile={tile} w={tileW} h={tileH} />
                  {dragId && dropTile === i && <View style={styles.dropTarget} />}
                  {tile.kind === 'planned' && tile.part === 0 && plan.schedule[tile.project.doc.id] && (
                    <View style={styles.when}>
                      <Icon name={{ ios: 'clock.fill', android: 'schedule' }} size={10} color={C.accentInk} />
                      <Text style={styles.whenText} numberOfLines={1}>
                        {formatWhen(plan.schedule[tile.project.doc.id].at, true)}
                      </Text>
                    </View>
                  )}
                  {tile.kind === 'planned' && numbers && (
                    <View style={styles.order}>
                      <Text style={styles.orderText}>{tile.order}</Text>
                    </View>
                  )}
                  {tile.kind === 'planned' &&
                    ((tile.part === 0 && tile.project.doc.grid == null && tile.project.doc.slideCount > 1) ||
                      !!tile.project.doc.covers?.[tile.part]) && (
                    <View style={styles.multi}>
                      <Icon name={{ ios: 'square.fill.on.square.fill', android: 'filter_none' }} size={13} color="#FFFFFF" />
                    </View>
                  )}
                  {tile.kind === 'posted' && <View style={styles.postedShade} />}
                </Pressable>
              ))}
              {dragged && (
                <Animated.View pointerEvents="none" style={[styles.ghost, { width: tileW, height: tileH }, ghost]}>
                  <TileImage tile={dragged} w={tileW} h={tileH} />
                </Animated.View>
              )}
            </View>
            </GestureDetector>
          )}

          {!empty && (
            <Text style={styles.footer}>
              Numbered tiles are planned, newest on top; dimmed ones are already posted. Tap a tile to schedule, open or mark it posted. Press and hold to drag it to a new spot.
            </Text>
          )}
        </ScrollView>
      )}

      {scheduling && (
        <ScheduleSheet
          project={scheduling}
          at={plan.schedule[scheduling.doc.id]?.at}
          onClose={() => setScheduling(null)}
        />
      )}

      <Modal visible={picking} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPicking(false)}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Add to the grid</Text>
            <IconButton label="Close" icon={{ ios: 'xmark', android: 'close' }} onPress={() => setPicking(false)} />
          </View>
          {candidates.length === 0 ? (
            <Text style={styles.emptyText}>Every carousel is already on the grid.</Text>
          ) : (
            <ScrollView contentContainerStyle={styles.pickGrid}>
              {candidates.map((p) => (
                <ProjectCard
                  key={p.doc.id}
                  project={p}
                  width={(width - 40 - 24) / 3}
                  onPress={() => {
                    Haptics.selectionAsync();
                    addToPlan(p.doc.id);
                    setPicking(false);
                  }}
                />
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

/**
 * A tile's picture. Carousels show their cover, cropped to the grid's 3:4
 * like Instagram does; a grid puzzle's tile is its slice of the whole picture.
 */
function TileImage({ tile, w, h }: { tile: Tile; w: number; h: number }) {
  if (tile.kind === 'posted') {
    return <Image source={{ uri: postedUri(tile.photo) }} style={StyleSheet.absoluteFill} contentFit="cover" />;
  }
  const { doc, thumb } = tile.project;
  if (!thumb) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.noThumb]}>
        <Text style={styles.noThumbText} numberOfLines={2}>
          {doc.name}
        </Text>
      </View>
    );
  }
  const source = { uri: thumb };
  const key = `${doc.id}-${doc.updatedAt}`;
  if (doc.grid == null) {
    return <Image source={source} cachePolicy="none" recyclingKey={key} style={StyleSheet.absoluteFill} contentFit="cover" />;
  }
  const col = tile.part % doc.slideCount;
  const row = Math.floor(tile.part / doc.slideCount);
  return (
    <Image
      source={source}
      cachePolicy="none"
      recyclingKey={key}
      style={{ position: 'absolute', width: w * doc.slideCount, height: h * doc.grid, left: -col * w, top: -row * h }}
      contentFit="fill"
    />
  );
}

/** "Today 7:00 PM", "Tomorrow 9:00 AM", "Fri 12 Oct, 9:00 AM" (or a short form for badges). */
function formatWhen(at: number, short = false) {
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const today = new Date();
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(today).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return short ? time : `today ${time}`;
  if (days === 1) return short ? `Tmrw ${time}` : `tomorrow ${time}`;
  const day = d.toLocaleDateString([], short ? { weekday: 'short' } : { weekday: 'short', day: 'numeric', month: 'short' });
  return short ? `${day} ${time}` : `${day}, ${time}`;
}

/** Quick picks: the next few sensible posting slots. */
function quickTimes() {
  const at = (days: number, hour: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  const options = [
    { label: 'Tonight 7 PM', date: at(0, 19) },
    { label: 'Tomorrow 9 AM', date: at(1, 9) },
    { label: 'Tomorrow 6 PM', date: at(1, 18) },
  ];
  const saturday = (6 - new Date().getDay() + 7) % 7 || 7;
  options.push({ label: 'Saturday 11 AM', date: at(saturday, 11) });
  return options.filter((o) => o.date.getTime() > Date.now() + 60_000);
}

/** When a planned post goes up, with a reminder at that time. */
function ScheduleSheet({ project, at, onClose }: { project: ProjectSummary; at?: number; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [date, setDate] = useState(() => (at ? new Date(at) : (quickTimes()[0]?.date ?? new Date(Date.now() + 3_600_000))));
  const [remind, setRemind] = useState(true);
  const [saving, setSaving] = useState(false);
  const { doc } = project;
  const grid = doc.grid != null;

  const save = async () => {
    setSaving(true);
    try {
      const reminded = await setPostTime(
        doc.id,
        date.getTime(),
        remind
          ? {
              title: `Time to post “${doc.name}”`,
              body: grid
                ? `Your grid puzzle is ready: post 1 (bottom right) first, then the rest in order.`
                : `Your ${doc.slideCount}-slide carousel is ready to export and post.`,
            }
          : undefined,
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (remind && !reminded && date.getTime() > Date.now()) {
        Alert.alert('Scheduled, without a reminder', 'Turn on notifications for Seam in Settings to get reminded.');
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Schedule</Text>
          <IconButton label="Close" icon={{ ios: 'xmark', android: 'close' }} onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, gap: 18 }}>
          <Text style={styles.emptyText}>
            When should “{doc.name}” go up? Seam will remind you then, with everything ready to post.
          </Text>
          <View style={styles.quick}>
            {quickTimes().map((q) => (
              <Chip
                key={q.label}
                label={q.label}
                selected={Math.abs(q.date.getTime() - date.getTime()) < 60_000}
                onPress={() => setDate(q.date)}
                style={{ height: 34 }}
              />
            ))}
          </View>
          <View style={{ alignItems: 'center' }}>
            <PostTimePicker value={date} onChange={setDate} />
          </View>
          <View style={styles.remindRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.remindTitle}>Remind me</Text>
              <Text style={styles.remindDetail}>{formatWhen(date.getTime())}</Text>
            </View>
            <Switch value={remind} onValueChange={setRemind} trackColor={{ true: C.accent, false: C.surfaceHi }} />
          </View>
          <PressableScale onPress={save} disabled={saving} style={[styles.cta, { alignSelf: 'stretch' }]}>
            <Text style={styles.ctaText}>{saving ? 'Saving…' : 'Save'}</Text>
          </PressableScale>
          {at != null && (
            <Pressable
              onPress={async () => {
                await setPostTime(doc.id, null);
                onClose();
              }}
              hitSlop={8}
              style={{ alignSelf: 'center' }}>
              <Text style={[styles.link, { color: C.danger }]}>Remove time</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  nextUp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: R.md,
    backgroundColor: C.accent + '14',
    borderWidth: 1,
    borderColor: C.accent + '40',
  },
  nextUpText: { ...T.medium, color: C.textDim, fontSize: 13, flex: 1 },
  when: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.accent,
  },
  whenText: { ...T.semibold, color: C.accentInk, fontSize: 10, flexShrink: 1 },
  dropTarget: { ...StyleSheet.absoluteFill, borderWidth: 3, borderColor: C.accent },
  ghost: {
    position: 'absolute',
    left: 0,
    top: 0,
    overflow: 'hidden',
    borderRadius: 6,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  remindRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: R.lg, backgroundColor: C.surface },
  remindTitle: { ...T.medium, fontSize: 15 },
  remindDetail: { ...T.body, color: C.textDim, fontSize: 13 },
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, height: 52 },
  headerTitle: { ...T.display, fontSize: 24 },
  addButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  warning: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: R.md,
    backgroundColor: '#F2C14E1A',
    borderWidth: 1,
    borderColor: '#F2C14E55',
  },
  warningText: { ...T.body, color: C.text, fontSize: 13, lineHeight: 18, flex: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  toolbarText: { ...T.medium, color: C.textDim, fontSize: 13, flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: { overflow: 'hidden', backgroundColor: C.surface },
  order: {
    position: 'absolute',
    left: 6,
    top: 6,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: '#000000B3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderText: { ...T.semibold, color: '#FFFFFF', fontSize: 12, fontVariant: ['tabular-nums'] },
  multi: { position: 'absolute', right: 7, top: 7 },
  postedShade: { ...StyleSheet.absoluteFill, backgroundColor: '#0A0A0A59' },
  noThumb: { alignItems: 'center', justifyContent: 'center', padding: 8, backgroundColor: C.surfaceHi },
  noThumbText: { ...T.medium, color: C.textDim, fontSize: 12, textAlign: 'center' },
  footer: { ...T.body, color: C.textFaint, fontSize: 12, lineHeight: 17, paddingHorizontal: 16, paddingTop: 14 },
  empty: { alignItems: 'center', paddingHorizontal: 28, paddingTop: 20, gap: 12 },
  emptyGrid: { width: 132, flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginBottom: 8 },
  emptyCell: { width: 42, height: 56, borderRadius: 4, backgroundColor: C.surfaceHi },
  emptyTitle: { ...T.display, fontSize: 30 },
  emptyText: { ...T.body, color: C.textDim, fontSize: 14, lineHeight: 20, textAlign: 'center', padding: 4 },
  cta: { height: 52, paddingHorizontal: 28, borderRadius: R.pill, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  ctaText: { ...T.semibold, color: C.bg, fontSize: 16 },
  emptyActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  link: { ...T.medium, color: C.accent, fontSize: 14 },
  dot: { ...T.body, color: C.textFaint },
  sheet: { flex: 1, backgroundColor: C.bg, paddingTop: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 10, height: 56 },
  sheetTitle: { ...T.display, fontSize: 28 },
  pickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 20, paddingBottom: 40 },
});
