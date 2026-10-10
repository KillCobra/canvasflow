import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, IconButton } from '@/components/ui';
import { NATIVE_LIBRARIES, PACKAGES, licenseName, packageId } from '@/lib/acknowledgements';
import { C, R, T } from '@/theme';

type Item = { id: string; title: string; meta: string; owner?: string };

export default function SoftwareScreen() {
  const insets = useSafeAreaInsets();
  const { kind } = useLocalSearchParams<{ kind: 'package' | 'native' }>();
  const [query, setQuery] = useState('');

  const items: Item[] =
    kind === 'native'
      ? NATIVE_LIBRARIES.map((n) => ({
          id: n.id,
          title: n.name,
          meta: `${licenseName(n.license)} · via ${n.via}`,
          owner: n.copyright[0],
        }))
      : PACKAGES.map((p) => ({
          id: packageId(p),
          title: p.name,
          meta: `${p.version} · ${licenseName(p.license)}`,
          owner: p.copyright[0],
        }));
  const q = query.trim().toLowerCase();
  const shown = q ? items.filter((i) => `${i.title} ${i.meta} ${i.owner ?? ''}`.toLowerCase().includes(q)) : items;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <IconButton label="Back" icon={{ ios: 'chevron.left', android: 'arrow_back' }} onPress={() => router.back()} />
        <Text style={styles.headerTitle}>{kind === 'native' ? 'Native libraries' : 'JavaScript packages'}</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.search}>
        <Icon name={{ ios: 'magnifyingglass', android: 'search' }} size={15} color={C.textFaint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={`Search ${items.length} ${kind === 'native' ? 'libraries' : 'packages'}`}
          placeholderTextColor={C.textFaint}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>

      <FlatList
        data={shown}
        keyExtractor={(i) => i.id}
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}
        ListEmptyComponent={<Text style={styles.empty}>Nothing matches “{query}”.</Text>}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/acknowledgements/licence', params: { kind, id: item.id } })}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.title} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {item.meta}
              </Text>
              {item.owner && (
                <Text style={styles.owner} numberOfLines={1}>
                  {item.owner}
                </Text>
              )}
            </View>
            <Icon name={{ ios: 'chevron.right', android: 'chevron_right' }} size={13} color={C.textFaint} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, height: 52 },
  headerTitle: { ...T.display, fontSize: 24 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 6,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: R.pill,
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.lineSoft,
  },
  searchInput: { ...T.body, flex: 1, fontSize: 15, color: C.text, paddingVertical: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  title: { ...T.medium, fontSize: 15 },
  meta: { ...T.body, color: C.textDim, fontSize: 12 },
  owner: { ...T.body, color: C.textFaint, fontSize: 12 },
  empty: { ...T.body, color: C.textDim, fontSize: 14, textAlign: 'center', marginTop: 40 },
});
