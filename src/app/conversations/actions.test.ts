// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appConversations } from '../../conversations/app-conversations';
import { createTestConversations } from '../../test/conversations';
import {
  answerConversationPermission,
  replyToConversation,
  startConversation,
  stopConversation,
} from './actions';

vi.mock('../../conversations/app-conversations', () => ({
  appConversations: vi.fn(),
}));

function setup(withRepository = true) {
  const world = createTestConversations();
  const project = world.tickets.createProject({ name: 'Website' });
  if (withRepository) {
    world.tickets.setProjectAgentSettings(project.id, {
      repositoryPath: world.repositoryDir,
    });
  }
  vi.mocked(appConversations).mockReturnValue(world.conversations);
  return { ...world, project };
}

describe('Conversation actions', () => {
  beforeEach(() => {
    vi.mocked(appConversations).mockReset();
  });

  it('start a Conversation on a Project', async () => {
    const { project, runner } = setup();

    const result = await startConversation({
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });

    expect(result).toMatchObject({
      ok: true,
      conversation: { projectId: project.id, state: 'running' },
    });
    expect(runner.runs).toHaveLength(1);
  });

  it('refuse a start when the Project has no repository path', async () => {
    const { project, runner } = setup(false);

    const result = await startConversation({
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });

    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { repositoryPath: expect.any(String) },
    });
    expect(runner.runs).toHaveLength(0);
  });

  it('send a reply and stop the run', async () => {
    const { project, runner } = setup();
    const started = await startConversation({
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });
    if (!started.ok) {
      throw new Error('start failed');
    }
    const conversationId = started.conversation.id;

    const replied = await replyToConversation({ conversationId, text: 'More' });
    const stopped = await stopConversation({ conversationId });

    expect(replied).toMatchObject({ ok: true });
    expect(runner.runs[0].sent).toEqual(['More']);
    expect(stopped).toMatchObject({
      ok: true,
      conversation: { state: 'stopped' },
    });
  });

  it('answer a permission request and let the run go on', async () => {
    const { project, runner, conversations } = setup();
    const started = await startConversation({
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });
    if (!started.ok) {
      throw new Error('start failed');
    }
    const pending = runner.runs[0].options.askPermission({
      toolName: 'Bash',
      input: {},
    });
    const entry = conversations.transcript(started.conversation.id).at(-1);

    const result = await answerConversationPermission({
      entryId: entry?.id ?? 0,
      allow: true,
    });

    expect(result).toMatchObject({ ok: true });
    expect(await pending).toBe('allow');
    expect(
      await answerConversationPermission({
        entryId: entry?.id ?? 0,
        allow: true,
      }),
    ).toMatchObject({ ok: false });
  });

  it('return a refusal as an error', async () => {
    setup();

    expect(
      await replyToConversation({ conversationId: 999, text: 'Hi' }),
    ).toEqual({
      ok: false,
      error: 'There is no Conversation with id 999.',
    });
  });
});
