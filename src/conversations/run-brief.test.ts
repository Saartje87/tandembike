import { describe, expect, it } from 'vitest';

import { conversationIntents } from './conversation-state';
import { runBrief } from './run-brief';

describe('runBrief for a Retro', () => {
  const brief = runBrief({
    conversationId: 5,
    ticketNumber: null,
    ticketTitle: null,
    ticketType: null,
    projectName: 'Website',
    agentKind: 'claude-code' as const,
    intent: 'retro',
    retroCycle: { id: 44, title: 'Factory p2' },
    parallelRuns: false,
    runMode: 'default',
  });

  it('names the Cycle by title and id', () => {
    expect(brief).toContain('retrospective');
    expect(brief).toContain('"Factory p2" (Cycle 44)');
  });

  it('points at find_tickets with cycleId and at Feedback as Tickets', () => {
    expect(brief).toContain('find_tickets');
    expect(brief).toContain('cycleId');
    expect(brief).toContain('"Feedback as Tickets"');
  });

  it('copies no Ticket list, Status or cost', () => {
    expect(brief).not.toMatch(/\bT\d+\b|\$\d|Todo|In progress/);
  });
});

describe('runBrief and the Check command', () => {
  const base = {
    conversationId: 5,
    ticketNumber: 7,
    ticketTitle: 'Fix it',
    ticketType: 'Ticket' as const,
    projectName: 'Website',
    agentKind: 'claude-code' as const,
    parallelRuns: false,
    runMode: 'default' as const,
  };

  it('tells a Start run to run the command and see it pass before a PR', () => {
    const brief = runBrief({
      ...base,
      intent: 'start',
      checkCommand: 'npm run check',
    });

    expect(brief).toContain('`npm run check`');
    expect(brief).toMatch(/see it pass before you open a pull request/);
  });

  it('tells a Start run with none to follow the repository instructions', () => {
    const brief = runBrief({ ...base, intent: 'start', checkCommand: null });

    expect(brief).toContain('no Check command');
    expect(brief).toContain("repository's own instructions");
  });

  it('leaves other intents without a Check command line', () => {
    for (const intent of ['triage', 'ask'] as const) {
      expect(
        runBrief({ ...base, intent, checkCommand: 'npm run check' }),
      ).not.toContain('Check command');
    }
  });
});

describe('runBrief and the worktree', () => {
  const base = {
    conversationId: 5,
    ticketNumber: 7,
    ticketTitle: 'Fix it',
    ticketType: 'Ticket' as const,
    projectName: 'Website',
    agentKind: 'claude-code' as const,
    intent: 'start' as const,
    parallelRuns: true,
    runMode: 'default' as const,
  };

  it("tells a Start its worktree is already on the Ticket's branch, and to make no other", () => {
    const brief = runBrief({
      ...base,
      worktree: { path: '/w/1/c5', base: 'origin/main', onTicketBranch: true },
    });

    expect(brief).toContain(
      "You are in a git worktree Tandembike made for this Conversation at /w/1/c5. It is already on T7's own branch (`git branch --show-current` names it): new from origin/main, or the branch T7 already had. Commit on that branch and check it before each commit; do not create another branch or worktree. Tandembike removes the worktree when the Conversation closes or the Ticket is Done; the branch stays.",
    );
    expect(brief).not.toContain('Create your branch here');
    expect(brief).not.toContain('Other runs may work in this repository');
  });

  it('tells a Start without a Ticket its worktree is detached', () => {
    const brief = runBrief({
      ...base,
      ticketNumber: null,
      ticketTitle: null,
      ticketType: null,
      worktree: { path: '/w/1/c5', base: 'origin/main' },
    });

    expect(brief).toContain('at /w/1/c5, detached at origin/main');
  });

  it('tells a Merge its worktree is detached, not that it creates a branch', () => {
    const brief = runBrief({
      ...base,
      intent: 'merge',
      worktree: { path: '/w/1/c5', base: 'origin/main' },
    });

    expect(brief).toContain('at /w/1/c5, detached at origin/main');
    expect(brief).toContain('checks that branch out here');
    expect(brief).not.toContain('Create your branch here');
  });

  it('tells a Parallel runs Start without a worktree to make neither a worktree nor a branch, but to tell the User', () => {
    for (const agentKind of ['claude-code', 'copilot'] as const) {
      const brief = runBrief({ ...base, agentKind, worktree: null });

      expect(brief).toContain('has no worktree of its own');
      expect(brief).toContain('tell the User');
      expect(brief).not.toMatch(
        /EnterWorktree|git worktree add|Work in a git worktree of your own|Name your branch/,
      );
    }
  });
});

describe('runBrief per Agent kind (ADR 0051)', () => {
  const situations = conversationIntents.flatMap((intent) =>
    [false, true].flatMap((parallelRuns) =>
      [false, true].map((terminal) => ({
        conversationId: 5,
        ticketNumber: 7,
        ticketTitle: 'Fix it',
        ticketType: 'Ticket' as const,
        projectName: 'Website',
        agentKind: 'claude-code' as const,
        intent,
        parallelRuns,
        terminal,
        runMode: 'auto' as const,
        checkCommand: 'npm run check',
        planEstimate: { amount: 1.5, unit: 'usd' as const },
        retroCycle: { id: 44, title: 'Factory p2' },
      })),
    ),
  );

  it("keeps a Claude Code run's brief word for word", () => {
    expect(
      situations.map((situation) =>
        runBrief({ ...situation, agentKind: 'claude-code' }),
      ),
    ).toMatchSnapshot();
  });

  it('gives the Claude-only lines to Claude Code runs only', () => {
    const claudeOnly = /EnterWorktree|ExitWorktree|AskUserQuestion|CLAUDE\.md/;
    for (const situation of situations) {
      expect(runBrief({ ...situation, agentKind: 'copilot' })).not.toMatch(
        claudeOnly,
      );
    }
    expect(
      situations.some((situation) =>
        claudeOnly.test(runBrief({ ...situation, agentKind: 'claude-code' })),
      ),
    ).toBe(true);
  });

  it('keeps the shared parts for every kind', () => {
    const brief = runBrief({
      ...situations[0],
      intent: 'start',
      agentKind: 'copilot',
    });

    expect(brief).toContain('Ticket T7, "Fix it"');
    expect(brief).toContain('ask_choice');
    expect(brief).toContain('Your Agent-run ID: 5.');
    expect(brief).toContain('`npm run check`');
  });

  it("keeps a Copilot Start in Tandembike's worktree on the shared worktree line", () => {
    const brief = runBrief({
      ...situations[0],
      intent: 'start',
      parallelRuns: true,
      worktree: { path: '/wt/5', base: 'origin/main', onTicketBranch: true },
      agentKind: 'copilot',
    });

    expect(brief).toContain(
      'You are in a git worktree Tandembike made for this Conversation at /wt/5',
    );
    expect(brief).not.toContain('git worktree add');
  });

  it('names the Widget tools only on Copilot, never another way to ask', () => {
    const brief = runBrief({ ...situations[0], agentKind: 'copilot' });

    expect(brief).toContain(
      'whenever the answer is a pick, an order, a placement or an amount. Every Widget',
    );
  });

  it('accepts AGENTS.md or .github/copilot-instructions.md in a Copilot Setup check, and asks about no Claude Code allowlist', () => {
    const brief = runBrief({
      ...situations[0],
      intent: 'setup',
      agentKind: 'copilot',
    });

    expect(brief).toContain(
      '1. An AGENTS.md or a .github/copilot-instructions.md exists',
    );
    expect(brief).not.toContain('permission allowlist');
  });
});

describe('runBrief for Setup and the Check command', () => {
  const base = {
    conversationId: 5,
    ticketNumber: null,
    ticketTitle: null,
    ticketType: null,
    projectName: 'Website',
    agentKind: 'claude-code' as const,
    intent: 'setup' as const,
    parallelRuns: true,
    runMode: 'default' as const,
  };

  it('proposes the best detected command and saves it with set_check_command only on a yes', () => {
    const brief = runBrief({
      ...base,
      checkCommandSuggestions: ['npm run check', 'npm test'],
    });

    expect(brief).toContain(
      'Tandembike detected these candidates, best first: `npm run check`, `npm test`.',
    );
    expect(brief).toMatch(/When the Project has none, propose it/);
    expect(brief).toMatch(
      /save it with set_check_command only after the User says yes/,
    );
  });

  it('says to tell the User when no Check command is found', () => {
    const brief = runBrief({ ...base, checkCommandSuggestions: [] });

    expect(brief).toContain('Tandembike detected no candidate');
    expect(brief).toMatch(/When you find none, say so/);
  });
});

describe("runBrief for Setup's checklist", () => {
  const base = {
    conversationId: 5,
    ticketNumber: null,
    ticketTitle: null,
    ticketType: null,
    projectName: 'Website',
    agentKind: 'claude-code' as const,
    intent: 'setup' as const,
    parallelRuns: true,
    runMode: 'default' as const,
    defaultBranch: 'main',
    checkCommandSuggestions: ['npm run check'],
  };
  const setup = runBrief(base);

  it('inspects first, then asks one item at a time with a recommendation', () => {
    expect(setup).toMatch(/First inspect the repository for every item/);
    expect(setup).toMatch(/one item at a time/);
    expect(setup).toMatch(/your recommended answer/);
  });

  it('asks with a Widget in the app and in chat in a terminal', () => {
    expect(setup).toMatch(
      /ask_choice, with your recommendation in `recommended`/,
    );
    const terminal = runBrief({ ...base, terminal: true });
    expect(terminal).toMatch(/ask in the chat/);
    expect(terminal).not.toMatch(/ask_choice, with your recommendation/);
  });

  it('reports gh, installed and logged in, without offering a fix', () => {
    expect(setup).toMatch(
      /`gh` is installed and logged in \(`gh auth status`\)\. Report only/,
    );
  });

  it('reports whether CI exists and that Auto-merge hands off without it', () => {
    expect(setup).toMatch(/has a CI workflow, .*\. Report only\./);
    expect(setup).toMatch(
      /Without CI, Auto-merge hands every pull request to the User/,
    );
  });

  it('reports the default branch it found', () => {
    expect(setup).toContain(
      'The default branch: Tandembike found `main`. Report it, so the User can spot one they did not expect.',
    );
    expect(runBrief({ ...base, defaultBranch: null })).toContain(
      'Tandembike found none',
    );
  });

  it('offers a skeleton instructions file per Agent kind saying how to test, lint and run the app', () => {
    expect(setup).toMatch(
      /offer a skeleton `CLAUDE\.md` that says how to test, lint and run the app/,
    );
    expect(runBrief({ ...base, agentKind: 'copilot' })).toMatch(
      /offer a skeleton `AGENTS\.md` that says how to test, lint and run the app/,
    );
  });

  it('offers a git guardrail hook as advice, not a requirement', () => {
    expect(setup).toMatch(/offer to install one as advice, not a requirement/);
  });

  it('offers the first commit in a repository with none, the only commit Setup may make', () => {
    expect(setup).toMatch(
      /no commits yet, offer to make the first commit[^.]*only after the User's Allow/,
    );
    expect(setup).toMatch(
      /Never commit, push or open a pull request, except that first commit/,
    );
  });

  it('asks about no worktree convention: the runner makes each worktree', () => {
    expect(setup).not.toMatch(/convention for working in a git worktree/);
  });
});

describe('runBrief for Setup on an existing Project', () => {
  const base = {
    conversationId: 5,
    ticketNumber: null,
    ticketTitle: null,
    ticketType: null,
    projectName: 'Website',
    agentKind: 'claude-code' as const,
    intent: 'setup' as const,
    parallelRuns: true,
    runMode: 'default' as const,
    defaultBranch: 'main',
    checkCommandSuggestions: ['npm run check'],
  };

  it('keeps a Check command that matches the best suggestion without asking', () => {
    const brief = runBrief({ ...base, checkCommand: 'npm run check' });

    expect(brief).toContain("The Project's Check command is `npm run check`.");
    expect(brief).toMatch(
      /When it matches your best suggestion, report it as kept and ask nothing/,
    );
  });

  it('asks once about a Check command that differs, naming both, and never replaces it without a yes', () => {
    const brief = runBrief({ ...base, checkCommand: 'npm test' });

    expect(brief).toMatch(
      /When it differs, ask once, naming both and why yours may be better/,
    );
    expect(brief).toMatch(/Never clear or replace it without the User's yes/);
  });

  it('says the Project has no Check command yet when it has none', () => {
    expect(runBrief({ ...base, checkCommand: null })).toContain(
      'The Project has no Check command yet.',
    );
  });

  it('suggests only the missing sections of an existing instructions file, never the skeleton over it', () => {
    expect(runBrief(base)).toMatch(
      /When the file exists, suggest only its missing sections as an edit, never the skeleton/,
    );
  });

  it('reports an existing guardrail hook as already present, with no offer', () => {
    expect(runBrief(base)).toMatch(
      /When one exists, report it as already present and offer nothing/,
    );
  });

  it('gives items that already match one "already in place" line, not a question', () => {
    const brief = runBrief(base);

    expect(brief).toMatch(
      /An item that already matches gets no question, only "already in place" in the summary/,
    );
    expect(brief).toContain('already in place');
  });

  it('reports each stored Agent command and whether the Playbook covers its Stage, report only', () => {
    const brief = runBrief({
      ...base,
      agentCommandOverrides: [
        {
          label: 'Start command',
          command: '/implement',
          playbook: '/tandembike:implement',
        },
        {
          label: 'Triage command',
          command: '/triage',
          playbook: '/tandembike:triage',
        },
      ],
    });

    expect(brief).toContain(
      'Start command `/implement` overrides the Playbook, which covers this Stage with `/tandembike:implement`.',
    );
    expect(brief).toContain(
      'Triage command `/triage` overrides the Playbook, which covers this Stage with `/tandembike:triage`.',
    );
    expect(brief).toMatch(
      /the User can clear it in the Project's Settings so the Playbook runs\. Report only: do not change Agent commands/,
    );
  });

  it('says the Playbook runs every Stage when no Agent command is stored', () => {
    expect(runBrief({ ...base, agentCommandOverrides: [] })).toContain(
      'No Stage has an Agent command: the Playbook runs every Stage.',
    );
  });

  it('flags the fixed list of outdated conventions in the docs, each with its file and an edit', () => {
    const brief = runBrief(base);

    expect(brief).toContain('Outdated conventions');
    expect(brief).toMatch(
      /a branch-name pattern other than `ticket-<number>-<slug>`/,
    );
    expect(brief).toMatch(
      /instructions for agents to create their own worktree or branch at the start of a run/,
    );
    expect(brief).toMatch(/`\/to-spec`, `\/to-tickets` or a local `\/triage`/);
    expect(brief).toMatch(
      /Report each match with its file and offer an edit, which waits for the User's Allow/,
    );
  });
});

describe('runBrief for a New Ticket Conversation (T1666)', () => {
  const base = {
    conversationId: 5,
    ticketNumber: null,
    ticketTitle: null,
    ticketType: null,
    projectName: 'Website',
    agentKind: 'claude-code' as const,
    intent: 'new_ticket' as const,
    parallelRuns: false,
    runMode: 'auto' as const,
  };
  const brief = runBrief(base);

  it('looks at the code and for duplicate Tickets before asking', () => {
    expect(brief).toMatch(/Look first: read the code the title points at/);
    expect(brief).toContain('find_tickets');
    expect(brief).toMatch(/Never file a likely duplicate without asking/);
  });

  it('asks what changes the Ticket with Widgets, and names its own defaults', () => {
    expect(brief).toMatch(
      /changes the Ticket: its scope, its behaviour or its acceptance criteria/,
    );
    expect(brief).toMatch(/at most three questions/);
    expect(brief).toMatch(/`ask_choice` with your answer in `recommended`/);
    expect(brief).toMatch(/a skip is not agreement/);
    expect(brief).toMatch(/Pick obvious defaults yourself and name them/);
    expect(brief).toMatch(/A small, clear request may need no questions/);
  });

  it('grills a big or vague idea, or offers the Spec button, but never a small clear one', () => {
    expect(brief).toMatch(
      /vague, has several open design decisions or looks bigger than one Ticket/,
    );
    expect(brief).toMatch(/look facts up instead of asking them/);
    expect(brief).toMatch(/Stop when nothing is left silently assumed/);
    expect(brief).toMatch(/press Spec on it/);
    expect(brief).toMatch(/Never start a Spec yourself/);
    expect(brief).toMatch(/Never grill a small, clear request/);
  });

  it('shows the draft only when it guessed, and files straight away otherwise', () => {
    expect(brief).toMatch(/unconfirmed assumptions/);
    expect(brief).toMatch(/"File it"/);
    expect(brief).toMatch(/With nothing guessed, file straight away/);
  });

  it('names no skill the Project may lack', () => {
    expect(brief).not.toMatch(/grilling|skill/i);
  });

  it('gives every Agent kind the same steps', () => {
    const steps = (text: string) =>
      text.slice(text.indexOf('Clarify the request'));

    expect(steps(brief)).toMatch(/^Clarify the request/);
    expect(steps(runBrief({ ...base, agentKind: 'copilot' }))).toBe(
      steps(brief),
    );
  });

  it('gives the steps to no other intent', () => {
    for (const intent of conversationIntents.filter(
      (intent) => intent !== 'new_ticket',
    )) {
      expect(runBrief({ ...base, intent })).not.toMatch(/Look first:/);
    }
  });
});
