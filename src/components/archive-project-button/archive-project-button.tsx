'use client';

import { Alert, Button, Stack } from '@blockle/blocks';
import { type FC, useState, useTransition } from 'react';

import { archiveProject } from '../../app/projects/actions';
import type { Project } from '../../tickets/tickets';

export type ArchiveProjectButtonProps = {
  project: Pick<Project, 'id' | 'name'>;
};

/**
 * Archives a Project: it leaves the Project lists and its Board, with its
 * Tickets kept read-only, until it is restored from the archived Projects.
 */
export const ArchiveProjectButton: FC<ArchiveProjectButtonProps> = ({
  project,
}) => {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const archive = () => {
    setError(undefined);
    startTransition(async () => {
      const result = await archiveProject({ projectId: project.id });
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

  return (
    <Stack gap={1}>
      <Button
        type="button"
        variant="outline"
        intent="neutral"
        size="small"
        aria-label={`Archive ${project.name}`}
        disabled={pending}
        onClick={archive}
      >
        Archive
      </Button>
      {error && <Alert intent="error">{error}</Alert>}
    </Stack>
  );
};
