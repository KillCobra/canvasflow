import { StyleSheet, View } from 'react-native';

import { useEditorPrefs } from '@/lib/editor-prefs';
import { useEditor } from '@/lib/store';
import { ASPECTS, type AspectId } from '@/lib/types';
import { R } from '@/theme';

import { ActionMenu, type MenuItem } from './action-menu';
import { Icon } from './ui';

const RATIOS = Object.keys(ASPECTS) as AspectId[];

/** The editor's "…" menu: overview, post ratio, snapping, multi-select and preview. */
export function EditorOptions({
  grid = false,
  overview,
  disabled,
  onOverview,
  onSelectMultiple,
  onPreview,
  onBrand,
  onShuffle,
  onEndCard,
  onSaveTemplate,
}: {
  /** Grid puzzles have a fixed tile shape and no slide overview. */
  grid?: boolean;
  overview: boolean;
  disabled?: boolean;
  onOverview: () => void;
  onSelectMultiple: () => void;
  onPreview: () => void;
  onBrand: () => void;
  onShuffle: () => void;
  onEndCard: () => void;
  onSaveTemplate: () => void;
}) {
  const aspect = useEditor((s) => s.doc?.aspect ?? '4:5');
  const setAspect = useEditor((s) => s.setAspect);
  const snapping = useEditorPrefs((s) => s.snapping);
  const setSnapping = useEditorPrefs((s) => s.setSnapping);

  const slideItems: MenuItem[] = grid
    ? []
    : [
        {
          label: 'Overview',
          icon: { ios: 'square.grid.2x2', android: 'grid_view' },
          toggle: true,
          checked: overview,
          onPress: onOverview,
        },
        {
          label: 'Ratio',
          icon: { ios: 'aspectratio', android: 'aspect_ratio' },
          items: RATIOS.map((id) => ({
            label: `${id}  ${ASPECTS[id].label}`,
            checked: id === aspect,
            onPress: () => setAspect(id),
          })),
        },
      ];
  const carouselItems: MenuItem[] = [
    { label: 'Add end card', icon: { ios: 'person.crop.rectangle', android: 'badge' }, onPress: onEndCard },
    { label: 'Save as template', icon: { ios: 'square.and.arrow.down.on.square', android: 'bookmark_add' }, onPress: onSaveTemplate },
  ];
  const items: MenuItem[] = [
    ...slideItems,
    {
      label: 'Snapping',
      icon: { ios: 'squareshape.split.2x2.dotted', android: 'grid_4x4' },
      toggle: true,
      checked: snapping,
      onPress: () => setSnapping(!snapping),
    },
    {
      label: 'Apply brand kit',
      icon: { ios: 'paintpalette', android: 'palette' },
      separator: true,
      onPress: onBrand,
    },
    { label: 'Shuffle style', icon: { ios: 'shuffle', android: 'shuffle' }, onPress: onShuffle },
    ...(grid ? [] : carouselItems),
    {
      label: 'Select multiple',
      icon: { ios: 'checklist', android: 'checklist' },
      onPress: onSelectMultiple,
    },
    { label: 'Preview', icon: { ios: 'play', android: 'play_arrow' }, onPress: onPreview },
  ];

  return (
    <ActionMenu label="More options" items={items} disabled={disabled}>
      <View style={styles.trigger}>
        <Icon name={{ ios: 'ellipsis', android: 'more_horiz' }} size={19} />
      </View>
    </ActionMenu>
  );
}

const styles = StyleSheet.create({
  trigger: { width: 40, height: 40, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center' },
});
