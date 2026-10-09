import type { ReactNode } from 'react';
import { Alert, Pressable } from 'react-native';

export type ProjectMenuProps = {
  children: ReactNode;
  title: string;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

/** Long-press action sheet around a project card (the iOS build uses a native context menu). */
export function ProjectMenu({ children, title, onRename, onDuplicate, onDelete }: ProjectMenuProps) {
  return (
    <Pressable
      onLongPress={() =>
        Alert.alert(title, undefined, [
          { text: 'Rename', onPress: onRename },
          { text: 'Duplicate', onPress: onDuplicate },
          { text: 'Delete', style: 'destructive', onPress: onDelete },
          { text: 'Cancel', style: 'cancel' },
        ])
      }>
      {children}
    </Pressable>
  );
}
