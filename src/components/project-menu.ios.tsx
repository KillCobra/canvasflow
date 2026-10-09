import { Host } from '@expo/ui';
import { Button, ContextMenu, RNHostView } from '@expo/ui/swift-ui';
import type { ReactElement } from 'react';

import type { ProjectMenuProps } from './project-menu';

/** Native iOS context menu (long press, with the lifted preview) around a project card. */
export function ProjectMenu({ children, onRename, onDuplicate, onDelete }: ProjectMenuProps) {
  return (
    <Host matchContents>
      <ContextMenu>
        <ContextMenu.Items>
          <Button systemImage="pencil" label="Rename" onPress={onRename} />
          <Button systemImage="plus.square.on.square" label="Duplicate" onPress={onDuplicate} />
          <Button systemImage="trash" role="destructive" label="Delete" onPress={onDelete} />
        </ContextMenu.Items>
        <ContextMenu.Trigger>
          <RNHostView matchContents>{children as ReactElement}</RNHostView>
        </ContextMenu.Trigger>
      </ContextMenu>
    </Host>
  );
}
