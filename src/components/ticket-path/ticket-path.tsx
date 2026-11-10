import { Stack } from '@blockle/blocks';
import type { FC, ReactNode } from 'react';

import { type BoardSection, boardSectionPath } from '../../app/lib/paths';
import { FlowArrow } from '../flow-arrow/flow-arrow';
import { FlowConnector } from '../flow-connector/flow-connector';
import { FlowStep } from '../flow-step/flow-step';

/** How many Tickets are in each Board section of the Active Cycle now. */
export type ActiveCycleCounts = {
  queued: number;
  yourWork: number;
  inFlight: number;
  actionNeeded: number;
  review: number;
  done: number;
};

export type TicketPathProps = {
  /** The Backlog's Board. */
  backlogPath: string;
  /** How many Tickets wait in the Backlog's Intake. */
  backlogIntake: number;
  /** The Active Cycle's Board and its counts, or null without one. */
  activeCycle: { path: string; counts: ActiveCycleCounts } | null;
  /** Whether the Project's Auto-merge is on (ADR 0043). */
  autoMerge: boolean;
};

/**
 * The Ticket path on Flow (ADR 0044): New Ticket to Done, top to bottom, with
 * who acts at each step, the Board section it shows in and how many Tickets
 * are there now, by the Board's own Lane derivation, each linking to that
 * section.
 */
export const TicketPath: FC<TicketPathProps> = ({
  backlogPath,
  backlogIntake,
  activeCycle,
  autoMerge,
}) => {
  /** A count on the Active Cycle's Board, or none without one. */
  const onCycle = (count: keyof ActiveCycleCounts, section: BoardSection) =>
    activeCycle
      ? {
          count: activeCycle.counts[count],
          href: boardSectionPath(activeCycle.path, section),
        }
      : undefined;
  const noCycle = activeCycle ? null : (
    <>No Active Cycle: start one to show its Tickets here.</>
  );
  const withNote = (note: ReactNode) =>
    noCycle ? (
      <>
        {note} {noCycle}
      </>
    ) : (
      note
    );
  return (
    <Stack
      gap={0}
      listStyle="none"
      role="list"
      aria-label="Ticket path"
      asChild
    >
      <ol>
        <li>
          <FlowStep title="New Ticket" actors={['You', 'Agent']}>
            You or an Agent files it, in the Backlog or a Cycle.
          </FlowStep>
        </li>
        <li>
          <FlowArrow />
          <FlowStep
            title="Intake"
            actors={['You', 'Autopilot']}
            section="Board: Needs you → Intake"
            count={{
              count: backlogIntake,
              href: boardSectionPath(backlogPath, 'intake'),
            }}
          >
            Untriaged: no state label, needs-triage or needs-info. With
            Auto-triage on, Autopilot starts a Triage run on the oldest.
          </FlowStep>
        </li>
        <li>
          <FlowArrow />
          <FlowStep title="Triage" actors={['You', 'Agent']}>
            A Triage run proposes a category and a state; you approve or reject
            each proposal, or triage by hand.
          </FlowStep>
        </li>
        <li>
          <FlowConnector
            branches={[
              {
                key: 'queued',
                label: 'ready-for-agent',
                children: (
                  <FlowStep
                    title="Queued"
                    actors={['Autopilot']}
                    section="Board: Queued"
                    count={onCycle('queued', 'queued')}
                  >
                    {withNote(
                      'Autopilot starts Eligible work in Todo order, within the run limits. An Epic is queued once it has children; they run in one run on one branch.',
                    )}
                  </FlowStep>
                ),
              },
              {
                key: 'your-work',
                label: 'ready-for-human',
                children: (
                  <FlowStep
                    title="Your work"
                    actors={['You']}
                    section="Board: Needs you → Your work"
                    count={onCycle('yourWork', 'your-work')}
                  >
                    {withNote('Autopilot leaves it to you.')}
                  </FlowStep>
                ),
              },
            ]}
          />
        </li>
        <li>
          <FlowArrow label="a Start run" />
          <FlowStep
            title="In flight"
            actors={['Agent']}
            section="Board: In flight; a run that stops or asks waits in Needs you → Action needed"
            count={onCycle('inFlight', 'in-flight')}
          >
            {withNote(
              activeCycle
                ? `An Agent builds it in its own worktree and opens a pull request. ${activeCycle.counts.actionNeeded} in Action needed.`
                : 'An Agent builds it in its own worktree and opens a pull request.',
            )}
          </FlowStep>
        </li>
        <li>
          <FlowArrow label="a pull request" />
          <FlowStep
            title="Review"
            actors={['You']}
            section="Board: Needs you → Review"
            count={onCycle('review', 'review')}
          >
            {withNote('Its pull request waits for your review.')}
          </FlowStep>
        </li>
        <li>
          <FlowArrow />
          <FlowStep title="Merge gate" actors={autoMerge ? ['Agent'] : ['You']}>
            {autoMerge
              ? 'Auto-merge is on: a run merges its own pull request once its checks, its review and every acceptance criterion pass, and hands it to you when they do not.'
              : 'A run never merges its own pull request: you approve each merge with Approve merge, and a Merge run merges it.'}
          </FlowStep>
        </li>
        <li>
          <FlowArrow />
          <FlowStep
            title="Done"
            actors={['Agent']}
            section="Board: Done"
            count={onCycle('done', 'done')}
          >
            {withNote('The pull request is merged and the Ticket is finished.')}
          </FlowStep>
        </li>
      </ol>
    </Stack>
  );
};
