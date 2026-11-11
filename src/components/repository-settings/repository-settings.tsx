'use client';

import { Alert, Button, Text } from '@blockle/blocks';
import { type FC, useState } from 'react';
import { useForm } from 'react-hook-form';

import { fieldRefusal, rootRefusal } from '../../app/lib/action-result';
import { callAction } from '../../app/lib/call-action';
import {
  detectProjectRepository,
  setProjectAgentSettings,
} from '../../app/projects/actions';
import type { Conversation } from '../../conversations/conversations';
import type { ProjectAgentSettings } from '../../tickets/tickets';
import { CheckCommandField } from '../check-command-field/check-command-field';
import { ProjectSetup } from '../project-setup/project-setup';
import { SettingSwitch } from '../setting-switch/setting-switch';
import { SettingsSection } from '../settings-section/settings-section';
import { SettingsTextField } from '../settings-text-field/settings-text-field';

export type RepositorySettingsProps = {
  projectId: number;
  /** The Project's saved settings. */
  settings: ProjectAgentSettings;
  /** The Project's latest Setup Conversation, if it ever held one. */
  latestSetup?: Conversation | null;
};

type RepositoryValues = {
  repositoryPath: string;
  checkCommand: string;
  prepareCommand: string;
};

const fields = ['repositoryPath', 'checkCommand', 'prepareCommand'] as const;

const valuesOf = (settings: ProjectAgentSettings): RepositoryValues => ({
  repositoryPath: settings.repositoryPath ?? '',
  checkCommand: settings.checkCommand ?? '',
  prepareCommand: settings.prepareCommand ?? '',
});

/** A command field's text as the setting, `null` when blank. */
const commandOf = (text: string) => (text.trim() === '' ? null : text);

/**
 * Repository, on a Project's Settings (T1435): the repository path with
 * Detect and the Check and Prepare commands, saved with the section's Save,
 * and Parallel runs, saved at once, offering Setup under itself when turned
 * on while agent mode is on.
 */
export const RepositorySettings: FC<RepositorySettingsProps> = ({
  projectId,
  settings,
  latestSetup = null,
}) => {
  const [candidates, setCandidates] = useState<string[] | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [offer, setOffer] = useState(false);
  const {
    clearErrors,
    formState: { errors, isDirty, isSubmitting },
    getValues,
    handleSubmit,
    register,
    reset,
    setError,
    setValue,
    watch,
  } = useForm<RepositoryValues>({ defaultValues: valuesOf(settings) });
  const hasPath = settings.repositoryPath !== null;
  const serverError = errors.root?.server?.message;

  /** Re-runs detection for the path in the field and offers its candidates. */
  const detect = async () => {
    setDetecting(true);
    try {
      const result = await callAction(
        () => detectProjectRepository({ path: getValues('repositoryPath') }),
        'The repository could not be detected. Try again.',
      );
      if (result.ok) {
        clearErrors('repositoryPath');
        setCandidates(result.repository.checkCommands);
      } else {
        setCandidates(null);
        setError('repositoryPath', { type: 'server', message: result.error });
      }
    } finally {
      setDetecting(false);
    }
  };

  const submit = handleSubmit(async (values) => {
    const result = await callAction(
      () =>
        setProjectAgentSettings({
          projectId,
          repositoryPath: values.repositoryPath,
          checkCommand: commandOf(values.checkCommand),
          prepareCommand: commandOf(values.prepareCommand),
        }),
      'The repository settings could not be saved. Try again.',
    );
    if (result.ok) {
      reset(values);
      return;
    }
    let named = false;
    for (const field of fields) {
      const message = fieldRefusal(result, field);
      if (message) {
        setError(field, { type: 'server', message });
        named = true;
      }
    }
    if (!named) {
      setError('root.server', { message: rootRefusal(result) });
    }
  });

  return (
    <form aria-label="Repository settings" onSubmit={submit}>
      <SettingsSection
        section="repository"
        title="Repository"
        description="Where Agent runs start, and what green means there."
        help={
          <>
            <Text tag="p" fontSize="small" color="muted">
              Start runs must see the Check command pass before they open a pull
              request; without one they follow the repository's own
              instructions.
            </Text>
            <Text tag="p" fontSize="small" color="muted">
              The Prepare command runs in each new worktree before its run
              starts, so the run finds its dependencies ready. A failing command
              starts no run.
            </Text>
            <Text tag="p" fontSize="small" color="muted">
              With Parallel runs off, one Start runs at a time in this
              repository. On, Starts overlap, each in a worktree of its own, up
              to the machine cap set in Settings.
            </Text>
          </>
        }
        dirty={isDirty}
        saving={isSubmitting}
        onDiscard={() => {
          reset();
          setCandidates(null);
        }}
      >
        <SettingsTextField
          registration={register('repositoryPath')}
          label="Repository path"
          anchor="repository-path"
          placeholder="/Users/you/Projects/website"
          error={errors.repositoryPath?.message}
        >
          <div>
            <Button
              type="button"
              size="small"
              variant="ghost"
              loading={detecting}
              onClick={detect}
            >
              Detect
            </Button>
          </div>
        </SettingsTextField>
        <div id="check-command">
          <CheckCommandField
            registration={register('checkCommand')}
            value={watch('checkCommand')}
            error={errors.checkCommand?.message}
            candidates={candidates}
            onUse={(candidate) =>
              setValue('checkCommand', candidate, { shouldDirty: true })
            }
          >
            <Text tag="p" fontSize="small" color="muted">
              Must pass before a run opens a pull request. Empty follows the
              repository's own instructions.
            </Text>
          </CheckCommandField>
        </div>
        <SettingsTextField
          registration={register('prepareCommand')}
          label="Prepare command"
          anchor="prepare-command"
          placeholder="npm ci"
          hint="Runs in each new worktree before its run starts."
          error={errors.prepareCommand?.message}
        />
        {serverError && <Alert intent="danger">{serverError}</Alert>}
        <SettingSwitch
          projectId={projectId}
          setting="parallelRuns"
          label="Parallel runs"
          hint={
            hasPath
              ? 'Let Starts overlap, each in its own worktree, up to the machine cap.'
              : 'Save a repository path to turn on Parallel runs.'
          }
          checked={settings.parallelRuns}
          disabled={!hasPath}
          onSaved={(on) => setOffer(on && settings.agentMode)}
        >
          {offer && (
            <ProjectSetup
              projectId={projectId}
              agentMode
              offer="parallel-runs"
              latestSetup={latestSetup}
            />
          )}
        </SettingSwitch>
      </SettingsSection>
    </form>
  );
};
