import { router } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Eyebrow, Icon, IconButton } from '@/components/ui';
import { APP_VERSION } from '@/lib/app-info';
import { CHANGELOG, LATEST_NEWS } from '@/lib/changelog';
import { updateSettings } from '@/lib/settings';
import { C, R, T } from '@/theme';

/** Release notes, newest first. Opening it clears the "New" badge. */
export default function WhatsNewScreen() {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    updateSettings({ seenNews: LATEST_NEWS });
  }, []);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <IconButton label="Back" icon={{ ios: 'chevron.left', android: 'arrow_back' }} onPress={() => router.back()} />
        <Text style={styles.headerTitle}>What’s new</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40, gap: 34 }}>
        <Text style={styles.current}>You’re on Seam {APP_VERSION}</Text>
        {CHANGELOG.map((release, r) => (
          <Animated.View key={release.id} entering={FadeInDown.delay(r * 80).duration(450)} style={{ gap: 14 }}>
            <View style={{ gap: 4 }}>
              <View style={styles.metaRow}>
                <Eyebrow>
                  {release.date} · {release.version}
                </Eyebrow>
                {r === 0 && (
                  <View style={styles.latest}>
                    <Text style={styles.latestText}>Latest</Text>
                  </View>
                )}
              </View>
              <Text style={styles.title}>{release.title}</Text>
            </View>
            <View style={styles.card}>
              {release.items.map((item, i) => (
                <View key={item.title} style={[styles.item, i < release.items.length - 1 && styles.divider]}>
                  <View style={styles.icon}>
                    <Icon name={item.icon} size={18} color={C.accent} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={styles.itemDetail}>{item.detail}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, height: 52 },
  headerTitle: { ...T.display, fontSize: 24 },
  current: { ...T.body, color: C.textDim, fontSize: 14 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  latest: { backgroundColor: C.accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  latestText: { ...T.semibold, color: C.accentInk, fontSize: 11 },
  title: { ...T.display, fontSize: 32 },
  card: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.lineSoft,
    overflow: 'hidden',
  },
  item: { flexDirection: 'row', gap: 14, padding: 16 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.surfaceHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: { ...T.semibold, fontSize: 15 },
  itemDetail: { ...T.body, color: C.textDim, fontSize: 13, lineHeight: 19 },
});
