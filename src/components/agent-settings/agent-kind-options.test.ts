import { describe, expect, it } from 'vitest';

import { projectAgentSettings } from '../../test/fixtures';
import { claudeCodeOnly, showsCopilot } from './agent-kind-options';

const withCopilot = [
  ...claudeCodeOnly,
  { kind: 'copilot', label: 'Copilot', available: true } as const,
];

describe('showsCopilot', () => {
  it('is off while Copilot cannot run, is not the default and keeps nothing', () => {
    expect(showsCopilot(projectAgentSettings(), claudeCodeOnly)).toBe(false);
  });

  it.each([
    ['Copilot can run', projectAgentSettings(), withCopilot],
    [
      'Copilot is the default',
      projectAgentSettings({ defaultAgentKind: 'copilot' }),
      claudeCodeOnly,
    ],
    [
      'a credit ceiling is kept',
      projectAgentSettings({ triageCeilingAiCredits: 30 }),
      claudeCodeOnly,
    ],
    [
      'a Copilot model is kept',
      projectAgentSettings({
        models: {
          'claude-code': { runModel: null, triageModel: null },
          copilot: { runModel: 'gpt', triageModel: null },
        },
      }),
      claudeCodeOnly,
    ],
  ])('is on when %s', (_, settings, kinds) => {
    expect(showsCopilot(settings, kinds)).toBe(true);
  });
});
