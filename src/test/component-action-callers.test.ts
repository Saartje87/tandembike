// @vitest-environment node

import { expect, it } from 'vitest';

import { actionCallerProblems } from './action-callers';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const components = join(__dirname, '../components');

/**
 * Components that import a Server Action module but are safe without
 * `callAction`, each with why. Keep it short: a new caller routes its calls
 * through `callAction` instead (T1325).
 */
const allowlist: Record<string, string> = {
  'conversation-activity/conversation-activity.tsx':
    'Its background load of the activity has a .catch that keeps what is shown; the next change loads it again.',
  'conversation-draft/conversation-draft.tsx':
    'It calls startConversation only from the onSend it passes to ConversationMessageInput, which runs onSend through callAction (T1186).',
  'conversation-reply-form/conversation-reply-form.tsx':
    'It calls replyToConversation only from the send it passes to ConversationMessageInput, which runs it through callAction (T1186).',
  'spar-view/spar-view.tsx':
    'It calls sendSparTurn only from the onReply that reaches ConversationMessageInput, which runs it through callAction (T1186).',
  'machine-runs/machine-runs.tsx':
    'Its background load of the run counts has a .catch that keeps what is shown; the next change loads it again.',
};

const componentSources = (): Record<string, string> =>
  Object.fromEntries(
    readdirSync(components, { recursive: true, encoding: 'utf8' })
      .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
      .map((path) => [
        relative(components, join(components, path)),
        readFileSync(join(components, path), 'utf8'),
      ]),
  );

it('routes every Server Action call in a component through callAction', () => {
  expect(actionCallerProblems(componentSources(), allowlist)).toEqual([]);
});
