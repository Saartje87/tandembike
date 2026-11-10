import type { PaletteColor } from './palette';
import type { Status } from './status';

/** A Project as an Activity entry names it: by id, and by name at the time. */
export type ActivityProject = { id: number; name: string };

/** A Cycle as an Activity entry names it: by id, and by title at the time. */
export type ActivityCycle = { id: number; title: string };

/** The Agent run a Claim entry names. */
export type ActivityClaim = { agentRunId: string; agentName: string | null };

/**
 * One change an Activity entry records. Values are as they were at the time:
 * a later rename does not rewrite them.
 */
export type ActivityChange =
  | { type: 'created' }
  | { type: 'status'; from: Status; to: Status }
  | { type: 'project'; from: ActivityProject; to: ActivityProject }
  /**
   * Planned into, unplanned from or moved between Cycles; `null` is the
   * Backlog. Rollover and archiving a Cycle record none.
   */
  | { type: 'cycle'; from: ActivityCycle | null; to: ActivityCycle | null }
  | { type: 'title'; from: string; to: string }
  /** Only that it was edited: the text is not kept. */
  | { type: 'description' }
  | { type: 'color'; from: PaletteColor | null; to: PaletteColor | null }
  | { type: 'origin'; from: number | null; to: number | null }
  | { type: 'labelAdded'; label: string }
  | { type: 'labelRemoved'; label: string }
  | { type: 'externalReferenceAdded'; reference: string }
  | { type: 'externalReferenceRemoved'; reference: string }
  /** The file name as it was at the time. */
  | { type: 'attachmentAdded'; name: string }
  | { type: 'attachmentRemoved'; name: string }
  /** On the blocked Ticket: Ticket `number` became one of its Blockers. */
  | { type: 'blockedByAdded'; number: number }
  | { type: 'blockedByRemoved'; number: number }
  /** On the Blocker: it started blocking Ticket `number`. */
  | { type: 'blocksAdded'; number: number }
  | { type: 'blocksRemoved'; number: number }
  | { type: 'archived' }
  | { type: 'restored' }
  | ({ type: 'claimTaken' } & ActivityClaim)
  | ({ type: 'claimReleased' } & ActivityClaim)
  /** The User cleared the Claim of the Agent run named. */
  | ({ type: 'claimCleared' } & ActivityClaim)
  | { type: 'criterionChecked'; text: string }
  | { type: 'criterionUnchecked'; text: string }
  /** The whole list was replaced: no diff is kept. */
  | { type: 'criteriaEdited' }
  /** A Triage run proposed a category and a state. */
  | { type: 'triageProposed'; category: string; state: string }
  | { type: 'triageApproved'; category: string; state: string }
  | { type: 'triageRejected' }
  /**
   * An Agent completed it through an auto-merge (ADR 0043): its Claim was
   * taken with Auto-merge on, and `pullRequest` is the PR it merged.
   */
  | { type: 'autoMerged'; pullRequest: string };
