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
  overview,
  disabled,
  onOverview,
  onSelectMultiple,
  onPreview,
}: {
  overview: boolean;
  disabled?: boolean;
  onOverview: () => void;
  onSelectMultiple: () => void;
  onPreview: () => void;
}) {
  const aspect = useEditor((s) => s.doc?.aspect ?? '4:5');
  const setAspect = useEditor((s) => s.setAspect);
  const snapping = useEditorPrefs((s) => s.snapping);
  const setSnapping = useEditorPrefs((s) => s.setSnapping);

  const items: MenuItem[] = [
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
    {
      label: 'Snapping',
      icon: { ios: 'squareshape.split.2x2.dotted', android: 'grid_4x4' },
      toggle: true,
      checked: snapping,
      onPress: () => setSnapping(!snapping),
    },
    {
      label: 'Select multiple',
      icon: { ios: 'checklist', android: 'checklist' },
      separator: true,
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
