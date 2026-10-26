'use client';

import { Heading } from '@blockle/blocks';
import type { FC, ReactNode } from 'react';

import { renameProject } from '../../app/projects/actions';
import type { Project } from '../../tickets/tickets';
import { InlineEdit } from '../inline-edit/inline-edit';

export type RenameProjectInlineEditProps = {
  project: Project;
};

const asHeading = (text: ReactNode) => <Heading level={1}>{text}</Heading>;

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
    const result = await renameProject({ projectId: project.id, name });
    return result.ok ? undefined : result.error;
  };

  return (
    <InlineEdit
      value={project.name}
      label="Project name"
      onSave={save}
      readOnly={project.archived}
      renderText={asHeading}
    />
  );
};
