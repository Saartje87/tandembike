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
  AutoTriagePauseReason,
  CapHolder,
  EngineState,
} from '../../autopilot/explanation';
import { isStartRunIntent } from '../../conversations/capacity';
import { AppLink } from '../app-link/app-link';
import { intentNames } from '../conversation-labels/conversation-labels';
import { RelativeTime } from '../relative-time/relative-time';

const slots = (count: number, noun: string) =>
  count === 1 ? `The one ${noun} slot is` : `All ${count} ${noun} slots are`;

/** A Pause reason in plain words, shared by Autopilot and Auto-triage. */
export function pauseReasonText(
  reason: AutopilotPauseReason | AutoTriagePauseReason,
  engine: 'Autopilot' | 'Auto-triage',
): string {
  switch (reason.type) {
    case 'projectArchived':
      return 'The Project is archived.';
    case 'switchedOff':
      return `${engine} is switched off.`;
    case 'noActiveCycle':
      return 'There is no Active Cycle: Autopilot only starts work planned into one.';
    case 'noSpendCeiling':
      return 'No Spend ceiling is set, and Autopilot needs one.';
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
  }
}

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
  engine: 'Autopilot' | 'Auto-triage';
  state: EngineState<AutopilotPauseReason | AutoTriagePauseReason>;
};

const runningText = {
  Autopilot: 'Running: Autopilot starts the next Eligible Ticket now.',
  'Auto-triage': 'Running: Auto-triage starts on the oldest Intake now.',
};

/** One engine: running, or each Pause reason in a list. */
const EngineStatus: FC<EngineStatusProps> = ({ projectId, engine, state }) => {
  const id = `${engine.toLowerCase()}-status`;
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
                {state.reasons.map((reason) => (
                  <li key={reason.type}>
                    <Stack gap={1}>
                      <Text>{pauseReasonText(reason, engine)}</Text>
                      {reason.type === 'machineCapFull' && (
                        <CapHolders
                          projectId={projectId}
                          holders={reason.holders}
                        />
                      )}
                    </Stack>
                  </li>
                ))}
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
};

/**
 * Why Autopilot and Auto-triage start nothing right now, in plain words, or
 * that each is running (GLOSSARY: Pause reason). The page refreshes on every
 * change, so the reasons clear as soon as their cause does.
 */
export const PauseReasons: FC<PauseReasonsProps> = ({
  projectId,
  autopilot,
  autoTriage,
}) => (
  <Stack gap={3}>
    <EngineStatus projectId={projectId} engine="Autopilot" state={autopilot} />
    <EngineStatus
      projectId={projectId}
      engine="Auto-triage"
      state={autoTriage}
    />
  </Stack>
);
