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
  plan: 'Plan',
  spar: 'Spar',
  batch_triage: 'Batch triage',
};

/** Who started a Conversation, as the header says it. */
export const starterNames: Record<ConversationStarter, string> = {
  user: 'you',
  autopilot: 'Autopilot',
  terminal: 'Terminal',
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
  widget: 'Agent',
  created: 'Created',
  session: 'Session',
};

export const stateNames: Record<ConversationState, string> = {
  running: 'working',
  waiting: 'needs you',
  idle: 'waiting for you',
  interrupted: 'interrupted',
  stopped: 'stopped',
};

/** Whether a run of the Conversation is alive, so it can be stopped. */
export const hasRun = (state: ConversationState) =>
  state === 'running' || state === 'waiting' || state === 'idle';
