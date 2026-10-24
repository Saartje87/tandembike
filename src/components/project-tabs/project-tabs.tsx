'use client';

import {
  Box,
  Button,
  Inline,
  Label,
  TextInput,
  VisuallyHidden,
} from '@blockle/blocks';
import { useRouter } from 'next/navigation';
import { type FC, useId, useState } from 'react';
import { useForm } from 'react-hook-form';

import { createCycle } from '../../app/cycles/actions';
import { cyclePath, projectPath } from '../../app/lib/paths';
import type { Cycle } from '../../tickets/cycles';
import { AppLink } from '../app-link/app-link';
import { FieldError } from '../field-error/field-error';
import * as styles from './project-tabs.css';

export type ProjectTabsProps = {
  projectId: number;
  /** The Project's Cycles; a tab shows for each that is not Archived. */
  cycles: Cycle[];
  /** The tab on screen: the Backlog, or a Cycle by id. */
  current: 'backlog' | number;
};

type TabProps = {
  href: string;
  current: boolean;
  children: string;
};

const Tab: FC<TabProps> = ({ href, current, children }) => (
  <Box
    asChild
    backgroundColor={current ? 'primary-100' : 'transparent'}
    borderRadius={2}
    paddingBlock={1}
    paddingInline={3}
  >
    <li>
      <AppLink
        href={href}
        variant="inherit"
        aria-current={current ? 'page' : undefined}
      >
        {children}
      </AppLink>
    </li>
  </Box>
);

type NewCycleFormProps = {
  projectId: number;
  onDone: () => void;
};

/**
 * A title field that creates a Prepared Cycle on Enter and opens its tab;
 * Escape cancels. The module's reason for a refusal shows under the field.
 */
const NewCycleForm: FC<NewCycleFormProps> = ({ projectId, onDone }) => {
  const router = useRouter();
  const titleId = useId();
  const errorId = useId();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<{ title: string }>({ defaultValues: { title: '' } });
  const reason = errors.title?.message ?? errors.root?.server?.message;

  const submit = handleSubmit(async ({ title }) => {
    const result = await createCycle({ projectId, title });
    if (!result.ok) {
      const titleReason = result.fieldErrors?.title;
      if (titleReason) {
        setError('title', { type: 'server', message: titleReason });
      } else {
        setError('root.server', { message: result.error });
      }
      return;
    }
    onDone();
    router.push(cyclePath(projectId, result.cycleId));
  });

  return (
    <form onSubmit={submit}>
      <Label htmlFor={titleId}>
        <VisuallyHidden>New Cycle title</VisuallyHidden>
      </Label>
      <TextInput
        {...register('title')}
        id={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !isSubmitting) {
            event.preventDefault();
            onDone();
          }
        }}
        placeholder="The Cycle's goal…"
        autoComplete="off"
        autoFocus
        readOnly={isSubmitting}
        aria-invalid={reason ? true : undefined}
        aria-describedby={reason ? errorId : undefined}
      />
      <FieldError id={errorId} reason={reason} />
    </form>
  );
};

/**
 * A Project's views as tabs: its Backlog, its Active Cycle, then each
 * Prepared one, with a New Cycle button that adds one.
 */
export const ProjectTabs: FC<ProjectTabsProps> = ({
  projectId,
  cycles,
  current,
}) => {
  const [adding, setAdding] = useState(false);

  return (
    <Inline gap={3} alignY="center">
      <nav aria-label="Project views">
        <Inline tag="ul" gap={1} className={styles.tabList}>
          <Tab href={projectPath(projectId)} current={current === 'backlog'}>
            Backlog
          </Tab>
          {[
            ...cycles.filter((cycle) => cycle.state === 'Active'),
            ...cycles.filter((cycle) => cycle.state === 'Prepared'),
          ].map((cycle) => (
            <Tab
              key={cycle.id}
              href={cyclePath(projectId, cycle.id)}
              current={current === cycle.id}
            >
              {cycle.title}
            </Tab>
          ))}
        </Inline>
      </nav>
      {adding ? (
        <NewCycleForm projectId={projectId} onDone={() => setAdding(false)} />
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="small"
          onClick={() => setAdding(true)}
        >
          New Cycle
        </Button>
      )}
    </Inline>
  );
};
