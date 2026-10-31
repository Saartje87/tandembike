import type { PaletteColor } from './palette';
import type { Status } from './status';

/** A Project as an Activity entry names it: by id, and by name at the time. */
export type ActivityProject = { id: number; name: string };

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
  | { type: 'criteriaEdited' };
