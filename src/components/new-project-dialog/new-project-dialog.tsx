'use client';

import { Button, Dialog, Heading, Stack } from '@blockle/blocks';
import { type FC, useId, useState } from 'react';

import { NewProjectForm } from '../new-project-form/new-project-form';

export const NewProjectDialog: FC = () => {
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const close = () => setOpen(false);

  return (
    <>
      <Button variant="outline" size="small" onClick={() => setOpen(true)}>
        New Project
      </Button>
      <Dialog open={open} onRequestClose={close} aria-labelledby={headingId}>
        {open && (
          <Stack gap={4}>
            <Heading id={headingId} level={2}>
              New Project
            </Heading>
            <NewProjectForm onCreated={close} />
            <Button variant="ghost" alignSelf="flex-start" onClick={close}>
              Cancel
            </Button>
          </Stack>
        )}
      </Dialog>
    </>
  );
};
