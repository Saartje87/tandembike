// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { NotAllowedError, NotFoundError, type ValidationError } from './errors';

const fieldErrors = (run: () => unknown) =>
  (errorFrom(run) as ValidationError).fieldErrors;

describe("A Project's agent commands", () => {
  it('start with the mattpocock-skills triage, implement and implement-spec commands', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    expect(tickets.getProjectAgentCommands(project.id)).toEqual({
      triageCommand: '/mattpocock-skills:triage',
      startCommand: '/mattpocock-skills:implement',
      startEpicCommand: '/mattpocock-skills:implement-spec',
    });
  });

  it('are replaced trimmed, with a missing slash added, and blank clears one', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    const saved = tickets.setProjectAgentCommands(project.id, {
      triageCommand: ' triage ',
      startCommand: '/implement',
      startEpicCommand: '   ',
    });

    expect(saved).toEqual({
      triageCommand: '/triage',
      startCommand: '/implement',
      startEpicCommand: null,
    });
    expect(tickets.getProjectAgentCommands(project.id)).toEqual(saved);
  });

  it('refuse a command with a space or over 100 characters, naming each field, and change nothing', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const before = tickets.getProjectAgentCommands(project.id);

    expect(
      fieldErrors(() =>
        tickets.setProjectAgentCommands(project.id, {
          triageCommand: '/triage T1',
          startCommand: '/implement',
          startEpicCommand: `/${'a'.repeat(100)}`,
        }),
      ),
    ).toEqual({
      triageCommand: '"/triage T1" has a space. Enter one command.',
      startEpicCommand: `"/${'a'.repeat(100)}" is longer than 100 characters.`,
    });
    expect(tickets.getProjectAgentCommands(project.id)).toEqual(before);
  });

  it('are refused for an archived Project, and read from a missing one fails', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.archiveProject(project.id);

    expect(
      errorFrom(() =>
        tickets.setProjectAgentCommands(project.id, {
          triageCommand: '',
          startCommand: '',
          startEpicCommand: '',
        }),
      ),
    ).toBeInstanceOf(NotAllowedError);
    expect(
      errorFrom(() => tickets.getProjectAgentCommands(999)),
    ).toBeInstanceOf(NotFoundError);
  });
});
