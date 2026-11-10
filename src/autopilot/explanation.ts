/**
 * What Autopilot's rule answers (ADR 0044): why Autopilot and Auto-triage
 * start nothing now, and for each Todo Ticket or Epic, why it is or is not
 * next. Dispatch and triage act on this same answer, so it is never a second
 * copy of the rules. Types only, so the UI can import them.
 */

/** A Pause reason (GLOSSARY): why Autopilot starts no build now. */
export type AutopilotPauseReason =
  | { type: 'projectArchived' }
  | { type: 'switchedOff' }
  | { type: 'noActiveCycle' }
  | { type: 'noSpendCeiling' }
  | { type: 'overSpendCeiling'; spendUsd: number; ceilingUsd: number }
  | { type: 'noFreeStartRunSlot'; limit: number }
  /** `waitingOnUser`: how many of the live runs wait on the User (T1332). */
  | { type: 'machineCapFull'; cap: number; waitingOnUser: number }
  | { type: 'overMachineCeiling'; spendUsd: number; ceilingUsd: number }
  | { type: 'noEligibleWork' };

/** A Pause reason (GLOSSARY): why Auto-triage starts no Triage run now. */
export type AutoTriagePauseReason =
  | { type: 'projectArchived' }
  | { type: 'switchedOff' }
  | { type: 'noTriageCeiling' }
  | { type: 'overTriageCeiling'; spendUsd: number; ceilingUsd: number }
  | { type: 'triageRunWorking'; conversationId: number }
  | { type: 'machineCapFull'; cap: number; waitingOnUser: number }
  | { type: 'overMachineCeiling'; spendUsd: number; ceilingUsd: number }
  | { type: 'noTriageEligibleWork' };

/** Running: the next pass starts work. Paused: every reason it does not. */
export type EngineState<Reason> =
  | { state: 'running' }
  | { state: 'paused'; reasons: Reason[] };

/** Why a Todo Ticket or Epic is not Eligible (GLOSSARY: Eligible). */
export type NotEligibleReason =
  | { type: 'notReady' }
  | { type: 'blocked'; blockers: number[] }
  | { type: 'claimed' }
  | { type: 'notInActiveCycle' }
  | { type: 'archived' }
  | { type: 'epicWithoutChildren' }
  | { type: 'epicChild'; epicNumber: number }
  | { type: 'heldByConversation'; conversationId: number };

/** Why a Todo Ticket is not Triage-eligible (GLOSSARY: Triage-eligible). */
export type NotTriageEligibleReason =
  | { type: 'archived' }
  | { type: 'triaged'; label: string }
  | { type: 'feedback' }
  | { type: 'underTriageConversation'; conversationId: number }
  | { type: 'proposed' };

export type Eligibility<Reason> =
  /**
   * `place` is 1 for the next in line; `fitsFreeSlots` says whether the free
   * slots reach it now.
   */
  | { eligible: true; place: number; fitsFreeSlots: boolean }
  | { eligible: false; reasons: Reason[] };

/** One Todo Ticket or Epic, as the rule sees it. */
export type TicketExplanation = {
  number: number;
  /** Whether Autopilot would build it, and where it is in line. */
  build: Eligibility<NotEligibleReason>;
  /** Whether Auto-triage would triage it, and where it is in line. */
  triage: Eligibility<NotTriageEligibleReason>;
};

export type AutopilotExplanation = {
  autopilot: EngineState<AutopilotPauseReason>;
  autoTriage: EngineState<AutoTriagePauseReason>;
  /** Every Todo Ticket and Epic of the Project, archived ones included. */
  tickets: TicketExplanation[];
};
