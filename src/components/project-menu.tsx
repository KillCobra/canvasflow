import { type ReactNode, useState } from 'react';
import { Pressable } from 'react-native';

import type { Folder } from '@/lib/projects';

import { MenuSheet } from './menu-sheet';

export type ProjectMenuProps = {
  children: ReactNode;
  title: string;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Folders offered under "Move to folder"; `folder` is the project's current one. */
  folders?: Folder[];
  folder?: string;
  /** Null moves the project back to All. */
  onMove?: (folder: string | null) => void;
  /** Make a folder and move the project into it. */
  onNewFolder?: () => void;
};

/** Long-press action sheet around a project card (the iOS build uses a native context menu). */
export function ProjectMenu({
  children,
  title,
  onRename,
  onDuplicate,
  onDelete,
  folders = [],
  folder,
  onMove,
  onNewFolder,
}: ProjectMenuProps) {
  const [sheet, setSheet] = useState<'actions' | 'folders' | null>(null);
  const close = () => setSheet(null);
  // Let the sheet finish closing before an alert or prompt opens on top.
  const then = (fn?: () => void) => () => {
    close();
    if (fn) setTimeout(fn, 250);
  };
  return (
    <>
      <Pressable onLongPress={() => setSheet('actions')}>{children}</Pressable>
      <MenuSheet
        visible={sheet === 'actions'}
        title={title}
        onClose={close}
        rows={[
          { label: 'Rename', icon: { ios: 'pencil', android: 'edit' }, onPress: then(onRename) },
          { label: 'Duplicate', icon: { ios: 'plus.square.on.square', android: 'content_copy' }, onPress: then(onDuplicate) },
          ...(onMove
            ? [{ label: 'Move to folder…', icon: { ios: 'folder', android: 'folder' } as const, onPress: () => setSheet('folders') }]
            : []),
          { label: 'Delete', icon: { ios: 'trash', android: 'delete' }, destructive: true, onPress: then(onDelete) },
        ]}
      />
      <MenuSheet
        visible={sheet === 'folders'}
        title="Move to folder"
        onClose={close}
        rows={[
          { label: 'All carousels', checked: !folder, onPress: then(() => onMove?.(null)) },
          ...folders.map((f) => ({ label: f.name, checked: f.id === folder, onPress: then(() => onMove?.(f.id)) })),
          ...(onNewFolder ? [{ label: 'New folder…', onPress: then(onNewFolder) }] : []),
        ]}
      />
    </>
  );
}
