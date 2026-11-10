'use client';

import { Alert, Button, Heading, Inline, Stack, Text } from '@blockle/blocks';
import { useRouter } from 'next/navigation';
import { type FC, type ReactNode, useState, useTransition } from 'react';

import {
  archiveCycle,
  discardCycle,
  renameCycle,
  startCycle,
} from '../../app/cycles/actions';
import {
  type ActionResult,
  fieldRefusal,
  rootRefusal,
} from '../../app/lib/action-result';
import { formatCost } from '../../app/lib/format-cost';
import { projectPath } from '../../app/lib/paths';
import type { Conversation } from '../../conversations/conversations';
import type { Cycle } from '../../tickets/cycles';
import { archiveCycleConfirmation } from '../archive-cycle-confirmation/archive-cycle-confirmation';
import { useConversationDialog } from '../conversation-dialog-provider/conversation-dialog-provider';
import { DateTime } from '../date-time/date-time';
import { InlineEdit } from '../inline-edit/inline-edit';

export type CycleHeaderProps = {
  cycle: Cycle;
  /** The Project's Active Cycle, which starting a Prepared one archives. */
  activeCycle?: Cycle;
  /**
   * A Prepared Cycle's Estimate (GLOSSARY: Estimate): the per-Ticket cost, or
   * null without enough Run outcomes, and the units of work planned.
   */
  estimate?: { totalUsd: number | null; units: number };
  /**
   * An Archived Cycle's Retro, closed or not, which Open Retro opens; null or
   * left out when it has none.
   */
  retro?: Conversation | null;
  /** More buttons beside the Cycle's own, such as Triage N (T1318). */
  actions?: ReactNode;
};

type CycleTitleProps = {
  cycle: Cycle;
};

/**
 * The Cycle's title as a heading that edits in place, unless the Cycle is
 * Archived.
 */
const CycleTitle: FC<CycleTitleProps> = ({ cycle }) => {
  const saveTitle = async (title: string) => {
    const result = await renameCycle({ cycleId: cycle.id, title });
    return fieldRefusal(result, 'title') ?? rootRefusal(result);
  };

  return (
    <InlineEdit
      value={cycle.title}
      label="Cycle title"
      onSave={saveTitle}
      readOnly={cycle.state === 'Archived'}
      wrap={(title) => <Heading level={2}>{title}</Heading>}
    />
  );
};

/**
 * The head of a Cycle's page: its title, editable in place, and its state.
 * A Prepared Cycle can be started, after the User confirms archiving the
 * Active one if there is one, or discarded. An Active one can be archived.
 * Discarding or archiving goes back to the Backlog; an Archived Cycle is
 * read-only, but offers Open Retro when it has a Retro, so a Retro whose tab
 * was closed stays reachable (T1189).
 */
export const CycleHeader: FC<CycleHeaderProps> = ({
  cycle,
  activeCycle,
  estimate,
  retro,
  actions,
}) => {
  const router = useRouter();
  const dialog = useConversationDialog();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  /** Runs a Cycle action, showing its refusal, then `onDone` if it succeeded. */
  const run = (
    action: (input: { cycleId: number }) => Promise<ActionResult>,
    onDone?: () => void,
  ) => {
    setError(undefined);
    startTransition(async () => {
      const result = await action({ cycleId: cycle.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDone?.();
    });
  };

  const start = () => {
    if (!activeCycle) {
      run(startCycle);
      return;
    }
    if (
      window.confirm(
        `Start "${cycle.title}" and archive the Active Cycle "${activeCycle.title}"? Its open Tickets move to "${cycle.title}".`,
      )
    ) {
      run(({ cycleId }) =>
        startCycle({
          cycleId,
          archiveActive: true,
          activeCycleId: activeCycle.id,
        }),
      );
    }
  };

  const archive = () => {
    if (window.confirm(archiveCycleConfirmation(cycle.title))) {
      run(archiveCycle, () => router.push(projectPath(cycle.projectId)));
    }
  };

  const openRetro = (closedOrOpen: Conversation) => {
    setError(undefined);
    startTransition(async () => {
      setError(await dialog.reopenAndOpen(closedOrOpen));
    });
  };

  const discard = () => {
    if (
      window.confirm(
        `Discard the Cycle "${cycle.title}"? Its Tickets go back to the Backlog.`,
      )
    ) {
      run(discardCycle, () => router.push(projectPath(cycle.projectId)));
    }
  };

  return (
    <Stack gap={2}>
      <Inline gap={3} alignY="center" justifyContent="space-between">
        <Inline gap={2} alignY="center">
          <CycleTitle cycle={cycle} />
          <Text fontSize="small" color="muted">
            {cycle.state === 'Archived' && cycle.archivedAt ? (
              <>
                Archived <DateTime date={cycle.archivedAt} />
              </>
            ) : (
              cycle.state
            )}
          </Text>
        </Inline>
        <Inline gap={2} alignY="center">
          {actions}
          {cycle.state === 'Prepared' && (
            <Inline gap={2} alignY="center">
              <Button
                type="button"
                variant="outline"
                intent="neutral"
                size="small"
                disabled={pending}
                onClick={discard}
              >
                Discard Cycle
              </Button>
              <Button
                type="button"
                size="small"
                disabled={pending}
                onClick={start}
              >
                Start Cycle
              </Button>
            </Inline>
          )}
          {cycle.state === 'Active' && (
            <Button
              type="button"
              variant="outline"
              intent="neutral"
              size="small"
              disabled={pending}
              onClick={archive}
            >
              Archive Cycle
            </Button>
          )}
          {cycle.state === 'Archived' && retro && (
            <Button
              type="button"
              variant="outline"
              intent="neutral"
              size="small"
              disabled={pending}
              onClick={() => openRetro(retro)}
            >
              Open Retro
            </Button>
          )}
        </Inline>
      </Inline>
      {cycle.state === 'Prepared' && estimate && (
        <Text fontSize="small" color="muted">
          {estimate.totalUsd === null
            ? 'Not enough runs to estimate'
            : `Estimated ≈ ${formatCost(estimate.totalUsd)} for ${estimate.units} ${estimate.units === 1 ? 'Ticket' : 'Tickets'}`}
        </Text>
      )}
      {error && <Alert intent="danger">{error}</Alert>}
    </Stack>
  );
};
