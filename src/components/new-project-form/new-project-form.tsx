'use client';

import {
  Alert,
  Button,
  Checkbox,
  Label,
  Stack,
  Text,
  TextInput,
} from '@blockle/blocks';
import { useRouter } from 'next/navigation';
import { type FC, useId, useState } from 'react';
import { useForm } from 'react-hook-form';

import { callAction } from '../../app/lib/call-action';
import { projectPath } from '../../app/lib/paths';
import {
  type CreateProjectResult,
  createProject,
  type DetectedRepository,
  detectProjectRepository,
} from '../../app/projects/actions';
import { CheckCommandField } from '../check-command-field/check-command-field';
import { FieldError } from '../field-error/field-error';

export type NewProjectFormProps = {
  /** Called after the Project is created, before navigating to its Board. */
  onCreated?: () => void;
};

type NewProjectValues = {
  name: string;
  repositoryPath: string;
  checkCommand: string;
  acceptTemplate: boolean;
};

/** The last folder segment, which names a Project by default. */
function folderName(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? '';
}

/**
 * Adds a Project by name, or by the folder of its repository: the folder is
 * detected first, and its fields (name, Check command, Reference template)
 * stay editable before the Project is created in one go.
 */
export const NewProjectForm: FC<NewProjectFormProps> = ({ onCreated }) => {
  const router = useRouter();
  const inputId = useId();
  const errorId = useId();
  const folderId = useId();
  const folderErrorId = useId();
  const [detected, setDetected] = useState<DetectedRepository | null>(null);
  const {
    formState: { errors, isSubmitting },
    getValues,
    handleSubmit,
    register,
    setError,
    setValue,
    watch,
  } = useForm<NewProjectValues>({
    defaultValues: {
      name: '',
      repositoryPath: '',
      checkCommand: '',
      acceptTemplate: false,
    },
  });
  const error = errors.root?.server?.message;
  const folderError = errors.repositoryPath?.message;
  const folder = watch('repositoryPath').trim();
  const checkError = errors.checkCommand?.message;
  const checkCommand = watch('checkCommand');
  const showDetected = detected !== null && detected.path === folder;
  const needsDetection = folder !== '' && !showDetected;

  const detect = async () => {
    const result = await callAction(
      () => detectProjectRepository({ path: folder }),
      'The repository could not be detected. Try again.',
    );
    if (!result.ok) {
      setError('repositoryPath', { type: 'server', message: result.error });
      return;
    }
    const { repository } = result;
    setDetected(repository);
    if (getValues('name').trim() === '') {
      setValue('name', folderName(repository.path));
    }
    setValue('checkCommand', repository.checkCommands[0] ?? '');
    setValue('acceptTemplate', repository.referenceTemplate !== null);
  };

  const submit = handleSubmit(async (values) => {
    if (needsDetection) {
      await detect();
      return;
    }
    const checked = values.checkCommand.trim();
    const result: CreateProjectResult = await callAction(
      () =>
        createProject({
          name: values.name,
          ...(folder === ''
            ? {}
            : {
                repositoryPath: folder,
                checkCommand: checked === '' ? null : checked,
                ...(values.acceptTemplate && detected?.referenceTemplate
                  ? { referenceTemplate: detected.referenceTemplate }
                  : {}),
              }),
        }),
      'The Project could not be created. Try again.',
    );
    if (!result.ok) {
      const onFolder = result.fieldErrors?.repositoryPath;
      const onCheck = result.fieldErrors?.checkCommand;
      if (onFolder) {
        setError('repositoryPath', { type: 'server', message: onFolder });
      } else if (onCheck) {
        setError('checkCommand', { type: 'server', message: onCheck });
      } else {
        setError('root.server', { message: result.error });
      }
      return;
    }
    onCreated?.();
    router.push(projectPath(result.projectId));
  });

  // While the Project saves, a second submit is ignored, so it is created once.
  return (
    <form
      onSubmit={(event) => {
        if (isSubmitting) {
          event.preventDefault();
          return;
        }
        submit(event);
      }}
    >
      <Stack gap={3}>
        <Stack gap={1}>
          <Label htmlFor={inputId}>Project name</Label>
          <TextInput
            {...register('name')}
            id={inputId}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
        </Stack>
        <Stack gap={1}>
          <Label htmlFor={folderId}>Repository folder (optional)</Label>
          <TextInput
            {...register('repositoryPath')}
            id={folderId}
            placeholder="/Users/you/Projects/website"
            autoComplete="off"
            aria-invalid={folderError ? true : undefined}
            aria-describedby={folderError ? folderErrorId : undefined}
          />
          <FieldError id={folderErrorId} reason={folderError} />
        </Stack>
        {showDetected && detected && (
          <Stack gap={3}>
            <Stack gap={1}>
              <Text tag="p" fontSize="small" color="muted">
                Default branch
              </Text>
              <Text tag="p">{detected.defaultBranch ?? 'Not detected'}</Text>
              <Text tag="p" fontSize="small" color="muted">
                Origin remote
              </Text>
              <Text tag="p">{detected.remote ?? 'None'}</Text>
            </Stack>
            <CheckCommandField
              registration={register('checkCommand')}
              value={checkCommand}
              error={checkError}
              candidates={detected.checkCommands}
              onUse={(candidate) => setValue('checkCommand', candidate)}
            />
            {detected.referenceTemplate && (
              <Checkbox {...register('acceptTemplate')}>
                Add Reference template {detected.referenceTemplate.prefix}{' '}
                linking to {detected.referenceTemplate.url}
              </Checkbox>
            )}
          </Stack>
        )}
        {error && (
          <Alert id={errorId} intent="danger">
            {error}
          </Alert>
        )}
        <Button type="submit" alignSelf="flex-start" loading={isSubmitting}>
          {needsDetection ? 'Detect repository' : 'Create Project'}
        </Button>
      </Stack>
    </form>
  );
};
