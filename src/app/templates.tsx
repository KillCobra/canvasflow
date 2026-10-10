import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TemplateCard } from '@/components/template-thumb';
import { Chip, HScroll, Icon, IconButton } from '@/components/ui';
import { useFavorites } from '@/lib/favorites';
import { getInterests } from '@/lib/settings';
import {
  COLLECTIONS,
  TEMPLATE_CATEGORIES,
  type Template,
  featured,
  forYou,
  inCollection,
  searchTemplates,
  useTemplates,
} from '@/lib/templates';
import { C, R, T } from '@/theme';

/** 'all' | 'foryou' | 'favorites' | 'new', or a category name. */
type Filter = string;

/**
 * Every template: searchable, filterable, optionally narrowed to one
 * collection. Picking one opens its detail screen.
 */
export default function TemplatesScreen() {
  const params = useLocalSearchParams<{ filter?: string; collection?: string; search?: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const templates = useTemplates();
  const favorites = useFavorites();
  const [interests] = useState(getInterests);
  const [filter, setFilter] = useState<Filter>(params.filter ?? 'all');
  const [collectionId, setCollectionId] = useState<string | null>(params.collection ?? null);
  const [query, setQuery] = useState('');

  const collection = COLLECTIONS.find((c) => c.id === collectionId);
  const categories = [...new Set([...TEMPLATE_CATEGORIES, ...templates.map((t) => t.category)])];
  const picks = forYou(templates, interests);
  const base = collection ? templates.filter((t) => inCollection(t, collection)) : templates;

  const filtered = (list: Template[]): Template[] => {
    if (filter === 'all') return list;
    if (filter === 'foryou') return picks.length ? picks.filter((t) => list.includes(t)) : featured(list);
    if (filter === 'favorites') return list.filter((t) => favorites.includes(t.id));
    if (filter === 'new') return list.filter((t) => t.isNew);
    return list.filter((t) => t.category === filter);
  };
  const list = searchTemplates(filtered(base), query);
  const maxW = width - 40;

  const empty = query.trim()
    ? `No templates match “${query.trim()}”.`
    : filter === 'favorites'
      ? 'No favorites yet. Tap the heart on a template to keep it here.'
      : 'Nothing here yet.';

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {collection?.title ?? 'Templates'}
          </Text>
          {collection && <Text style={styles.subtitle}>{collection.subtitle}</Text>}
        </View>
        <IconButton label="Close" icon={{ ios: 'xmark', android: 'close' }} onPress={() => router.back()} />
      </View>

      <View style={styles.searchBox}>
        <Icon name={{ ios: 'magnifyingglass', android: 'search' }} size={16} color={C.textDim} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search: wedding, travel, minimal…"
          placeholderTextColor={C.textFaint}
          autoFocus={params.search === '1'}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={styles.searchInput}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
            <Icon name={{ ios: 'xmark.circle.fill', android: 'cancel' }} size={17} color={C.textDim} />
          </Pressable>
        )}
      </View>

      <View style={{ marginBottom: 4 }}>
        <HScroll>
          {collection && (
            <Chip
              selected
              label={
                <View style={styles.chipRow}>
                  <Text style={[styles.chipText, { color: C.bg }]}>{collection.title}</Text>
                  <Icon name={{ ios: 'xmark', android: 'close' }} size={11} color={C.bg} />
                </View>
              }
              onPress={() => setCollectionId(null)}
            />
          )}
          <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label="For you" selected={filter === 'foryou'} onPress={() => setFilter('foryou')} />
          <Chip
            label={
              <View style={styles.chipRow}>
                <Icon
                  name={{ ios: filter === 'favorites' ? 'heart.fill' : 'heart', android: 'favorite' }}
                  size={12}
                  color={filter === 'favorites' ? C.bg : C.text}
                />
                <Text style={[styles.chipText, filter === 'favorites' && { color: C.bg }]}>Favorites</Text>
              </View>
            }
            selected={filter === 'favorites'}
            onPress={() => setFilter('favorites')}
          />
          <Chip label="New" selected={filter === 'new'} onPress={() => setFilter('new')} />
          {categories.map((c) => (
            <Chip key={c} label={c} selected={filter === c} onPress={() => setFilter(c)} />
          ))}
        </HScroll>
      </View>

      <FlatList
        data={list}
        keyExtractor={(t) => t.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ padding: 20, gap: 30 }}
        ListEmptyComponent={<Text style={styles.empty}>{empty}</Text>}
        renderItem={({ item }) => {
          return <TemplateCard template={item} height={220} maxWidth={maxW} />;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingLeft: 20,
    paddingRight: 10,
    paddingTop: 18,
    paddingBottom: 12,
  },
  title: { ...T.display, fontSize: 36 },
  subtitle: { ...T.body, color: C.textDim, fontSize: 14, marginTop: 2 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 42,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    borderRadius: R.pill,
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
  },
  searchInput: { ...T.medium, flex: 1, fontSize: 15, height: 42, padding: 0 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { ...T.medium, fontSize: 13, color: C.text },
  empty: { ...T.body, color: C.textDim, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 40 },
});
