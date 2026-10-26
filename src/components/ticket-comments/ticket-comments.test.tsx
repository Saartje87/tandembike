import { act, fireEvent, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import {
  addTicketComment,
  editTicketComment,
  removeTicketComment,
} from '../../app/tickets/actions';
import { renderWithTheme } from '../../test/render';
import type { ActivityEntry } from '../../tickets/activity';
import type { Comment } from '../../tickets/tickets';
import { TicketComments } from './ticket-comments';

vi.mock('../../app/tickets/actions', () => ({
  addTicketComment: vi.fn(),
  editTicketComment: vi.fn(),
  removeTicketComment: vi.fn(),
}));

const byUser: Comment = {
  id: 1,
  ticketNumber: 4,
  author: 'user',
  body: 'Please check the **logo**.',
  createdAt: new Date('2026-03-01T09:00:00Z'),
  editedAt: null,
};

const byAgent: Comment = {
  id: 2,
  ticketNumber: 4,
  author: 'agent',
  body: 'Fixed in the header.',
  createdAt: new Date('2026-03-02T10:00:00Z'),
  editedAt: new Date('2026-03-02T11:30:00Z'),
};

const commentItems = () =>
  within(
    screen.getByRole('list', { name: 'Comments and Activity' }),
  ).getAllByRole('listitem');

/** A promise the test settles itself, to look at the UI while it is pending. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

const newComment = () => screen.getByRole('textbox', { name: 'Add a comment' });

describe('TicketComments', () => {
  beforeEach(() => {
    vi.mocked(addTicketComment).mockReset();
    vi.mocked(editTicketComment).mockReset();
    vi.mocked(removeTicketComment).mockReset();
  });

  it('shows each comment with its author, time and Markdown body', () => {
    renderWithTheme(
      <TicketComments ticketNumber={4} comments={[byUser, byAgent]} />,
    );

    const [first, second] = commentItems();
    expect(within(first).getByText('User')).toBeInTheDocument();
    expect(within(first).getByText('logo').tagName).toBe('STRONG');
    expect(
      within(first)
        .getAllByRole('time')
        .map((time) => time.getAttribute('datetime')),
    ).toEqual(['2026-03-01T09:00:00.000Z']);
    expect(within(first).queryByText(/edited/)).not.toBeInTheDocument();
    expect(within(second).getByText('Agent')).toBeInTheDocument();
    expect(within(second).getByText(/edited/)).toContainElement(
      within(second).getAllByRole('time')[1],
    );
    expect(
      within(second)
        .getAllByRole('time')
        .map((time) => time.getAttribute('datetime')),
    ).toEqual(['2026-03-02T10:00:00.000Z', '2026-03-02T11:30:00.000Z']);
  });

  it('shows Activity entries and comments in one timeline, oldest first', () => {
    const created: ActivityEntry = {
      id: 1,
      ticketNumber: 4,
      actor: 'user',
      changes: [{ type: 'created' }],
      createdAt: new Date('2026-02-28T08:00:00Z'),
    };
    const started: ActivityEntry = {
      id: 2,
      ticketNumber: 4,
      actor: 'agent',
      changes: [{ type: 'status', from: 'Todo', to: 'In progress' }],
      createdAt: new Date('2026-03-01T12:00:00Z'),
    };
    renderWithTheme(
      <TicketComments
        ticketNumber={4}
        comments={[byUser, byAgent]}
        activity={[created, started]}
      />,
    );

    expect(commentItems().map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^User created this Ticket · /),
      expect.stringContaining('Please check the logo.'),
      expect.stringMatching(
        /^Agent changed the Status from Todo to In progress · /,
      ),
      expect.stringContaining('Fixed in the header.'),
    ]);
    expect(
      screen.queryByText('No comments or Activity'),
    ).not.toBeInTheDocument();
  });

  it('says when the Ticket has no comments', () => {
    renderWithTheme(<TicketComments ticketNumber={4} comments={[]} />);

    expect(screen.getByText('No comments or Activity')).toBeInTheDocument();
  });

  it('adds a comment and clears the field once saved', async () => {
    const saved = deferred<{ ok: true }>();
    vi.mocked(addTicketComment).mockReturnValue(saved.promise);
    renderWithTheme(<TicketComments ticketNumber={4} comments={[]} />);

    await userEvent.type(newComment(), 'Looks *good*.');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));

    expect(addTicketComment).toHaveBeenCalledExactlyOnceWith({
      number: 4,
      body: 'Looks *good*.',
    });
    expect(screen.getByRole('button', { name: 'Comment' })).toBeDisabled();

    await act(async () => saved.resolve({ ok: true }));

    expect(newComment()).toHaveValue('');
  });

  it('saves a comment once however often it is submitted while it saves', async () => {
    const saved = deferred<{ ok: true }>();
    vi.mocked(addTicketComment).mockReturnValue(saved.promise);
    renderWithTheme(<TicketComments ticketNumber={4} comments={[]} />);

    await userEvent.type(newComment(), 'Looks good.');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));
    // The disabled button stops a click, not a submit from elsewhere.
    const { form } = screen.getByRole<HTMLTextAreaElement>('textbox', {
      name: 'Add a comment',
    });
    if (!form) {
      throw new Error('The comment field is not in a form.');
    }
    fireEvent.submit(form);
    await act(async () => saved.resolve({ ok: true }));

    expect(addTicketComment).toHaveBeenCalledOnce();
    expect(newComment()).toHaveValue('');
  });

  it('cannot add an empty comment', async () => {
    renderWithTheme(<TicketComments ticketNumber={4} comments={[]} />);

    await userEvent.type(newComment(), '  ');

    expect(screen.getByRole('button', { name: 'Comment' })).toBeDisabled();
  });

  it('keeps the draft and shows why a comment was refused', async () => {
    vi.mocked(addTicketComment).mockResolvedValue({
      ok: false,
      error: 'Keep the comment to 50,000 characters or fewer.',
      fieldErrors: { body: 'Keep the comment to 50,000 characters or fewer.' },
    });
    renderWithTheme(<TicketComments ticketNumber={4} comments={[]} />);

    await userEvent.type(newComment(), 'Too long');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));

    expect(newComment()).toHaveValue('Too long');
    expect(newComment()).toHaveAccessibleDescription(
      'Keep the comment to 50,000 characters or fewer.',
    );
  });

  it('keeps the reason a comment was refused while the draft changes', async () => {
    vi.mocked(addTicketComment).mockResolvedValue({
      ok: false,
      error: 'Keep the comment to 50,000 characters or fewer.',
      fieldErrors: { body: 'Keep the comment to 50,000 characters or fewer.' },
    });
    renderWithTheme(<TicketComments ticketNumber={4} comments={[]} />);

    await userEvent.type(newComment(), 'Too long');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));
    await userEvent.type(newComment(), '!');

    expect(newComment()).toHaveAccessibleDescription(
      'Keep the comment to 50,000 characters or fewer.',
    );
  });

  describe('editing a comment', () => {
    const commentInput = (item: HTMLElement) =>
      within(item).getByRole('textbox', { name: 'Comment' });
    const queryCommentInput = (item: HTMLElement) =>
      within(item).queryByRole('textbox', { name: 'Comment' });

    it('has no Edit button, and opens on a click on the body', async () => {
      renderWithTheme(<TicketComments ticketNumber={4} comments={[byAgent]} />);
      const [item] = commentItems();

      expect(
        within(item).queryByRole('button', { name: 'Edit' }),
      ).not.toBeInTheDocument();

      await userEvent.click(within(item).getByText('Fixed in the header.'));

      expect(commentInput(item)).toHaveValue('Fixed in the header.');
    });

    it('opens on Enter when the body has focus', async () => {
      renderWithTheme(<TicketComments ticketNumber={4} comments={[byAgent]} />);
      const [item] = commentItems();

      within(item)
        .getByText('Fixed in the header.')
        .closest<HTMLElement>('[tabindex="0"]')
        ?.focus();
      await userEvent.keyboard('{Enter}');

      expect(commentInput(item)).toHaveValue('Fixed in the header.');
    });

    it('follows a link in the body instead of opening it', async () => {
      const onDocumentClick = vi.fn((event: MouseEvent) =>
        event.preventDefault(),
      );
      document.addEventListener('click', onDocumentClick);
      onTestFinished(() =>
        document.removeEventListener('click', onDocumentClick),
      );
      renderWithTheme(
        <TicketComments
          ticketNumber={4}
          comments={[
            { ...byUser, body: 'See [the docs](https://example.com/docs).' },
          ]}
        />,
      );
      const [item] = commentItems();

      await userEvent.click(
        within(item).getByRole('link', { name: 'the docs' }),
      );

      expect(onDocumentClick).toHaveBeenCalledOnce();
      expect(queryCommentInput(item)).not.toBeInTheDocument();
    });

    it('hides Remove while the comment is being edited', async () => {
      vi.mocked(editTicketComment).mockResolvedValue({ ok: true });
      renderWithTheme(<TicketComments ticketNumber={4} comments={[byAgent]} />);
      const [item] = commentItems();
      const remove = () =>
        within(item).queryByRole('button', { name: 'Remove' });

      await userEvent.click(within(item).getByText('Fixed in the header.'));

      expect(remove()).not.toBeInTheDocument();

      await userEvent.click(
        within(item).getByRole('button', { name: 'Cancel' }),
      );

      expect(remove()).toBeInTheDocument();

      await userEvent.click(within(item).getByText('Fixed in the header.'));
      await userEvent.type(commentInput(item), '!');
      await userEvent.click(within(item).getByRole('button', { name: 'Save' }));

      expect(remove()).toBeInTheDocument();
    });

    it('saves on Cmd/Ctrl+Enter and closes at once showing the new text', async () => {
      const saved = deferred<{ ok: true }>();
      vi.mocked(editTicketComment).mockReturnValue(saved.promise);
      onTestFinished(() => act(async () => saved.resolve({ ok: true })));
      renderWithTheme(<TicketComments ticketNumber={4} comments={[byAgent]} />);
      const [item] = commentItems();

      await userEvent.click(within(item).getByText('Fixed in the header.'));
      await userEvent.clear(commentInput(item));
      await userEvent.type(commentInput(item), 'Fixed in the *nav*.');
      await userEvent.keyboard('{Control>}{Enter}{/Control}');

      expect(editTicketComment).toHaveBeenCalledExactlyOnceWith({
        id: 2,
        body: 'Fixed in the *nav*.',
      });
      expect(queryCommentInput(item)).not.toBeInTheDocument();
      expect(within(item).getByText('nav').tagName).toBe('EM');
    });

    it('saves on Save', async () => {
      vi.mocked(editTicketComment).mockResolvedValue({ ok: true });
      renderWithTheme(<TicketComments ticketNumber={4} comments={[byAgent]} />);
      const [item] = commentItems();

      await userEvent.click(within(item).getByText('Fixed in the header.'));
      await userEvent.type(commentInput(item), '!');
      await userEvent.click(within(item).getByRole('button', { name: 'Save' }));

      expect(editTicketComment).toHaveBeenCalledExactlyOnceWith({
        id: 2,
        body: 'Fixed in the header.!',
      });
      expect(queryCommentInput(item)).not.toBeInTheDocument();
    });

    it("reopens a refused edit with the User's text and the reason", async () => {
      vi.mocked(editTicketComment).mockResolvedValue({
        ok: false,
        error: 'Write something in the comment.',
        fieldErrors: { body: 'Write something in the comment.' },
      });
      renderWithTheme(<TicketComments ticketNumber={4} comments={[byAgent]} />);
      const [item] = commentItems();

      await userEvent.click(within(item).getByText('Fixed in the header.'));
      await userEvent.clear(commentInput(item));
      await userEvent.type(commentInput(item), '  ');
      await userEvent.click(within(item).getByRole('button', { name: 'Save' }));

      expect(await within(item).findByRole('textbox')).toHaveValue('  ');
      expect(commentInput(item)).toHaveAccessibleDescription(
        'Write something in the comment.',
      );
      expect(
        within(item).queryByRole('button', { name: 'Remove' }),
      ).not.toBeInTheDocument();
    });

    it('cancels silently on Escape or Cancel, and not on leaving the field', async () => {
      renderWithTheme(<TicketComments ticketNumber={4} comments={[byUser]} />);
      const [item] = commentItems();

      await userEvent.click(within(item).getByText('logo'));
      await userEvent.type(commentInput(item), ' More');
      await userEvent.click(document.body);

      expect(commentInput(item)).toHaveValue('Please check the **logo**. More');

      await userEvent.click(commentInput(item));
      await userEvent.keyboard('{Escape}');

      expect(queryCommentInput(item)).not.toBeInTheDocument();

      await userEvent.click(within(item).getByText('logo'));

      expect(commentInput(item)).toHaveValue('Please check the **logo**.');

      await userEvent.type(commentInput(item), ' More');
      await userEvent.click(
        within(item).getByRole('button', { name: 'Cancel' }),
      );

      expect(queryCommentInput(item)).not.toBeInTheDocument();
      expect(within(item).getByText('logo')).toBeInTheDocument();
      expect(within(item).queryByRole('alert')).not.toBeInTheDocument();
      expect(editTicketComment).not.toHaveBeenCalled();
    });
  });

  it('asks before removing a comment for good', async () => {
    vi.mocked(removeTicketComment).mockResolvedValue({ ok: true });
    renderWithTheme(<TicketComments ticketNumber={4} comments={[byUser]} />);
    const [item] = commentItems();

    await userEvent.click(within(item).getByRole('button', { name: 'Remove' }));

    expect(removeTicketComment).not.toHaveBeenCalled();
    expect(
      within(item).getByText('Remove this comment? It cannot be restored.'),
    ).toBeInTheDocument();

    await userEvent.click(
      within(item).getByRole('button', { name: 'Remove comment' }),
    );

    expect(removeTicketComment).toHaveBeenCalledExactlyOnceWith({ id: 1 });
  });

  it('keeps a comment when removing it is cancelled or refused', async () => {
    vi.mocked(removeTicketComment).mockResolvedValue({
      ok: false,
      error: 'There is no comment 1.',
    });
    renderWithTheme(<TicketComments ticketNumber={4} comments={[byUser]} />);
    const [item] = commentItems();

    await userEvent.click(within(item).getByRole('button', { name: 'Remove' }));
    await userEvent.click(within(item).getByRole('button', { name: 'Cancel' }));

    expect(
      within(item).queryByRole('button', { name: 'Remove comment' }),
    ).not.toBeInTheDocument();

    await userEvent.click(within(item).getByRole('button', { name: 'Remove' }));
    await userEvent.click(
      within(item).getByRole('button', { name: 'Remove comment' }),
    );

    expect(within(item).getByRole('alert')).toHaveTextContent(
      'There is no comment 1.',
    );
  });

  // Inside the drawer, a document click whose target has left the dialog
  // closes it, and these buttons are gone by the time the click gets there.
  it('keeps clicks that swap the buttons from reaching the document', async () => {
    const onDocumentClick = vi.fn();
    document.addEventListener('click', onDocumentClick);
    onTestFinished(() =>
      document.removeEventListener('click', onDocumentClick),
    );
    renderWithTheme(<TicketComments ticketNumber={4} comments={[byUser]} />);
    const [item] = commentItems();

    await userEvent.click(within(item).getByText('logo'));
    await userEvent.click(within(item).getByRole('button', { name: 'Cancel' }));
    await userEvent.click(within(item).getByRole('button', { name: 'Remove' }));
    await userEvent.click(within(item).getByRole('button', { name: 'Cancel' }));

    expect(onDocumentClick).not.toHaveBeenCalled();
  });
});
