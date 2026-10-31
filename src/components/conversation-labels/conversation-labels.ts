import type {
  ConversationIntent,
  ConversationState,
} from '../../conversations/conversation-state';
import type {
  Conversation,
  TranscriptEntry,
} from '../../conversations/conversations';

export type ConversationWithTranscript = {
  conversation: Conversation;
  transcript: TranscriptEntry[];
};

export const intentNames: Record<ConversationIntent, string> = {
  start: 'Start',
  triage: 'Triage',
  ask: 'Ask',
  new_ticket: 'New Ticket',
  setup: 'Setup',
};

export const stateNames: Record<ConversationState, string> = {
  running: 'working',
  waiting: 'needs you',
  idle: 'waiting for you',
  interrupted: 'interrupted',
  stopped: 'stopped',
};

/** A Conversation's cost so far, in US dollars to the cent. */
export const formatCost = (costUsd: number) => `$${costUsd.toFixed(2)}`;

/** Whether a run of the Conversation is alive, so it can be stopped. */
export const hasRun = (state: ConversationState) =>
  state === 'running' || state === 'waiting' || state === 'idle';
