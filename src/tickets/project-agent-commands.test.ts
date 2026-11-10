import { describe, expect, it } from 'vitest';

import { agentCommandEntries, agentCommands } from '../test/fixtures';
import { createTestTickets, errorFrom } from '../test/tickets';
import { NotAllowedError, NotFoundError, type ValidationError } from './errors';

const fieldErrors = (run: () => unknown) =>
  (errorFrom(run) as ValidationError).fieldErrors;

describe("A Project's agent commands", () => {
  it('start blank, so every Stage runs the Playbook', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    expect(tickets.getProjectAgentCommands(project.id)).toEqual(
      agentCommands(),
    );
  });

  it('are kept as set when more Projects are created', () => {
    const tickets = createTestTickets();
    const first = tickets.createProject({ name: 'First' });
    tickets.setProjectAgentCommands(
      first.id,
      agentCommandEntries({
        triageCommand: 'triage',
        startCommand: 'implement',
      }),
    );
    tickets.setProjectAgentSettings(first.id, { runMode: 'default' });

    tickets.createProject({ name: 'Second' });

    expect(tickets.getProjectAgentCommands(first.id)).toMatchObject({
      triageCommand: '/triage',
      startCommand: '/implement',
    });
    expect(tickets.getProjectAgentSettings(first.id).runMode).toBe('default');
  });

  it('are replaced trimmed, with a missing slash added, and blank clears one', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    const saved = tickets.setProjectAgentCommands(
      project.id,
      agentCommandEntries({
        triageCommand: ' triage ',
        startCommand: '/implement',
        startEpicCommand: '   ',
        retroCommand: ' retro ',
        specCommand: '/spec',
        mergeCommand: ' merge ',
      }),
    );

    expect(saved).toEqual(
      agentCommands({
        triageCommand: '/triage',
        startCommand: '/implement',
        retroCommand: '/retro',
        specCommand: '/spec',
        mergeCommand: '/merge',
      }),
    );
    expect(tickets.getProjectAgentCommands(project.id)).toEqual(saved);
  });

  it('refuse a command with a space or over 100 characters, naming each field, and change nothing', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const before = tickets.getProjectAgentCommands(project.id);

    expect(
      fieldErrors(() =>
        tickets.setProjectAgentCommands(
          project.id,
          agentCommandEntries({
            triageCommand: '/triage T1',
            startCommand: '/implement',
            startEpicCommand: `/${'a'.repeat(100)}`,
            retroCommand: '/retro',
            specCommand: '/spec',
            mergeCommand: '/merge now',
          }),
        ),
      ),
    ).toEqual({
      triageCommand: '"/triage T1" has a space. Enter one command.',
      startEpicCommand: `"/${'a'.repeat(100)}" is longer than 100 characters.`,
      mergeCommand: '"/merge now" has a space. Enter one command.',
    });
    expect(tickets.getProjectAgentCommands(project.id)).toEqual(before);
  });

  it('are refused for an archived Project, and read from a missing one fails', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.archiveProject(project.id);

    expect(
      errorFrom(() =>
        tickets.setProjectAgentCommands(project.id, agentCommandEntries()),
      ),
    ).toBeInstanceOf(NotAllowedError);
    expect(
      errorFrom(() => tickets.getProjectAgentCommands(999)),
    ).toBeInstanceOf(NotFoundError);
  });
});

describe('The Spec command (T1222)', () => {
  it('is saved, and a blank one sends the Playbook command', async () => {
    const { agentCommandMessage } = await import('./agent-commands');
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const blank = tickets.getProjectAgentCommands(project.id);

    expect(
      agentCommandMessage('spec', { number: 42, type: 'Ticket' }, blank),
    ).toBe('/tandembike:spec T42');

    const saved = tickets.setProjectAgentCommands(
      project.id,
      agentCommandEntries({ specCommand: 'my:spec' }),
    );
    expect(saved.specCommand).toBe('/my:spec');
    expect(
      agentCommandMessage('spec', { number: 42, type: 'Epic' }, saved),
    ).toBe('/my:spec T42');
  });
});
