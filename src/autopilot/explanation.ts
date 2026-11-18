import type { ConversationIntent } from '../conversations/conversation-state';
import type { CostUnit } from '../tickets/cost-unit';
/**
 * What Autopilot's rule answers (ADR 0044): why Autopilot, Auto-triage and
 * the judgment runs (ADR 0054) start nothing now, and for each Todo Ticket or Epic, why it is or is not
 * next. Dispatch and triage act on this same answer, so it is never a second
 * copy of the rules. Types only, so the UI can import them.
 */

/**
 * A live Agent process a full Machine cap counts (T1521), named so the User
 * can find it in any Project and answer, close or stop it.
 */
export type CapHolder = {
  conversationId: number;
  projectId: number;
  projectName: string;
  intent: ConversationIntent;
  /** A Terminal Conversation, working in the User's terminal (ADR 0039). */
  terminal: boolean;
  ticketNumber: number | null;
  /** A Spar's topic, else its Ticket's title; null without either. */
  title: string | null;
  waitingOnUser: boolean;
  lastActivity: Date;
};

/** A Pause reason (GLOSSARY): why Autopilot starts no build now. */
export type AutopilotPauseReason =
  | { type: 'projectArchived' }
  | { type: 'switchedOff' }
  | { type: 'noActiveCycle' }
  | { type: 'noSpendCeiling' }
  | { type: 'overSpendCeiling'; spend: number; ceiling: number; unit: CostUnit }
  | { type: 'noFreeStartRunSlot'; limit: number }
  /** `holders`: every live process the cap counts, oldest first (T1521). */
  | { type: 'machineCapFull'; cap: number; holders: CapHolder[] }
  | {
      type: 'overMachineCeiling';
      spend: number;
      ceiling: number;
      unit: CostUnit;
    }
  | { type: 'noEligibleWork' }
  /**
   * With Overlap planning on, planning is due, settling or working: no build
   * starts until it has added its Blockers (ADR 0054). `conversationId` names
   * the working run, null while it is not started yet.
   */
  | { type: 'overlapPlanningFirst'; conversationId: number | null };

/**
 * A Pause reason (GLOSSARY) every judgment run shares (ADR 0054): Autopilot's
 * Project and machine reasons but the Start run slot, and a run of its kind
 * already working in the Project.
 */
export type JudgmentPauseReason =
  | { type: 'projectArchived' }
  | { type: 'switchedOff' }
  | { type: 'noActiveCycle' }
  | { type: 'noSpendCeiling' }
  | { type: 'overSpendCeiling'; spend: number; ceiling: number; unit: CostUnit }
  | { type: 'judgmentRunWorking'; conversationId: number }
  | { type: 'machineCapFull'; cap: number; holders: CapHolder[] }
  | {
      type: 'overMachineCeiling';
      spend: number;
      ceiling: number;
      unit: CostUnit;
    };

/**
 * Why Overlap planning starts no run now (ADR 0054): a shared reason, the
 * latest trigger not settled until `until`, or no planning due.
 */
export type OverlapPlanningPauseReason =
  | JudgmentPauseReason
  | { type: 'planningSettles'; until: Date }
  | { type: 'noPlanningDue' };

/** Why Auto-reply starts no run now (ADR 0054): a shared reason, or no Widget waiting. */
export type AutoReplyPauseReason =
  | JudgmentPauseReason
  | { type: 'noQuestionWaiting' };

/** A Pause reason (GLOSSARY): why Auto-triage starts no Triage run now. */
export type AutoTriagePauseReason =
  | { type: 'projectArchived' }
  | { type: 'switchedOff' }
  | { type: 'noTriageCeiling' }
  | {
      type: 'overTriageCeiling';
      spend: number;
      ceiling: number;
      unit: CostUnit;
    }
  | { type: 'triageRunWorking'; conversationId: number }
  | { type: 'machineCapFull'; cap: number; holders: CapHolder[] }
  | {
      type: 'overMachineCeiling';
      spend: number;
      ceiling: number;
      unit: CostUnit;
    }
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
  overlapPlanning: EngineState<OverlapPlanningPauseReason>;
  autoReply: EngineState<AutoReplyPauseReason>;
  /** Every Todo Ticket and Epic of the Project, archived ones included. */
  tickets: TicketExplanation[];
};
