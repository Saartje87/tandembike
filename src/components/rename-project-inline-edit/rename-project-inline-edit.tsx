'use client';

import { Heading } from '@blockle/blocks';
import type { FC } from 'react';

import { rootRefusal } from '../../app/lib/action-result';
import { callAction } from '../../app/lib/call-action';
import { renameProject } from '../../app/projects/actions';
import type { Project } from '../../tickets/tickets';
import { InlineEdit } from '../inline-edit/inline-edit';

export type RenameProjectInlineEditProps = {
  project: Project;
};

/**
 * A Project's name as its page heading, edited in place. A save shows the
 * new name at once; the Server Action revalidates the layout, so the side
 * navigation and breadcrumbs catch up when it answers. An archived
 * Project's name is plain text.
 */
export const RenameProjectInlineEdit: FC<RenameProjectInlineEditProps> = ({
  project,
}) => {
  const save = async (name: string) => {
    const result = await callAction(
      () => renameProject({ projectId: project.id, name }),
      'The name could not be saved. Try again.',
    );
    return rootRefusal(result);
  };

  return (
    <InlineEdit
      value={project.name}
      label="Project name"
      onSave={save}
      readOnly={project.archived}
      wrap={(name) => <Heading level={1}>{name}</Heading>}
    />
  );
};
