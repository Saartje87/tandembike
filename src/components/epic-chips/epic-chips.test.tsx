import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTicket } from '../../app/tickets/actions';
import { renderWithTheme } from '../../test/render';
import type { EpicChild, Ticket } from '../../tickets/tickets';
import { EpicChips } from './epic-chips';

vi.mock('../../app/tickets/actions', () => ({ createTicket: vi.fn() }));

const child = (
  fields: Partial<EpicChild> & Pick<EpicChild, 'number'>,
): EpicChild => ({
  title: `Child ${fields.number}`,
  status: 'Todo',
  archived: false,
  blockedBy: [],
  blocked: false,
  ...fields,
});

const epic = (
  fields: Partial<Ticket> & Pick<Ticket, 'number' | 'title'>,
): Ticket => ({
  description: '',
  status: 'Todo',
  projectId: 1,
  position: 0,
  archived: false,
  labels: [],
  externalReferences: [],
  blockedBy: [],
  blocked: false,
  type: 'Epic',
  color: 'teal',
  epic: null,
  children: [],
  origin: null,
  splitOff: [],
  claim: null,
  acceptanceCriteria: [],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...fields,
});

const chips = () =>
  within(screen.getByRole('list', { name: 'Epics' }))
    .queryAllByRole('link')
    .map((link) => link.textContent);

describe('EpicChips', () => {
  beforeEach(() => {
    vi.mocked(createTicket).mockReset();
  });

  it('lists each Epic in the given order with its number, title and progress', () => {
    renderWithTheme(
      <EpicChips
        projectId={1}
        boardPath="/project/1"
        epics={[
          epic({
            number: 4,
            title: 'Checkout',
            status: 'In progress',
            children: [
              child({ number: 5, status: 'Done' }),
              child({ number: 6 }),
              child({ number: 7, status: 'Done', archived: true }),
            ],
          }),
          epic({ number: 2, title: 'Search' }),
        ]}
      />,
    );

    expect(chips()).toEqual(['T4 Checkout 1/2 Done', 'T2 Search 0/0 Done']);
  });

  it("opens an Epic's drawer over the Board", () => {
    renderWithTheme(
      <EpicChips
        projectId={1}
        boardPath="/project/1/cycle/3"
        epics={[epic({ number: 4, title: 'Checkout' })]}
      />,
    );

    expect(screen.getByRole('link', { name: /Checkout/ })).toHaveAttribute(
      'href',
      '/project/1/cycle/3?ticket=4',
    );
  });

  it('hides done Epics until the User asks for them', async () => {
    renderWithTheme(
      <EpicChips
        projectId={1}
        boardPath="/project/1"
        epics={[
          epic({
            number: 4,
            title: 'Checkout',
            status: 'Done',
            children: [child({ number: 5, status: 'Done' })],
          }),
          epic({ number: 2, title: 'Search' }),
        ]}
      />,
    );

    expect(chips()).toEqual(['T2 Search 0/0 Done']);

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Show done Epics (1)' }),
    );

    expect(chips()).toEqual(['T4 Checkout 1/1 Done', 'T2 Search 0/0 Done']);
  });

  it('offers no done toggle when no Epic is done', () => {
    renderWithTheme(
      <EpicChips
        projectId={1}
        boardPath="/project/1"
        epics={[epic({ number: 2, title: 'Search' })]}
      />,
    );

    expect(
      screen.queryByRole('checkbox', { name: /Show done Epics/ }),
    ).not.toBeInTheDocument();
  });

  it('creates an Epic in the Project and Cycle from its New Epic button', async () => {
    vi.mocked(createTicket).mockResolvedValue({ ok: true, number: 9 });
    renderWithTheme(
      <EpicChips projectId={1} cycleId={3} boardPath="/project/1" epics={[]} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'New Epic' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'New Epic title' }),
      'Checkout{Enter}',
    );

    expect(createTicket).toHaveBeenCalledWith({
      projectId: 1,
      cycleId: 3,
      title: 'Checkout',
      type: 'Epic',
    });
    expect(
      screen.queryByRole('textbox', { name: 'New Epic title' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Epic' })).toHaveFocus();
  });

  it('closes the New Epic field on Escape without creating', async () => {
    renderWithTheme(
      <EpicChips projectId={1} boardPath="/project/1" epics={[]} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'New Epic' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'New Epic title' }),
      'Check{Escape}',
    );

    expect(createTicket).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('textbox', { name: 'New Epic title' }),
    ).not.toBeInTheDocument();
  });

  it("colours each chip with its Epic's colour", () => {
    renderWithTheme(
      <EpicChips
        projectId={1}
        boardPath="/project/1"
        epics={[epic({ number: 4, title: 'Checkout', color: 'pink' })]}
      />,
    );

    expect(
      screen.getByRole('link', { name: /Checkout/ }).closest('li'),
    ).toHaveAttribute('data-color', 'pink');
  });
});
