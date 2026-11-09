import { Stack } from '@blockle/blocks';
import { type FC, Fragment } from 'react';

import { AppLink } from '../app-link/app-link';
import { FlowArrow } from '../flow-arrow/flow-arrow';
import { FlowConnector } from '../flow-connector/flow-connector';
import { FlowStep } from '../flow-step/flow-step';

/** A Cycle named at its step, linking to its Board. */
export type CycleLink = { id: number; title: string; path: string };

export type CycleLoopProps = {
  /** The Backlog's Board. */
  backlogPath: string;
  /** The Project's Prepared Cycles, in tab order. */
  prepared: CycleLink[];
  /** The Project's Active Cycle, or null without one. */
  active: CycleLink | null;
};

type CycleLinksProps = { cycles: CycleLink[] };

/** The Cycles as links to their Boards, separated by commas. */
const CycleLinks: FC<CycleLinksProps> = ({ cycles }) =>
  cycles.map((cycle, index) => (
    <Fragment key={cycle.id}>
      {index > 0 && ', '}
      <AppLink href={cycle.path}>{cycle.title}</AppLink>
    </Fragment>
  ));

/**
 * The Cycle loop on Flow (ADR 0044): Backlog, Plan, Prepared Cycle, the
 * User starts it, Autopilot dispatches, complete, Retro and archive, with
 * this Project's Prepared and Active Cycles named at their steps.
 */
export const CycleLoop: FC<CycleLoopProps> = ({
  backlogPath,
  prepared,
  active,
}) => (
  <Stack gap={0} listStyle="none" role="list" aria-label="Cycle loop" asChild>
    <ol>
      <li>
        <FlowStep title="Backlog" actors={['You', 'Agent']}>
          Triaged work waits in the{' '}
          <AppLink href={backlogPath}>Backlog</AppLink> until it is planned into
          a Cycle.
        </FlowStep>
      </li>
      <li>
        <FlowConnector
          branches={[
            {
              key: 'plan',
              label: 'a Plan run',
              children: (
                <FlowStep title="Plan" actors={['Agent']}>
                  An Agent picks ready-for-agent work toward your goal and only
                  proposes a Prepared Cycle; it never starts one.
                </FlowStep>
              ),
            },
            {
              key: 'by-hand',
              label: 'by hand',
              children: (
                <FlowStep title="Plan by hand" actors={['You']}>
                  You create a Cycle and move Tickets into it.
                </FlowStep>
              ),
            },
          ]}
        />
      </li>
      <li>
        <FlowArrow />
        <FlowStep title="Prepared Cycle" actors={['You']}>
          {prepared.length === 0 ? (
            'No Prepared Cycle now.'
          ) : (
            <>
              Prepared now: <CycleLinks cycles={prepared} />.
            </>
          )}{' '}
          Review its Tickets and Estimate.
        </FlowStep>
      </li>
      <li>
        <FlowArrow />
        <FlowStep title="Start the Cycle" actors={['You']}>
          Only you start a Cycle; a Project has one Active Cycle at a time.
        </FlowStep>
      </li>
      <li>
        <FlowArrow />
        <FlowStep title="Autopilot dispatches" actors={['Autopilot']}>
          {active === null ? (
            'No Active Cycle now.'
          ) : (
            <>
              Active now: <CycleLinks cycles={[active]} />.
            </>
          )}{' '}
          With Autopilot on, it starts the Cycle's Eligible work within the run
          limits and the Spend ceiling.
        </FlowStep>
      </li>
      <li>
        <FlowArrow />
        <FlowStep title="Complete" actors={['Agent']}>
          Once every Ticket is Done, the Board says the Cycle is complete.
        </FlowStep>
      </li>
      <li>
        <FlowArrow />
        <FlowStep title="Retro" actors={['You', 'Agent']}>
          You start a Retro from the Cycle complete banner; an Agent looks back
          on the Cycle with you.
        </FlowStep>
      </li>
      <li>
        <FlowArrow />
        <FlowStep title="Archive" actors={['You']}>
          Only you archive a Cycle; it moves to the History.
        </FlowStep>
      </li>
    </ol>
  </Stack>
);
