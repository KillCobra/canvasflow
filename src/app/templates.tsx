import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TemplateCard, startFromTemplate } from '@/components/template-thumb';
import { Chip, HScroll, IconButton } from '@/components/ui';
import { TEMPLATE_CATEGORIES, type TemplateCategory, useTemplates } from '@/lib/templates';
import { C, T } from '@/theme';

/** Every template, filterable by category. Picking one opens a new project. */
export default function TemplatesScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [category, setCategory] = useState<TemplateCategory | null>(null);
  const templates = useTemplates();
  const categories = [...new Set([...TEMPLATE_CATEGORIES, ...templates.map((t) => t.category)])];
  const list = category ? templates.filter((t) => t.category === category) : templates;
  const maxW = width - 40;

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Templates</Text>
        <IconButton label="Close" icon={{ ios: 'xmark', android: 'close' }} onPress={() => router.back()} />
      </View>
      <View style={{ marginBottom: 8 }}>
        <HScroll>
          <Chip label="All" selected={!category} onPress={() => setCategory(null)} />
          {categories.map((c) => (
            <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
          ))}
        </HScroll>
      </View>
      <FlatList
        data={list}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: 20, gap: 30 }}
        renderItem={({ item }) => {
          return (
            <TemplateCard
              template={item}
              height={220}
              maxWidth={maxW}
              onPress={() => {
                router.back();
                startFromTemplate(item);
              }}
            />
          );
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
    paddingLeft: 20,
    paddingRight: 10,
    paddingTop: 18,
    paddingBottom: 12,
  },
  title: { ...T.display, fontSize: 36 },
});
