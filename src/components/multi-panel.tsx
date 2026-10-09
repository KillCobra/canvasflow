import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { type AlignMode, useEditor } from '@/lib/store';
import { C, T } from '@/theme';

import { Chip, IconButton, type IconName, ToolButton } from './ui';

const ALIGN: { mode: AlignMode; label: string; icon: IconName }[] = [
  { mode: 'left', label: 'Align left', icon: { ios: 'align.horizontal.left', android: 'align_horizontal_left' } },
  { mode: 'hcenter', label: 'Align centers', icon: { ios: 'align.horizontal.center', android: 'align_horizontal_center' } },
  { mode: 'right', label: 'Align right', icon: { ios: 'align.horizontal.right', android: 'align_horizontal_right' } },
  { mode: 'top', label: 'Align top', icon: { ios: 'align.vertical.top', android: 'align_vertical_top' } },
  { mode: 'vcenter', label: 'Align middles', icon: { ios: 'align.vertical.center', android: 'align_vertical_center' } },
  { mode: 'bottom', label: 'Align bottom', icon: { ios: 'align.vertical.bottom', android: 'align_vertical_bottom' } },
];

/** Six alignment buttons. With one layer (or `toSlide`) they align to the layer's slide. */
export function AlignRow({ ids, toSlide }: { ids: string[]; toSlide: boolean }) {
  const alignLayers = useEditor((s) => s.alignLayers);
  return (
    <View style={styles.alignRow}>
      {ALIGN.map((a) => (
        <IconButton
          key={a.mode}
          label={a.label}
          icon={a.icon}
          tone="filled"
          onPress={() => {
            Haptics.selectionAsync();
            alignLayers(ids, a.mode, toSlide);
          }}
        />
      ))}
    </View>
  );
}

/** Panel for a multi-selection (or multi-select mode with nothing picked yet). */
export function MultiPanel() {
  const ids = useEditor((s) => s.selectedIds);
  const layers = useEditor((s) => s.doc!.layers);
  const {
    setMulti,
    distributeLayers,
    groupLayers,
    ungroupLayers,
    duplicateLayers,
    removeLayers,
    updateLayers,
  } = useEditor.getState();
  const [toSlide, setToSlide] = useState(false);

  const picked = layers.filter((l) => ids.includes(l.id));
  const grouped = picked.length > 1 && picked.every((l) => l.group && l.group === picked[0].group);
  const allLocked = picked.length > 0 && picked.every((l) => l.locked);
  const allHidden = picked.length > 0 && picked.every((l) => l.hidden);
  const setAll = (patch: { locked?: boolean; hidden?: boolean }) =>
    updateLayers(Object.fromEntries(picked.map((l) => [l.id, patch])));

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {picked.length > 1 ? `${picked.length} selected` : 'Select layers'}
        </Text>
        <View style={{ flex: 1 }} />
        {picked.length > 1 && (
          <Chip label={toSlide ? 'To slide' : 'To each other'} selected={toSlide} onPress={() => setToSlide((v) => !v)} style={{ height: 30 }} />
        )}
        <IconButton label="Done" icon={{ ios: 'checkmark', android: 'check' }} onPress={() => setMulti(false)} />
      </View>

      {picked.length < 2 ? (
        <Text style={styles.hint}>Tap layers on the canvas or in the Layers list to add them to the selection.</Text>
      ) : (
        <>
          <View style={styles.alignHeader}>
            <AlignRow ids={ids} toSlide={toSlide} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actions}>
            <ToolButton
              icon={grouped ? { ios: 'square.dashed', android: 'ungroup' } : { ios: 'square.on.square.dashed', android: 'group_work' }}
              label={grouped ? 'Ungroup' : 'Group'}
              active={grouped}
              onPress={() => (grouped ? ungroupLayers(ids) : groupLayers(ids))}
            />
            {picked.length >= 3 && (
              <>
                <ToolButton
                  icon={{ ios: 'distribute.horizontal.center', android: 'horizontal_distribute' }}
                  label="Space H"
                  onPress={() => distributeLayers(ids, 'x')}
                />
                <ToolButton
                  icon={{ ios: 'distribute.vertical.center', android: 'vertical_distribute' }}
                  label="Space V"
                  onPress={() => distributeLayers(ids, 'y')}
                />
              </>
            )}
            <ToolButton icon={{ ios: 'plus.square.on.square', android: 'content_copy' }} label="Copy" onPress={() => duplicateLayers(ids)} />
            <ToolButton
              icon={allLocked ? { ios: 'lock.fill', android: 'lock' } : { ios: 'lock.open', android: 'lock_open' }}
              label={allLocked ? 'Unlock' : 'Lock'}
              active={allLocked}
              onPress={() => setAll({ locked: !allLocked })}
            />
            <ToolButton
              icon={allHidden ? { ios: 'eye.slash', android: 'visibility_off' } : { ios: 'eye', android: 'visibility' }}
              label={allHidden ? 'Show' : 'Hide'}
              active={allHidden}
              onPress={() => setAll({ hidden: !allHidden })}
            />
            <ToolButton icon={{ ios: 'trash', android: 'delete' }} label="Delete" danger onPress={() => removeLayers(ids)} />
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 18, paddingRight: 8, height: 40 },
  title: { ...T.display, fontSize: 22 },
  hint: { ...T.body, color: C.textDim, fontSize: 13, lineHeight: 19, paddingHorizontal: 18 },
  alignHeader: { paddingHorizontal: 14 },
  alignRow: { flexDirection: 'row', gap: 6 },
  actions: { gap: 2, paddingHorizontal: 10 },
});
