// @vitest-environment node

import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestTickets } from '../../test/tickets';
import { appTickets } from '../../tickets/app-tickets';
import { boardRoute } from '../lib/paths';
import {
  addReferenceTemplate,
  loadProjectSkills,
  removeReferenceTemplate,
  setProjectAgentCommands,
  setProjectAgentSettings,
  setProjectSkills,
  styleProject,
  updateReferenceTemplate,
} from './actions';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../../tickets/app-tickets', () => ({ appTickets: vi.fn() }));

describe('Project actions', () => {
  beforeEach(() => {
    vi.mocked(revalidatePath).mockClear();
  });

  it("sets a Project's colour and icon and refreshes every page", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await styleProject({
      projectId: project.id,
      color: 'teal',
      icon: 'rocket-launch',
    });

    expect(result).toEqual({ ok: true });
    expect(tickets.getProject(project.id)).toMatchObject({
      color: 'teal',
      icon: 'rocket-launch',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('clears one with null and leaves the other alone', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.styleProject(project.id, { color: 'teal', icon: 'rocket-launch' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    await styleProject({ projectId: project.id, color: null });

    expect(tickets.getProject(project.id)).toMatchObject({
      color: null,
      icon: 'rocket-launch',
    });
  });

  it('returns a refusal as an error', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await styleProject({
      projectId: project.id,
      color: 'beige' as never,
    });

    expect(result).toMatchObject({
      ok: false,
      fieldErrors: {
        color: expect.stringMatching(/^Choose one of these colours/),
      },
    });
  });
});

describe('setProjectAgentSettings', () => {
  it("saves a Project's agent settings and refreshes its pages", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await setProjectAgentSettings({
      projectId: project.id,
      repositoryPath: '/',
      parallelRuns: true,
      maxConcurrentRuns: 2,
      agentMode: true,
    });

    expect(result).toEqual({ ok: true });
    expect(tickets.getProjectAgentSettings(project.id)).toEqual({
      repositoryPath: '/',
      parallelRuns: true,
      maxConcurrentRuns: 2,
      agentMode: true,
    });
    expect(revalidatePath).toHaveBeenCalled();
  });

  it('returns a refusal with the field it names', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await setProjectAgentSettings({
      projectId: project.id,
      repositoryPath: '/no/such/dir-xyz',
    });

    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { repositoryPath: 'There is no directory at this path.' },
    });
  });
});

describe('Skill actions', () => {
  it("saves a Project's Skills from the textarea's lines and refreshes its pages", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await setProjectSkills({
      projectId: project.id,
      text: '/review\n\nplan\n',
    });

    expect(result).toEqual({ ok: true, skills: ['/review', '/plan'] });
    expect(tickets.getProjectSkills(project.id)).toEqual(['/review', '/plan']);
    expect(revalidatePath).toHaveBeenCalled();
  });

  it('returns a refusal naming the Skills field', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await setProjectSkills({
      projectId: project.id,
      text: '/to spec',
    });

    expect(result).toMatchObject({
      ok: false,
      fieldErrors: {
        skills: '"/to spec" has a space. Enter one command per line.',
      },
    });
  });

  it("saves a Project's agent commands and returns them as stored", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await setProjectAgentCommands({
      projectId: project.id,
      triageCommand: 'triage',
      startCommand: '/implement',
      startEpicCommand: '',
    });

    const commands = {
      triageCommand: '/triage',
      startCommand: '/implement',
      startEpicCommand: null,
    };
    expect(result).toEqual({ ok: true, commands });
    expect(tickets.getProjectAgentCommands(project.id)).toEqual(commands);
    expect(revalidatePath).toHaveBeenCalled();
  });

  it('returns a refusal naming the agent command field', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await setProjectAgentCommands({
      projectId: project.id,
      triageCommand: '',
      startCommand: '/implement T1',
      startEpicCommand: '',
    });

    expect(result).toMatchObject({
      ok: false,
      fieldErrors: {
        startCommand: '"/implement T1" has a space. Enter one command.',
      },
    });
  });

  it("loads the Skills of a Project, or of a Ticket's Project", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });
    tickets.setProjectSkills(project.id, ['/review']);
    vi.mocked(appTickets).mockReturnValue(tickets);

    expect(await loadProjectSkills({ projectId: project.id })).toEqual({
      ok: true,
      skills: ['/review'],
    });
    expect(await loadProjectSkills({ ticketNumber: ticket.number })).toEqual({
      ok: true,
      skills: ['/review'],
    });
    expect(await loadProjectSkills({ projectId: 999 })).toMatchObject({
      ok: false,
    });
  });
});

describe('Reference template actions', () => {
  const github = 'https://github.com/acme/web/issues/{n}';

  beforeEach(() => {
    vi.mocked(revalidatePath).mockClear();
  });

  function setUp() {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    vi.mocked(appTickets).mockReturnValue(tickets);
    return { tickets, project };
  }

  it('adds a template and refreshes every page of the Project', async () => {
    const { tickets, project } = setUp();

    const result = await addReferenceTemplate({
      projectId: project.id,
      prefix: '#',
      url: github,
    });

    expect(result).toEqual({ ok: true });
    expect(tickets.listReferenceTemplates(project.id)).toMatchObject([
      { prefix: '#', url: github },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith(boardRoute, 'layout');
  });

  it('returns a refusal with the field it names', async () => {
    const { project } = setUp();

    const result = await addReferenceTemplate({
      projectId: project.id,
      prefix: 'A B',
      url: github,
    });

    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { prefix: expect.stringMatching(/without spaces/) },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('edits and removes a template', async () => {
    const { tickets, project } = setUp();
    const template = tickets.addReferenceTemplate(project.id, {
      prefix: '#',
      url: github,
    });

    expect(
      await updateReferenceTemplate({
        id: template.id,
        prefix: 'GH-',
        url: github,
      }),
    ).toEqual({ ok: true });
    expect(tickets.listReferenceTemplates(project.id)).toMatchObject([
      { prefix: 'GH-' },
    ]);

    expect(await removeReferenceTemplate({ id: template.id })).toEqual({
      ok: true,
    });
    expect(tickets.listReferenceTemplates(project.id)).toEqual([]);
    expect(revalidatePath).toHaveBeenCalledTimes(2);
  });
});
