import { Host } from '@expo/ui';
import { Button, ContextMenu, Divider, RNHostView } from '@expo/ui/swift-ui';
import type { ReactElement } from 'react';

import type { ProjectMenuProps } from './project-menu';

/** Native iOS context menu (long press, with the lifted preview) around a project card. */
export function ProjectMenu({
  children,
  onRename,
  onDuplicate,
  onDelete,
  folders = [],
  folder,
  onMove,
  onNewFolder,
}: ProjectMenuProps) {
  return (
    <Host matchContents>
      <ContextMenu>
        <ContextMenu.Items>
          <Button systemImage="pencil" label="Rename" onPress={onRename} />
          <Button systemImage="plus.square.on.square" label="Duplicate" onPress={onDuplicate} />
          {onMove && (
            // A nested menu is a submenu, labelled by its trigger.
            <ContextMenu>
              <ContextMenu.Items>
                <Button
                  systemImage={folder ? 'square.grid.2x2' : 'checkmark'}
                  label="All carousels"
                  onPress={() => onMove(null)}
                />
                {folders.map((f) => (
                  <Button
                    key={f.id}
                    systemImage={f.id === folder ? 'checkmark' : 'folder'}
                    label={f.name}
                    onPress={() => onMove(f.id)}
                  />
                ))}
                {onNewFolder && <Divider />}
                {onNewFolder && <Button systemImage="folder.badge.plus" label="New folder…" onPress={onNewFolder} />}
              </ContextMenu.Items>
              <ContextMenu.Trigger>
                <Button systemImage="folder" label="Move to folder" />
              </ContextMenu.Trigger>
            </ContextMenu>
          )}
          <Button systemImage="trash" role="destructive" label="Delete" onPress={onDelete} />
        </ContextMenu.Items>
        <ContextMenu.Trigger>
          <RNHostView matchContents>{children as ReactElement}</RNHostView>
        </ContextMenu.Trigger>
      </ContextMenu>
    </Host>
  );
}
