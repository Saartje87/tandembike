// @vitest-environment node

import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestTickets } from '../../test/tickets';
import { appTickets } from '../../tickets/app-tickets';
import { styleProject } from './actions';

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
