import { Heading, Stack, Text } from '@blockle/blocks';
import type { FC } from 'react';

import { formatCost } from '../../app/lib/format-cost';
import {
  conversationOnPath,
  projectFlowPath,
  sparPath,
} from '../../app/lib/paths';
import type {
  AutopilotPauseReason,
  AutoReplyPauseReason,
  AutoTriagePauseReason,
  CapHolder,
  EngineState,
  OverlapPlanningPauseReason,
} from '../../autopilot/explanation';
import { isStartRunIntent } from '../../conversations/capacity';
import { AppLink } from '../app-link/app-link';
import { intentNames } from '../conversation-labels/conversation-labels';
import { RelativeTime } from '../relative-time/relative-time';

const slots = (count: number, noun: string) =>
  count === 1 ? `The one ${noun} slot is` : `All ${count} ${noun} slots are`;

/** What starts work on its own, and has Pause reasons (ADR 0044, ADR 0054). */
export type Engine =
  | 'Autopilot'
  | 'Auto-triage'
  | 'Overlap planning'
  | 'Auto-reply';

/** Any engine's Pause reason. */
export type PauseReason =
  | AutopilotPauseReason
  | AutoTriagePauseReason
  | OverlapPlanningPauseReason
  | AutoReplyPauseReason;

/** A Pause reason in plain words, shared by every engine. */
export function pauseReasonText(reason: PauseReason, engine: Engine): string {
  switch (reason.type) {
    case 'projectArchived':
      return 'The Project is archived.';
    case 'switchedOff':
      return `${engine} is switched off.`;
    case 'noActiveCycle':
      return engine === 'Autopilot'
        ? 'There is no Active Cycle: Autopilot only starts work planned into one.'
        : `There is no Active Cycle: ${engine} works only on one.`;
    case 'noSpendCeiling':
      return engine === 'Autopilot'
        ? 'No Spend ceiling is set, and Autopilot needs one.'
        : `No Spend ceiling is set, and ${engine} needs one: its runs count against it.`;
    case 'overSpendCeiling':
      return `This Cycle's Autopilot spend, ${formatCost(reason.spend, reason.unit)}, has reached the Spend ceiling of ${formatCost(reason.ceiling, reason.unit)}.`;
    case 'noFreeStartRunSlot':
      return `${slots(reason.limit, 'Start run')} in use.`;
    case 'machineCapFull':
      return `The machine cap of ${reason.cap} ${reason.cap === 1 ? 'run' : 'runs'} is full, across all Projects. Answer, close or stop one of these runs to let ${engine} go on:`;
    case 'overMachineCeiling':
      return `Today's Autopilot spend across all Projects, ${formatCost(reason.spend, reason.unit)}, has reached the machine ceiling of ${formatCost(reason.ceiling, reason.unit)}.`;
    case 'noEligibleWork':
      return 'Nothing is Eligible: no Ticket in the Active Cycle is ready-for-agent, unblocked and free.';
    case 'noTriageCeiling':
      return 'No Triage ceiling is set, and Auto-triage needs one.';
    case 'overTriageCeiling':
      return `Today's triage spend, ${formatCost(reason.spend, reason.unit)}, has reached the Triage ceiling of ${formatCost(reason.ceiling, reason.unit)}.`;
    case 'triageRunWorking':
      return 'A Triage run is already working; Auto-triage runs one at a time.';
    case 'noTriageEligibleWork':
      return 'Nothing is Triage-eligible: Intake is empty.';
    case 'overlapPlanningFirst':
      return 'Overlap planning goes first: no build starts until it has added its Blockers.';
    case 'judgmentRunWorking':
      return `An ${engine} run is already working; it runs one at a time.`;
    case 'planningSettles':
      return 'The Active Cycle changed moments ago: Overlap planning waits 30 seconds after the last change, so a batch of changes is planned once.';
    case 'noQuestionWaiting':
      return 'No question is waiting: no Start run on the Active Cycle waits on a Widget it has not answered.';
    case 'noPlanningDue':
      return 'Nothing to plan: the Active Cycle has not changed since its last planning, or has fewer than two ready, unclaimed Tickets.';
  }
}

/** The run a reason names, if any, to link to. */
const runOf = (reason: PauseReason): number | null =>
  (reason.type === 'judgmentRunWorking' ||
    reason.type === 'overlapPlanningFirst') &&
  reason.conversationId !== null
    ? reason.conversationId
    : null;

/**
 * A run the Machine cap counts, by its kind, Ticket and Spar or Ticket title,
 * such as `Spar “Pricing”` or `Start T12 “Build it”` (T1521).
 */
const holderName = (holder: CapHolder): string => {
  const parts = [
    ...(holder.terminal ? ['Terminal'] : []),
    intentNames[holder.intent],
    ...(holder.ticketNumber === null ? [] : [`T${holder.ticketNumber}`]),
    ...(holder.title === null ? [] : [`“${holder.title}”`]),
  ];
  return holder.ticketNumber === null && holder.title === null
    ? `${parts.join(' ')} Conversation ${holder.conversationId}`
    : parts.join(' ');
};

/** What the run is doing now. */
const holderState = (holder: CapHolder): string => {
  if (holder.terminal) {
    return 'working in your terminal';
  }
  return holder.waitingOnUser ? 'waiting on you' : 'working';
};

/**
 * What frees the run's place, by what it is: a Start waiting on the User is
 * answered, the User's own idle run (Spar, Plan, Ask…) is closed (T1521).
 */
const holderAdvice = (holder: CapHolder): string => {
  if (holder.terminal) {
    return 'End the session in your terminal to free it.';
  }
  if (!holder.waitingOnUser) {
    return 'Wait for it to finish, or stop it.';
  }
  return isStartRunIntent(holder.intent)
    ? 'Answer it to let it go on, or close it.'
    : 'Close it if you are done with it: idle, it still counts.';
};

type CapHoldersProps = {
  /** The Project whose Flow lists them, where the Conversation dialog opens. */
  projectId: number;
  holders: CapHolder[];
};

/**
 * Every run a full Machine cap counts, from any Project, each linked to where
 * it is answered or closed: a Spar to its page, a Terminal Conversation to
 * nothing, since it runs in the User's terminal, and any other run to the
 * Conversation dialog over this Flow (T1521).
 */
const CapHolders: FC<CapHoldersProps> = ({ projectId, holders }) => (
  <Stack gap={1} aria-label="Runs counted" asChild>
    <ul>
      {holders.map((holder) => {
        const name = holderName(holder);
        return (
          <li key={holder.conversationId}>
            <Text>
              {holder.terminal ? (
                name
              ) : holder.intent === 'spar' ? (
                <AppLink
                  href={sparPath(holder.projectId, holder.conversationId)}
                >
                  {name}
                </AppLink>
              ) : (
                <AppLink
                  href={conversationOnPath(
                    projectFlowPath(projectId),
                    holder.conversationId,
                  )}
                  scroll={false}
                >
                  {name}
                </AppLink>
              )}
              {` in ${holder.projectName}: ${holderState(holder)}, last active `}
              <RelativeTime date={holder.lastActivity} />
              {`. ${holderAdvice(holder)}`}
            </Text>
          </li>
        );
      })}
    </ul>
  </Stack>
);

type EngineStatusProps = {
  projectId: number;
  engine: Engine;
  state: EngineState<PauseReason>;
};

const runningText: Record<Engine, string> = {
  Autopilot: 'Running: Autopilot starts the next Eligible Ticket now.',
  'Auto-triage': 'Running: Auto-triage starts on the oldest Intake now.',
  'Overlap planning':
    'Running: Overlap planning starts on the Active Cycle now.',
  'Auto-reply': 'Running: Auto-reply answers the oldest waiting Widget now.',
};

/** One engine: running, or each Pause reason in a list. */
const EngineStatus: FC<EngineStatusProps> = ({ projectId, engine, state }) => {
  const id = `${engine.toLowerCase().replace(' ', '-')}-status`;
  return (
    <Stack gap={1} aria-labelledby={id} asChild>
      <section>
        <Heading level={3} id={id}>
          {engine}
        </Heading>
        {state.state === 'running' ? (
          <Text tag="p">{runningText[engine]}</Text>
        ) : (
          <>
            <Text tag="p">{`Paused: ${engine} starts nothing because`}</Text>
            <Stack gap={1} asChild>
              <ul>
                {state.reasons.map((reason) => {
                  const run = runOf(reason);
                  return (
                    <li key={reason.type}>
                      <Stack gap={1}>
                        <Text>
                          {pauseReasonText(reason, engine)}
                          {run !== null && (
                            <>
                              {' '}
                              <AppLink
                                href={conversationOnPath(
                                  projectFlowPath(projectId),
                                  run,
                                )}
                                scroll={false}
                              >
                                Open the run
                              </AppLink>
                            </>
                          )}
                        </Text>
                        {reason.type === 'machineCapFull' && (
                          <CapHolders
                            projectId={projectId}
                            holders={reason.holders}
                          />
                        )}
                      </Stack>
                    </li>
                  );
                })}
              </ul>
            </Stack>
          </>
        )}
      </section>
    </Stack>
  );
};

export type PauseReasonsProps = {
  /** The Project whose Flow shows them. */
  projectId: number;
  autopilot: EngineState<AutopilotPauseReason>;
  autoTriage: EngineState<AutoTriagePauseReason>;
  /** Overlap planning's, when shown (ADR 0054). */
  overlapPlanning?: EngineState<OverlapPlanningPauseReason>;
  /** Auto-reply's, when shown (ADR 0054). */
  autoReply?: EngineState<AutoReplyPauseReason>;
};

/**
 * Why Autopilot, Auto-triage and the judgment runs start nothing right now,
 * in plain words, or that each is running (GLOSSARY: Pause reason). The page refreshes on every
 * change, so the reasons clear as soon as their cause does.
 */
export const PauseReasons: FC<PauseReasonsProps> = ({
  projectId,
  autopilot,
  autoTriage,
  overlapPlanning,
  autoReply,
}) => (
  <Stack gap={3}>
    <EngineStatus projectId={projectId} engine="Autopilot" state={autopilot} />
    <EngineStatus
      projectId={projectId}
      engine="Auto-triage"
      state={autoTriage}
    />
    {overlapPlanning && (
      <EngineStatus
        projectId={projectId}
        engine="Overlap planning"
        state={overlapPlanning}
      />
    )}
    {autoReply && (
      <EngineStatus
        projectId={projectId}
        engine="Auto-reply"
        state={autoReply}
      />
    )}
  </Stack>
);
