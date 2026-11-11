'use client';

import { Box, Inline, Stack, Text } from '@blockle/blocks';
import type { FC } from 'react';
import { useForm } from 'react-hook-form';

import { fieldRefusal, rootRefusal } from '../../app/lib/action-result';
import { callAction } from '../../app/lib/call-action';
import { modeColors } from '../../app/lib/mode-colors';
import { renameProject } from '../../app/projects/actions';
import type { Project } from '../../tickets/tickets';
import { ArchiveProjectButton } from '../archive-project-button/archive-project-button';
import { ProjectStyleSetting } from '../project-style-setting/project-style-setting';
import { SettingsSection } from '../settings-section/settings-section';
import { SettingsTextField } from '../settings-text-field/settings-text-field';

export type GeneralSettingsProps = {
  project: Pick<Project, 'id' | 'name' | 'color' | 'icon'>;
};

/** Archive, below General's card. */
const DangerZone: FC<GeneralSettingsProps> = ({ project }) => (
  <Box
    borderWidth="thin"
    borderStyle="solid"
    borderColor={modeColors.danger}
    borderRadius={3}
    padding={[3, 4]}
  >
    <Inline gap={3} alignX="between" alignY="center">
      <Stack gap={1}>
        <Text tag="p" fontWeight="bold">
          Archive this Project
        </Text>
        <Text tag="p" fontSize="small" color="muted">
          It leaves the Project lists, with its Tickets kept read-only, until
          you restore it.
        </Text>
      </Stack>
      <ArchiveProjectButton project={project} />
    </Inline>
  </Box>
);

/**
 * General, on a Project's Settings (T1434): its name, saved with the
 * section's Save, its colour and icon, saved as picked, and Archive in a
 * danger zone under the card.
 */
export const GeneralSettings: FC<GeneralSettingsProps> = ({ project }) => {
  const {
    formState: { errors, isDirty, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<{ name: string }>({ defaultValues: { name: project.name } });

  const submit = handleSubmit(async ({ name }) => {
    const result = await callAction(
      () => renameProject({ projectId: project.id, name }),
      'The name could not be saved. Try again.',
    );
    if (result.ok) {
      reset({ name: result.name });
      return;
    }
    setError('name', {
      type: 'server',
      message: fieldRefusal(result, 'name') ?? rootRefusal(result),
    });
  });

  return (
    <form aria-label="General settings" onSubmit={submit}>
      <SettingsSection
        section="general"
        title="General"
        description="The Project's name and how it looks in the sidebar."
        dirty={isDirty}
        saving={isSubmitting}
        onDiscard={() => reset()}
        after={<DangerZone project={project} />}
      >
        <SettingsTextField
          registration={register('name')}
          label="Name"
          error={errors.name?.message}
        />
        <Stack gap={1}>
          <Text tag="p" fontWeight="bold">
            Colour and icon
          </Text>
          <Inline gap={2} alignY="center">
            <ProjectStyleSetting project={project} />
            <Text tag="span" fontSize="small" color="muted">
              Saved as you pick.
            </Text>
          </Inline>
        </Stack>
      </SettingsSection>
    </form>
  );
};
