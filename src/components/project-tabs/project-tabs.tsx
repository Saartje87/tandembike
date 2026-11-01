'use client';

import {
  Button,
  Inline,
  Label,
  Tab,
  TabNav,
  Tag,
  TextInput,
  VisuallyHidden,
} from '@blockle/blocks';
import {
  useRouter,
  useSearchParams,
  useSelectedLayoutSegments,
} from 'next/navigation';
import { type FC, useId, useState } from 'react';
import { useForm } from 'react-hook-form';

import { createCycle } from '../../app/cycles/actions';
import {
  boardFilterOf,
  cyclePath,
  cyclesPath,
  filteredBoardPath,
  projectPath,
  projectSettingsPath,
} from '../../app/lib/paths';
import { openCyclesInOrder } from '../../tickets/cycle-state';
import type { Cycle, OpenTicketCounts } from '../../tickets/cycles';
import { AppLink } from '../app-link/app-link';
import { FieldError } from '../field-error/field-error';

export type ProjectTabsProps = {
  projectId: number;
  /** The Project's Cycles; a tab shows for each that is not Archived. */
  cycles: Cycle[];
  /** The open Tickets of the Backlog and of each Cycle, unfiltered. */
  openTicketCounts: OpenTicketCounts;
};

/** A tab of the Project: the Backlog, a Cycle by id, the History or Settings. */
type CurrentTab = 'backlog' | 'history' | 'settings' | number;

/**
 * The tab on screen, from the URL's `segments` below the Project: an
 * Archived Cycle belongs to the History.
 */
function currentTab(segments: string[], cycles: Cycle[]): CurrentTab | null {
  const [segment, cycleId] = segments;
  if (segment === undefined) {
    return 'backlog';
  }
  if (segment === 'cycles') {
    return 'history';
  }
  if (segment === 'settings') {
    return 'settings';
  }
  const cycle =
    segment === 'cycle'
      ? cycles.find(({ id }) => String(id) === cycleId)
      : undefined;
  if (!cycle) {
    return null;
  }
  return cycle.state === 'Archived' ? 'history' : cycle.id;
}

type ProjectTabProps = {
  href: string;
  current: boolean;
  children: string;
  /** The open Tickets on the tab's Board, shown in a badge when given. */
  openTickets?: number;
};

const ProjectTab: FC<ProjectTabProps> = ({
  href,
  current,
  children,
  openTickets,
}) => (
  <Tab
    asChild
    current={current}
    // The badge sits outside the link (a Tab's slots do), so it is only shown
    // here; the count is read out as part of the link's name below.
    endSlot={openTickets !== undefined && <Tag aria-hidden>{openTickets}</Tag>}
  >
    <AppLink href={href} intent="inherit">
      {children}
      {openTickets !== undefined && (
        <>
          {' '}
          <VisuallyHidden>
            {`${openTickets} open ${openTickets === 1 ? 'Ticket' : 'Tickets'}`}
          </VisuallyHidden>
        </>
      )}
    </AppLink>
  </Tab>
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
 * A Project's views as tabs: its Backlog, its Active Cycle, each Prepared
 * one, the History of archived ones and its Settings, with a New Cycle
 * button that adds one. The Backlog's and each Cycle's tab shows its open
 * Tickets in a badge, whatever the Board filter. It marks the tab on screen
 * from the URL, so the Project's layout can keep it mounted across its tabs,
 * and carries the Board filter in the URL from one Board's tab to another's.
 */
export const ProjectTabs: FC<ProjectTabsProps> = ({
  projectId,
  cycles,
  openTicketCounts,
}) => {
  const [adding, setAdding] = useState(false);
  const current = currentTab(useSelectedLayoutSegments(), cycles);
  const searchParams = useSearchParams();
  const filter = boardFilterOf(
    searchParams.get('q') ?? undefined,
    searchParams.getAll('label'),
  );

  return (
    <Inline gap={3} alignY="center">
      <TabNav aria-label="Project views">
        <ProjectTab
          href={filteredBoardPath(projectPath(projectId), filter)}
          current={current === 'backlog'}
          openTickets={openTicketCounts.backlog}
        >
          Backlog
        </ProjectTab>
        {openCyclesInOrder(cycles).map((cycle) => (
          <ProjectTab
            key={cycle.id}
            href={filteredBoardPath(cyclePath(projectId, cycle.id), filter)}
            current={current === cycle.id}
            openTickets={openTicketCounts.cycles[cycle.id] ?? 0}
          >
            {cycle.title}
          </ProjectTab>
        ))}
        <ProjectTab
          href={cyclesPath(projectId)}
          current={current === 'history'}
        >
          History
        </ProjectTab>
        <ProjectTab
          href={projectSettingsPath(projectId)}
          current={current === 'settings'}
        >
          Settings
        </ProjectTab>
      </TabNav>
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
