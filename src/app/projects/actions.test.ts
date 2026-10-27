// @vitest-environment node

import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestTickets } from '../../test/tickets';
import { appTickets } from '../../tickets/app-tickets';
import { boardRoute } from '../lib/paths';
import {
  addReferenceTemplate,
  removeReferenceTemplate,
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
