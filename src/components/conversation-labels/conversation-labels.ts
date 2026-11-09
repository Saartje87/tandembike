import type {
  ConversationIntent,
  ConversationStarter,
  ConversationState,
  TranscriptRole,
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
  retro: 'Retro',
  merge: 'Merge',
  spec: 'Spec',
};

/** Who started a Conversation, as the header says it. */
export const starterNames: Record<ConversationStarter, string> = {
  user: 'you',
  autopilot: 'Autopilot',
};

/** Who a transcript entry is from, as its bubble says it. */
export const roleNames: Record<TranscriptRole, string> = {
  user: 'You',
  autopilot: 'Autopilot',
  agent: 'Agent',
  tool: 'Tool',
  error: 'Error',
  permission: 'Permission',
  question: 'Question',
  created: 'Created',
};

export const stateNames: Record<ConversationState, string> = {
  running: 'working',
  waiting: 'needs you',
  idle: 'waiting for you',
  interrupted: 'interrupted',
  stopped: 'stopped',
};

/** A Conversation's cost so far, in US dollars; under a cent, to 4 places. */
export const formatCost = (costUsd: number) =>
  `$${costUsd > 0 && costUsd < 0.01 ? costUsd.toFixed(4) : costUsd.toFixed(2)}`;

/** Whether a run of the Conversation is alive, so it can be stopped. */
export const hasRun = (state: ConversationState) =>
  state === 'running' || state === 'waiting' || state === 'idle';
