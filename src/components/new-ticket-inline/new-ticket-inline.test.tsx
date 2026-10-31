import { fireEvent, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { startConversation } from '../../app/conversations/actions';
import { createTicket } from '../../app/tickets/actions';
import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import {
  type ProjectAgentMode,
  ProjectAgentProvider,
} from '../project-agent/project-agent';
import { NewTicketInline } from './new-ticket-inline';

vi.mock('../../app/tickets/actions', () => ({ createTicket: vi.fn() }));
vi.mock('../../app/conversations/actions', () => ({
  startConversation: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: () => '/project/3',
  useSearchParams: () => new URLSearchParams(),
}));

const titleField = () =>
  screen.getByRole<HTMLInputElement>('textbox', { name: 'New Ticket title' });

describe('NewTicketInline', () => {
  beforeEach(() => {
    vi.mocked(createTicket).mockReset();
  });

  it('plans a new Ticket into the Cycle whose tab it is on', async () => {
    vi.mocked(createTicket).mockResolvedValue({ ok: true, number: 12 });
    renderWithTheme(<NewTicketInline projectId={3} cycleId={7} />);

    await userEvent.type(titleField(), 'Fix the header{Enter}');

    expect(createTicket).toHaveBeenCalledExactlyOnceWith({
      projectId: 3,
      title: 'Fix the header',
      cycleId: 7,
    });
  });

  it('creates an Epic instead when asked to', async () => {
    vi.mocked(createTicket).mockResolvedValue({ ok: true, number: 12 });
    renderWithTheme(<NewTicketInline projectId={3} type="Epic" />);

    await userEvent.type(
      screen.getByRole('textbox', { name: 'New Epic title' }),
      'Checkout{Enter}',
    );

    expect(createTicket).toHaveBeenCalledExactlyOnceWith({
      projectId: 3,
      title: 'Checkout',
      type: 'Epic',
    });
  });

  it('offers no way to create an Epic from a Ticket field', () => {
    renderWithTheme(<NewTicketInline projectId={3} />);

    expect(
      screen.queryByRole('button', { name: 'Create Epic' }),
    ).not.toBeInTheDocument();
  });

  it('creates a child Ticket under an Epic, with no Epic button', async () => {
    vi.mocked(createTicket).mockResolvedValue({ ok: true, number: 12 });
    renderWithTheme(<NewTicketInline projectId={3} epicNumber={8} />);

    await userEvent.type(
      screen.getByRole('textbox', { name: 'New child Ticket title' }),
      'Pay by card{Enter}',
    );

    expect(createTicket).toHaveBeenCalledExactlyOnceWith({
      projectId: 3,
      title: 'Pay by card',
      epicNumber: 8,
    });
    expect(
      screen.queryByRole('button', { name: 'Create Epic' }),
    ).not.toBeInTheDocument();
  });

  it('creates a Ticket with the title on Enter', async () => {
    vi.mocked(createTicket).mockResolvedValue({ ok: true, number: 12 });
    renderWithTheme(<NewTicketInline projectId={3} />);

    await userEvent.type(titleField(), 'Fix the header{Enter}');

    expect(createTicket).toHaveBeenCalledExactlyOnceWith({
      projectId: 3,
      title: 'Fix the header',
    });
  });

  it('tells which Ticket it created', async () => {
    vi.mocked(createTicket).mockResolvedValue({ ok: true, number: 12 });
    const onCreated = vi.fn();
    renderWithTheme(<NewTicketInline projectId={3} onCreated={onCreated} />);

    await userEvent.type(titleField(), 'Fix the header{Enter}');

    expect(onCreated).toHaveBeenCalledExactlyOnceWith(12);
  });

  it('is empty and focused for another Ticket after creating one', async () => {
    vi.mocked(createTicket).mockResolvedValue({ ok: true, number: 12 });
    renderWithTheme(<NewTicketInline projectId={3} />);

    await userEvent.type(titleField(), 'Fix the header{Enter}');

    await waitFor(() => expect(titleField()).toHaveValue(''));
    expect(titleField()).toHaveFocus();
  });

  it('explains a refused title next to the field and keeps the text', async () => {
    vi.mocked(createTicket).mockResolvedValue({
      ok: false,
      error: 'Enter a title.',
      fieldErrors: { title: 'Enter a title.' },
    });
    renderWithTheme(<NewTicketInline projectId={3} />);

    await userEvent.type(titleField(), '   {Enter}');

    await waitFor(() =>
      expect(titleField()).toHaveAccessibleDescription('Enter a title.'),
    );
    expect(titleField()).toBeInvalid();
    expect(titleField()).toHaveValue('   ');
  });

  it('shows an error that is not about the title next to the field', async () => {
    vi.mocked(createTicket).mockResolvedValue({
      ok: false,
      error: 'There is no Project with id 3.',
    });
    renderWithTheme(<NewTicketInline projectId={3} />);

    await userEvent.type(titleField(), 'Fix the header{Enter}');

    await waitFor(() =>
      expect(titleField()).toHaveAccessibleDescription(
        'There is no Project with id 3.',
      ),
    );
    expect(titleField()).not.toBeInvalid();
    expect(titleField()).toHaveValue('Fix the header');
  });

  it('cancels on Escape without creating a Ticket', async () => {
    vi.mocked(createTicket).mockResolvedValue({
      ok: false,
      error: 'Enter a title.',
      fieldErrors: { title: 'Enter a title.' },
    });
    renderWithTheme(<NewTicketInline projectId={3} />);

    await userEvent.type(titleField(), ' {Enter}');
    await waitFor(() => expect(titleField()).toBeInvalid());
    await userEvent.type(titleField(), 'Fix the header{Escape}');

    expect(createTicket).toHaveBeenCalledOnce();
    expect(titleField()).toHaveValue('');
    expect(titleField()).not.toBeInvalid();
    expect(titleField()).not.toHaveAccessibleDescription();
    expect(titleField()).not.toHaveFocus();
  });

  it('creates one Ticket however often Enter is pressed while it saves', async () => {
    let finish: (result: { ok: true; number: number }) => void = () => {};
    vi.mocked(createTicket).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderWithTheme(<NewTicketInline projectId={3} />);

    await userEvent.type(titleField(), 'Fix the header{Enter}');
    // Browsers submit on Enter in a read-only field; user-event does not.
    const { form } = titleField();
    if (!form) {
      throw new Error('The title field is not in a form.');
    }
    fireEvent.submit(form);
    await userEvent.keyboard('{Enter}next{Escape}');
    finish({ ok: true, number: 12 });

    await waitFor(() => expect(titleField()).toHaveValue(''));
    expect(createTicket).toHaveBeenCalledOnce();
    expect(titleField()).toHaveFocus();
  });

  it('shows a placeholder in the empty field', () => {
    renderWithTheme(<NewTicketInline projectId={3} />);

    expect(titleField()).toHaveAttribute('placeholder', 'Add a Ticket…');
  });

  it('creates a Ticket with the Create Ticket button', async () => {
    vi.mocked(createTicket).mockResolvedValue({ ok: true, number: 12 });
    renderWithTheme(<NewTicketInline projectId={3} />);

    await userEvent.type(titleField(), 'Fix the header');
    await userEvent.click(
      screen.getByRole('button', { name: 'Create Ticket' }),
    );

    expect(createTicket).toHaveBeenCalledExactlyOnceWith({
      projectId: 3,
      title: 'Fix the header',
    });
    await waitFor(() => expect(titleField()).toHaveValue(''));
  });

  describe('with an Agent', () => {
    const renderWithAgent = (
      mode: ProjectAgentMode,
      props: Partial<Parameters<typeof NewTicketInline>[0]> = {},
    ) => {
      const router = mockRouter();
      vi.mocked(useRouter).mockReturnValue(router);
      vi.mocked(startConversation).mockResolvedValue({
        ok: true,
        conversation: { id: 9 } as never,
      });
      vi.mocked(createTicket).mockResolvedValue({ ok: true, number: 12 });
      renderWithTheme(
        <ProjectAgentProvider mode={mode}>
          <NewTicketInline projectId={3} {...props} />
        </ProjectAgentProvider>,
      );
      return router;
    };

    it('starts a New Ticket Conversation on Enter in agent mode, and opens it', async () => {
      const router = renderWithAgent('default', { cycleId: 7 });

      await userEvent.type(titleField(), 'Add coupons{Enter}');

      expect(startConversation).toHaveBeenCalledExactlyOnceWith({
        projectId: 3,
        intent: 'new_ticket',
        prompt: 'Add coupons',
        defaults: { cycleId: 7, type: 'Ticket' },
      });
      expect(createTicket).not.toHaveBeenCalled();
      expect(router.push).toHaveBeenCalledWith('/project/3?conversation=9', {
        scroll: false,
      });
      await waitFor(() => expect(titleField()).toHaveValue(''));
    });

    it('creates a plain Ticket on Mod+Enter in agent mode', async () => {
      renderWithAgent('default');

      await userEvent.type(titleField(), 'Fix it{Control>}{Enter}{/Control}');

      expect(createTicket).toHaveBeenCalledOnce();
      expect(startConversation).not.toHaveBeenCalled();
    });

    it('does the reverse with agent mode off', async () => {
      renderWithAgent('optional');

      await userEvent.type(titleField(), 'Fix it{Enter}');
      expect(createTicket).toHaveBeenCalledOnce();
      expect(startConversation).not.toHaveBeenCalled();

      await userEvent.type(titleField(), 'Plan it{Meta>}{Enter}{/Meta}');
      expect(startConversation).toHaveBeenCalledOnce();
    });

    it('says which key does which', async () => {
      renderWithAgent('default');
      await userEvent.click(titleField());
      expect(
        screen.getByText(
          'Enter asks an Agent to create it. Ctrl/Cmd+Enter creates the Ticket yourself.',
        ),
      ).toBeInTheDocument();
    });

    it('says which key does which with agent mode off', async () => {
      renderWithAgent('optional');
      await userEvent.click(titleField());
      expect(
        screen.getByText(
          'Enter creates the Ticket. Ctrl/Cmd+Enter asks an Agent to create it.',
        ),
      ).toBeInTheDocument();
    });

    it('opens it in place of the Epic drawer it was typed in, linking back', async () => {
      const router = renderWithAgent('default', { epicNumber: 8 });

      await userEvent.type(
        screen.getByRole('textbox', { name: 'New child Ticket title' }),
        'Pay by card{Enter}',
      );

      expect(startConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          defaults: { epicNumber: 8, type: 'Ticket' },
        }),
      );
      expect(router.push).toHaveBeenCalledWith(
        '/project/3?conversation=9&from=8',
        { scroll: false },
      );
    });

    it('shows a refusal under the field and keeps the title', async () => {
      renderWithAgent('default');
      vi.mocked(startConversation).mockResolvedValue({
        ok: false,
        error: 'Set a repository path first.',
      });

      await userEvent.type(titleField(), 'Add coupons{Enter}');

      expect(
        await screen.findByText('Set a repository path first.'),
      ).toBeInTheDocument();
      expect(titleField()).toHaveValue('Add coupons');
    });
  });

  it('gives no hint and creates plainly on Mod+Enter without an Agent', async () => {
    vi.mocked(createTicket).mockResolvedValue({ ok: true, number: 12 });
    renderWithTheme(<NewTicketInline projectId={3} />);

    await userEvent.type(titleField(), 'Fix it{Control>}{Enter}{/Control}');

    expect(screen.queryByText(/Ctrl\/Cmd\+Enter/)).not.toBeInTheDocument();
    expect(createTicket).toHaveBeenCalledOnce();
  });
});
