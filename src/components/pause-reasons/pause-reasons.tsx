import { Heading, Stack, Text } from '@blockle/blocks';
import type { FC } from 'react';

import { formatCost } from '../../app/lib/format-cost';
import type {
  AutopilotPauseReason,
  AutoTriagePauseReason,
  EngineState,
} from '../../autopilot/explanation';

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
      return `This Cycle's Autopilot spend, ${formatCost(reason.spendUsd)}, has reached the Spend ceiling of ${formatCost(reason.ceilingUsd)}.`;
    case 'noFreeStartRunSlot':
      return `${slots(reason.limit, 'Start run')} in use.`;
    case 'machineCapFull': {
      const full = `The machine cap of ${reason.cap} ${reason.cap === 1 ? 'run' : 'runs'} is full, across all Projects`;
      if (reason.waitingOnUser === 0) {
        return `${full}.`;
      }
      const waiting =
        reason.waitingOnUser === 1
          ? '1 of its runs waits on you. Answer or close it'
          : `${reason.waitingOnUser} of its runs wait on you. Answer or close them`;
      return `${full}: ${waiting} to let Autopilot go on.`;
    }
    case 'overMachineCeiling':
      return `Today's Autopilot spend across all Projects, ${formatCost(reason.spendUsd)}, has reached the machine ceiling of ${formatCost(reason.ceilingUsd)}.`;
    case 'noEligibleWork':
      return 'Nothing is Eligible: no Ticket in the Active Cycle is ready-for-agent, unblocked and free.';
    case 'noTriageCeiling':
      return 'No Triage ceiling is set, and Auto-triage needs one.';
    case 'overTriageCeiling':
      return `Today's triage spend, ${formatCost(reason.spendUsd)}, has reached the Triage ceiling of ${formatCost(reason.ceilingUsd)}.`;
    case 'triageRunWorking':
      return 'A Triage run is already working; Auto-triage runs one at a time.';
    case 'noTriageEligibleWork':
      return 'Nothing is Triage-eligible: Intake is empty.';
  }
}

type EngineStatusProps = {
  engine: 'Autopilot' | 'Auto-triage';
  state: EngineState<AutopilotPauseReason | AutoTriagePauseReason>;
};

const runningText = {
  Autopilot: 'Running: Autopilot starts the next Eligible Ticket now.',
  'Auto-triage': 'Running: Auto-triage starts on the oldest Intake now.',
};

/** One engine: running, or each Pause reason in a list. */
const EngineStatus: FC<EngineStatusProps> = ({ engine, state }) => {
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
                    <Text>{pauseReasonText(reason, engine)}</Text>
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
  autopilot: EngineState<AutopilotPauseReason>;
  autoTriage: EngineState<AutoTriagePauseReason>;
};

/**
 * Why Autopilot and Auto-triage start nothing right now, in plain words, or
 * that each is running (GLOSSARY: Pause reason). The page refreshes on every
 * change, so the reasons clear as soon as their cause does.
 */
export const PauseReasons: FC<PauseReasonsProps> = ({
  autopilot,
  autoTriage,
}) => (
  <Stack gap={3}>
    <EngineStatus engine="Autopilot" state={autopilot} />
    <EngineStatus engine="Auto-triage" state={autoTriage} />
  </Stack>
);
