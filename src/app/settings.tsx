import * as Haptics from 'expo-haptics';
import { Paths } from 'expo-file-system';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Row, Section } from '@/components/list';
import { Chip, IconButton } from '@/components/ui';
import { APP_VERSION, BUILD, RUNTIME, SDK } from '@/lib/app-info';
import { useEditorPrefs } from '@/lib/editor-prefs';
import { clearFavorites, useFavorites } from '@/lib/favorites';
import { releaseImages } from '@/lib/images';
import { listProjects } from '@/lib/projects';
import { updateSettings, useSettings } from '@/lib/settings';
import { brandSize, cacheSize, clearCache, deleteAllProjects, formatBytes, projectsSize, removeUnusedMedia } from '@/lib/storage';
import { ASPECTS, type AspectId } from '@/lib/types';
import { C, T } from '@/theme';

type Usage = { projects: number; count: number; brand: number; cache: number; free: number };

function measure(count: number): Usage {
  let free = 0;
  try {
    free = Paths.availableDiskSpace;
  } catch {
    // Not available on every platform.
  }
  return { projects: projectsSize(), count, brand: brandSize(), cache: cacheSize(), free };
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const snapping = useEditorPrefs((s) => s.snapping);
  const setSnapping = useEditorPrefs((s) => s.setSnapping);
  const favorites = useFavorites();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [working, setWorking] = useState<null | 'cache' | 'media'>(null);

  const refresh = useCallback(() => {
    listProjects().then((p) => setUsage(measure(p.length)));
  }, []);
  useFocusEffect(refresh);

  const aspect = settings.defaultAspect ?? '4:5';
  const slides = settings.defaultSlides ?? 3;
  const format = settings.exportFormat ?? 'jpeg';

  const runCache = async () => {
    setWorking('cache');
    try {
      const freed = await clearCache();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Cache cleared', freed > 0 ? `Freed ${formatBytes(freed)}.` : 'It was already empty.');
    } finally {
      setWorking(null);
      refresh();
    }
  };

  const runMedia = async () => {
    setWorking('media');
    try {
      const freed = await removeUnusedMedia();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('All tidy', freed > 0 ? `Removed ${formatBytes(freed)} of unused photos and videos.` : 'Nothing unused was found.');
    } finally {
      setWorking(null);
      refresh();
    }
  };

  const confirmDeleteAll = () =>
    Alert.alert('Delete all carousels?', 'Every carousel and its imported media will be removed from this phone. This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete all',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Are you sure?', 'Your brand kit, fonts and favourites stay.', [
            { text: 'Keep them', style: 'cancel' },
            {
              text: 'Delete everything',
              style: 'destructive',
              onPress: async () => {
                const projects = await listProjects();
                projects.forEach((p) => releaseImages(p.doc.id));
                const n = await deleteAllProjects();
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                Alert.alert('Deleted', `${n} ${n === 1 ? 'carousel' : 'carousels'} removed.`);
                refresh();
              },
            },
          ]),
      },
    ]);

  const spinner = <ActivityIndicator color={C.textDim} />;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <IconButton label="Back" icon={{ ios: 'chevron.left', android: 'arrow_back' }} onPress={() => router.back()} />
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40, gap: 26 }}>
        <Section title="New carousels" footer="Used by the + button. You can still pick any format each time.">
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Default format</Text>
            <View style={styles.chips}>
              {(Object.keys(ASPECTS) as AspectId[]).map((id) => (
                <Chip key={id} label={id} selected={aspect === id} onPress={() => updateSettings({ defaultAspect: id })} style={{ height: 32 }} />
              ))}
            </View>
          </View>
          <Row
            title="Slides to start with"
            right={
              <View style={styles.stepper}>
                <IconButton
                  label="Fewer"
                  tone="filled"
                  icon={{ ios: 'minus', android: 'remove' }}
                  disabled={slides <= 1}
                  onPress={() => updateSettings({ defaultSlides: Math.max(1, slides - 1) })}
                />
                <Text style={styles.stepValue}>{slides}</Text>
                <IconButton
                  label="More"
                  tone="filled"
                  icon={{ ios: 'plus', android: 'add' }}
                  disabled={slides >= 10}
                  onPress={() => updateSettings({ defaultSlides: Math.min(10, slides + 1) })}
                />
              </View>
            }
            last
          />
        </Section>

        <Section title="Editor">
          <Row
            icon={{ ios: 'square.dashed', android: 'grid_guides' }}
            title="Snapping"
            detail="Snap to seams, slide centres and other layers"
            right={<Switch value={snapping} onValueChange={setSnapping} trackColor={{ true: C.accent, false: C.surfaceHi }} />}
            last
          />
        </Section>

        <Section title="Export" footer="PNG is lossless and larger; JPEG is what Instagram stores anyway.">
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Image format</Text>
            <View style={styles.chips}>
              <Chip label="JPEG" selected={format === 'jpeg'} onPress={() => updateSettings({ exportFormat: 'jpeg' })} style={{ height: 32 }} />
              <Chip label="PNG" selected={format === 'png'} onPress={() => updateSettings({ exportFormat: 'png' })} style={{ height: 32 }} />
            </View>
          </View>
          <Row title="Saved to Photos" value={`${settings.exports ?? 0} files`} last />
        </Section>

        <Section title="Storage" footer="Clearing the cache never touches your carousels or brand kit.">
          <Row
            icon={{ ios: 'square.stack', android: 'folder' }}
            title="Carousels"
            detail={usage ? `${usage.count} ${usage.count === 1 ? 'carousel' : 'carousels'} and their media` : undefined}
            value={usage ? formatBytes(usage.projects) : undefined}
            right={usage ? undefined : spinner}
          />
          <Row
            icon={{ ios: 'paintpalette', android: 'palette' }}
            title="Brand kit & fonts"
            value={usage ? formatBytes(usage.brand) : undefined}
            right={usage ? undefined : spinner}
          />
          <Row
            icon={{ ios: 'internaldrive', android: 'storage' }}
            title="Cache"
            detail="Export scratch files, video frames, image caches"
            value={usage ? formatBytes(usage.cache) : undefined}
            right={usage ? undefined : spinner}
          />
          {usage && usage.free > 0 && <Row icon={{ ios: 'iphone', android: 'smartphone' }} title="Free on this phone" value={formatBytes(usage.free)} />}
          <Row
            icon={{ ios: 'trash', android: 'delete_sweep' }}
            tint={C.accent}
            title="Clear cache"
            right={working === 'cache' ? spinner : undefined}
            onPress={working ? undefined : runCache}
          />
          <Row
            icon={{ ios: 'wand.and.stars', android: 'cleaning_services' }}
            tint={C.accent}
            title="Remove unused media"
            detail="Photos and videos no carousel uses any more"
            right={working === 'media' ? spinner : undefined}
            onPress={working ? undefined : runMedia}
            last
          />
        </Section>

        <Section title="Personalise">
          <Row
            icon={{ ios: 'sparkles.rectangle.stack', android: 'tune' }}
            title="Change what I make"
            detail="Pick the kinds of posts you make again"
            onPress={() => router.push('/onboarding')}
          />
          <Row
            icon={{ ios: 'heart.slash', android: 'heart_broken' }}
            title="Clear favorite templates"
            value={String(favorites.length)}
            onPress={
              favorites.length
                ? () =>
                    Alert.alert('Clear favourites?', undefined, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Clear', style: 'destructive', onPress: clearFavorites },
                    ])
                : undefined
            }
            last
          />
        </Section>

        <Section title="Danger zone">
          <Row icon={{ ios: 'exclamationmark.triangle', android: 'warning' }} title="Delete all carousels" danger onPress={confirmDeleteAll} last />
        </Section>

        <Section title="About">
          <Row title="Version" value={APP_VERSION} />
          <Row title="Build" value={BUILD} />
          <Row title="Running in" value={RUNTIME} />
          <Row title="Expo SDK" value={SDK.split('.')[0] || '—'} />
          <Row
            title="Acknowledgements"
            detail="Photographers, typefaces and open-source software"
            onPress={() => router.push('/acknowledgements')}
            last
          />
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, height: 52 },
  headerTitle: { ...T.display, fontSize: 24 },
  block: { padding: 14, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  blockTitle: { ...T.medium, fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepValue: { ...T.semibold, fontSize: 16, minWidth: 20, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
