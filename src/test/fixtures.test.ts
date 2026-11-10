// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { agentStages } from '../tickets/agent-commands';
import { aConversation, agentCommandEntries, agentCommands } from './fixtures';

describe('aConversation', () => {
  it('is an idle Start Conversation by the User, with no defaults', () => {
    expect(aConversation()).toEqual({
      id: 1,
      projectId: 1,
      ticketNumber: null,
      intent: 'start',
      state: 'idle',
      startedBy: 'user',
      sdkSessionId: null,
      costUsd: 0,
      hidden: false,
      retroCycleId: null,
      defaultCycleId: null,
      defaultEpicNumber: null,
      defaultType: null,
      worktreePath: null,
      worktreeKept: null,
      worktreeRemoved: false,
      createdAt: new Date('2026-03-01T09:00:00Z'),
      updatedAt: new Date('2026-03-01T09:00:00Z'),
    });
  });

  it('takes the overrides over the defaults', () => {
    expect(
      aConversation({ id: 4, intent: 'retro', retroCycleId: 7 }),
    ).toMatchObject({ id: 4, intent: 'retro', retroCycleId: 7, state: 'idle' });
  });
});

describe('agentCommands', () => {
  it('has every Stage field as none', () => {
    expect(agentCommands()).toEqual(
      Object.fromEntries(agentStages.map(({ field }) => [field, null])),
    );
  });

  it('takes the overrides over the defaults', () => {
    expect(agentCommands({ sparCommand: '/think' })).toMatchObject({
      sparCommand: '/think',
      startCommand: null,
    });
  });
});

describe('agentCommandEntries', () => {
  it('has every Stage field blank', () => {
    expect(agentCommandEntries()).toEqual(
      Object.fromEntries(agentStages.map(({ field }) => [field, ''])),
    );
  });

  it('takes the overrides over the defaults', () => {
    expect(agentCommandEntries({ mergeCommand: '/ship' })).toMatchObject({
      mergeCommand: '/ship',
      triageCommand: '',
    });
  });
});
