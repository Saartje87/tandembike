import { describe, expect, it } from 'vitest';

import {
  cancelled,
  type Option,
  type Prompter,
  runWizard,
  typeANumber,
  type WizardDeps,
} from './wizard';

type Prompt =
  | { kind: 'select'; message: string; options: Option<unknown>[] }
  | { kind: 'text'; message: string };

/**
 * A prompter that answers in turn: a select by the label of the option to
 * pick, a text by the text typed; `cancelled` cancels.
 */
function fakePrompter(answers: (string | typeof cancelled)[]) {
  const prompts: Prompt[] = [];
  const next = () => {
    if (answers.length === 0) throw new Error('No answer left.');
    return answers.shift() as string | typeof cancelled;
  };
  const prompter: Prompter = {
    select: async (message, options) => {
      prompts.push({ kind: 'select', message, options });
      const answer = next();
      if (answer === cancelled) return cancelled;
      const option = options.find(({ label }) => label === answer);
      if (!option) {
        throw new Error(
          `No option "${answer}" in ${options.map((o) => o.label).join(' | ')}`,
        );
      }
      return option.value;
    },
    text: async (message, validate) => {
      prompts.push({ kind: 'text', message });
      const answer = next();
      if (answer === cancelled) return cancelled;
      const problem = validate(answer);
      if (problem) throw new Error(`Refused "${answer}": ${problem}`);
      return answer;
    },
  };
  return { prompter, prompts };
}

const website = { id: 3, name: 'Website' };
const blog = { id: 5, name: 'Blog' };

function wizard(
  answers: (string | typeof cancelled)[],
  overrides: Partial<Omit<WizardDeps, 'choices'>> & {
    choices?: () => Promise<unknown[]>;
  } = {},
) {
  const { prompter, prompts } = fakePrompter(answers);
  const listed: [string, number][] = [];
  const { choices, ...rest } = overrides;
  const deps: WizardDeps = {
    prompter,
    serverLabel: 'Server: running on :4747',
    projects: async () => ({
      projects: [website, blog],
      folderProjectId: website.id,
    }),
    ...rest,
    choices: async (intent, projectId) => {
      listed.push([intent, projectId]);
      return (choices ? await choices() : []) as never;
    },
  };
  return { run: () => runWizard(deps), prompts, listed };
}

const labels = (prompt: Prompt | undefined) =>
  prompt?.kind === 'select' ? prompt.options.map(({ label }) => label) : [];

describe('runWizard (T1355)', () => {
  it('offers Implement, Triage, Spec, Plan, Resume and Server, in that order, labelled with the server state', async () => {
    const { run, prompts } = wizard([cancelled]);
    await run();

    expect(labels(prompts[0])).toEqual([
      'Implement',
      'Triage',
      'Spec',
      'Plan',
      'Resume',
      'Server: running on :4747',
    ]);
  });

  it('implements a typed Ticket', async () => {
    const { run } = wizard(['Implement', typeANumber, 'T42']);
    expect(await run()).toEqual({
      run: { command: 'implement', ticketNumber: 42 },
    });
  });

  it('implements the next Eligible item of the Project for a typed next', async () => {
    const { run } = wizard(['Implement', typeANumber, 'next']);
    expect(await run()).toEqual({
      run: { command: 'implement', ticketNumber: null, projectId: website.id },
    });
  });

  it.each([
    ['Triage', 'triage'],
    ['Spec', 'spec'],
  ])('%s asks for a Ticket number', async (action, command) => {
    const { run } = wizard([action, typeANumber, '7']);
    expect(await run()).toEqual({ run: { command, ticketNumber: 7 } });
  });

  it('resumes a typed Conversation id', async () => {
    const { run } = wizard(['Resume', typeANumber, '12']);
    expect(await run()).toEqual({
      run: { command: 'resume', conversationId: 12 },
    });
  });

  it('asks Plan for the goal as text', async () => {
    const { run, prompts } = wizard(['Plan', 'Ship the blog']);
    expect(await run()).toEqual({
      run: { command: 'plan', goal: 'Ship the blog', projectId: website.id },
    });
    expect(prompts[1]).toMatchObject({ kind: 'text' });
  });

  it.each([
    ['Start', { command: 'start', port: null, foreground: false }],
    ['Stop', { command: 'stop', force: false }],
    ['Restart', { command: 'restart' }],
    ['Status', { command: 'status' }],
  ])(
    'runs the Server submenu’s %s as the lifecycle command',
    async (pick, command) => {
      const { run, prompts } = wizard(['Server: running on :4747', pick]);
      expect(await run()).toEqual({ run: command });
      expect(labels(prompts[1])).toEqual([
        'Start',
        'Stop',
        'Restart',
        'Status',
      ]);
    },
  );

  it.each<[(string | typeof cancelled)[]]>([
    [[cancelled]],
    [['Implement', cancelled]],
    [['Implement', typeANumber, cancelled]],
    [['Plan', cancelled]],
    [['Server: running on :4747', cancelled]],
  ])('cancels with exit 130 at any prompt (%j)', async (answers) => {
    const { run } = wizard(answers);
    expect(await run()).toEqual({ exit: 130 });
  });
});

describe('runWizard’s Project step (T1356)', () => {
  it('uses the folder’s Project without asking', async () => {
    const { run, prompts } = wizard(['Plan', 'Ship']);
    expect(await run()).toMatchObject({ run: { projectId: website.id } });
    expect(prompts.map(({ message }) => message)).not.toContain(
      'Which Project?',
    );
  });

  it('asks which Project first outside a Project’s repository and uses the pick', async () => {
    const { run, prompts } = wizard(
      ['Blog', 'Implement', typeANumber, 'next'],
      {
        projects: async () => ({
          projects: [website, blog],
          folderProjectId: null,
        }),
      },
    );

    expect(await run()).toEqual({
      run: { command: 'implement', ticketNumber: null, projectId: blog.id },
    });
    expect(prompts[0].message).toBe('Which Project?');
    expect(labels(prompts[0])).toEqual(['Website', 'Blog']);
  });

  it('says there is no Project yet and exits 1 when there is none', async () => {
    const { run } = wizard([], {
      projects: async () => ({ projects: [], folderProjectId: null }),
    });
    expect(await run()).toEqual({
      exit: 1,
      message: 'There is no Project yet: create one in Tandembike first.',
    });
  });

  it('cancels at the Project step', async () => {
    const { run } = wizard([cancelled], {
      projects: async () => ({ projects: [website], folderProjectId: null }),
    });
    expect(await run()).toEqual({ exit: 130 });
  });
});

describe('runWizard’s lists (T1357)', () => {
  const tickets = [
    { number: 42, title: 'Fix the header' },
    { number: 7, title: 'Add search' },
  ];

  it('lists the Implement choices of the chosen Project with the next_work pick first, then type a number', async () => {
    const { run, prompts, listed } = wizard(['Implement', 'T7 Add search'], {
      choices: async () => tickets,
    });

    expect(await run()).toEqual({
      run: { command: 'implement', ticketNumber: 7 },
    });
    expect(listed).toEqual([['start', website.id]]);
    expect(labels(prompts[1])).toEqual([
      'T42 Fix the header',
      'T7 Add search',
      typeANumber,
    ]);
    expect(
      prompts[1].kind === 'select' ? prompts[1].options[0].hint : undefined,
    ).toBe('next');
  });

  it.each([
    ['Triage', 'triage', 'triage'],
    ['Spec', 'spec', 'spec'],
  ])(
    'lists %s’s choices and opens the pick',
    async (action, intent, command) => {
      const { run, listed } = wizard([action, 'T42 Fix the header'], {
        choices: async () => tickets,
      });

      expect(await run()).toEqual({ run: { command, ticketNumber: 42 } });
      expect(listed).toEqual([[intent, website.id]]);
    },
  );

  it('lists the Conversations to resume', async () => {
    const { run, prompts } = wizard(['Resume', '#12 T42 Fix the header'], {
      choices: async () => [
        { conversationId: 12, ticketNumber: 42, title: 'Fix the header' },
        { conversationId: 9, ticketNumber: null, title: 'plan' },
      ],
    });

    expect(await run()).toEqual({
      run: { command: 'resume', conversationId: 12 },
    });
    expect(labels(prompts[1])).toEqual([
      '#12 T42 Fix the header',
      '#9 plan',
      typeANumber,
    ]);
  });

  it('says an empty list is empty and still offers type a number', async () => {
    const { run, prompts } = wizard(['Triage', typeANumber, '5']);

    expect(await run()).toEqual({
      run: { command: 'triage', ticketNumber: 5 },
    });
    expect(prompts[1].message).toBe(
      'No Tickets to triage in Website. Type a number?',
    );
    expect(labels(prompts[1])).toEqual([typeANumber]);
  });

  it('lists the chosen Project’s choices outside a Project’s repository', async () => {
    const { run, listed } = wizard(['Blog', 'Spec', typeANumber, '3'], {
      projects: async () => ({
        projects: [website, blog],
        folderProjectId: null,
      }),
    });
    await run();
    expect(listed).toEqual([['spec', blog.id]]);
  });
});
