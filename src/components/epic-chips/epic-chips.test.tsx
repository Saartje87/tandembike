import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTicket } from '../../app/tickets/actions';
import type { LiveConversation } from '../../conversations/conversation-activity';
import { renderWithTheme } from '../../test/render';
import type { EpicChild, Ticket } from '../../tickets/tickets';
import {
  useLiveConversations,
  useTicketCosts,
} from '../conversation-activity/conversation-activity';
import { EpicChips } from './epic-chips';

vi.mock('../../app/tickets/actions', () => ({ createTicket: vi.fn() }));
vi.mock('../conversation-activity/conversation-activity', () => ({
  useLiveConversations: vi.fn(() => ({})),
  useTicketCosts: vi.fn(() => ({})),
}));

const pullRequest = 'https://github.com/owner/repo/pull/9';
const liveConversation = (
  state: LiveConversation['state'],
): LiveConversation => ({
  state,
  line: 'Reading board.tsx',
  since: '2026-11-07T10:00:00.000Z',
  cost: 0,
});

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
  attachments: [],
  blockedBy: [],
  blocked: false,
  type: 'Epic',
  color: 'teal',
  epic: null,
  children: [],
  origin: null,
  splitOff: [],
  cycle: null,
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
    vi.mocked(useLiveConversations).mockReturnValue({});
    vi.mocked(useTicketCosts).mockReturnValue({});
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
      screen.getByRole('switch', { name: 'Show done Epics (1)' }),
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
      screen.queryByRole('switch', { name: /Show done Epics/ }),
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

  describe('state badge', () => {
    const inProgress = (fields: Partial<Ticket> = {}) =>
      epic({ number: 4, title: 'Checkout', status: 'In progress', ...fields });
    const render = (epics: Ticket[], onMerged = vi.fn()) =>
      renderWithTheme(
        <EpicChips
          projectId={1}
          boardPath="/project/1"
          epics={epics}
          onMerged={onMerged}
        />,
      );

    it('says Action needed for an In progress Epic with no Claim and no PR', () => {
      render([inProgress()]);

      expect(screen.getByText('Action needed')).toBeInTheDocument();
    });

    it('says Running for an In progress Epic with a Claim', () => {
      render([
        inProgress({
          claim: {
            agentRunId: 'run-1',
            agentName: null,
            claimedAt: new Date(),
          },
        } as Partial<Ticket>),
      ]);

      expect(screen.getByText('Running')).toBeInTheDocument();
    });

    it('says Review for an In progress Epic with a PR reference', () => {
      render([inProgress({ externalReferences: [pullRequest] })]);

      expect(screen.getByText('Review')).toBeInTheDocument();
    });

    it('lets a live Conversation decide the section', () => {
      vi.mocked(useLiveConversations).mockReturnValue({
        4: liveConversation('running'),
      });
      render([inProgress({ externalReferences: [pullRequest] })]);

      expect(screen.getByText('Running')).toBeInTheDocument();
      expect(screen.queryByText('Review')).not.toBeInTheDocument();
    });

    it('shows no badge on a Todo or Done Epic', () => {
      render([
        epic({ number: 2, title: 'Search', externalReferences: [pullRequest] }),
        epic({ number: 3, title: 'Cart', status: 'Done' }),
      ]);
      expect(screen.queryByText('Review')).not.toBeInTheDocument();
      expect(screen.queryByText('Action needed')).not.toBeInTheDocument();
    });

    it('keeps the badge outside the link', () => {
      render([inProgress()]);

      expect(screen.getByRole('link')).not.toHaveTextContent('Action needed');
    });
  });

  describe('status line', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date('2026-11-07T10:12:00Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("shows an Epic's live Conversation line and elapsed time", () => {
      vi.mocked(useLiveConversations).mockReturnValue({
        4: liveConversation('running'),
      });
      renderWithTheme(
        <EpicChips
          projectId={1}
          boardPath="/project/1"
          epics={[
            epic({ number: 4, title: 'Checkout', status: 'In progress' }),
          ]}
        />,
      );

      expect(screen.getByText('Reading board.tsx')).toBeInTheDocument();
      expect(screen.getByText('12m')).toBeInTheDocument();
    });

    it('shows none without a live Conversation', () => {
      renderWithTheme(
        <EpicChips
          projectId={1}
          boardPath="/project/1"
          epics={[
            epic({ number: 4, title: 'Checkout', status: 'In progress' }),
          ]}
        />,
      );

      expect(screen.queryByText('Reading board.tsx')).not.toBeInTheDocument();
    });
  });

  describe('cost', () => {
    const withChildren = epic({
      number: 4,
      title: 'Checkout',
      status: 'In progress',
      children: [child({ number: 5 }), child({ number: 6 })],
    });

    it("shows the Epic's own cost plus its children's", () => {
      vi.mocked(useTicketCosts).mockReturnValue({
        4: 0.5,
        5: 1,
        6: 0.25,
        9: 7,
      });
      renderWithTheme(
        <EpicChips
          projectId={1}
          boardPath="/project/1"
          epics={[withChildren]}
        />,
      );

      expect(screen.getByText('$1.75')).toBeInTheDocument();
    });

    it('is hidden at zero', () => {
      renderWithTheme(
        <EpicChips
          projectId={1}
          boardPath="/project/1"
          epics={[withChildren]}
        />,
      );

      expect(screen.queryByText(/^\$/)).not.toBeInTheDocument();
    });
  });

  describe('Merged', () => {
    const inReview = epic({
      number: 4,
      title: 'Checkout',
      status: 'In progress',
      externalReferences: [pullRequest],
    });

    it('is offered on an Epic in Review and reports that Epic', async () => {
      const onMerged = vi.fn();
      renderWithTheme(
        <EpicChips
          projectId={1}
          boardPath="/project/1"
          epics={[inReview]}
          onMerged={onMerged}
        />,
      );

      await userEvent.click(
        screen.getByRole('button', { name: 'Merged T4 Checkout' }),
      );

      expect(onMerged).toHaveBeenCalledWith(inReview);
    });

    it('is not offered outside Review', () => {
      renderWithTheme(
        <EpicChips
          projectId={1}
          boardPath="/project/1"
          epics={[
            epic({ number: 4, title: 'Checkout', status: 'In progress' }),
            epic({ number: 2, title: 'Search' }),
          ]}
          onMerged={vi.fn()}
        />,
      );

      expect(
        screen.queryByRole('button', { name: /^Merged/ }),
      ).not.toBeInTheDocument();
    });
  });
});
