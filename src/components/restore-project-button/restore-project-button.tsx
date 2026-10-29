'use client';

import { Alert, Button, Stack } from '@blockle/blocks';
import { type FC, useState, useTransition } from 'react';

import { restoreProject } from '../../app/projects/actions';
import type { Project } from '../../tickets/tickets';

export type RestoreProjectButtonProps = {
  project: Pick<Project, 'id' | 'name'>;
};

/** Restores an archived Project, with its Board and Tickets as they were. */
export const RestoreProjectButton: FC<RestoreProjectButtonProps> = ({
  project,
}) => {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const restore = () => {
    setError(undefined);
    startTransition(async () => {
      const result = await restoreProject({ projectId: project.id });
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

  return (
    <Stack gap={1}>
      <Button
        type="button"
        variant="solid"
        size="small"
        aria-label={`Restore ${project.name}`}
        disabled={pending}
        onClick={restore}
      >
        Restore
      </Button>
      {error && <Alert intent="danger">{error}</Alert>}
    </Stack>
  );
};
