import { fireEvent, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addTicketAttachments,
  removeTicketAttachment,
} from '../../app/tickets/actions';
import { renderWithTheme } from '../../test/render';
import type { Attachment } from '../../tickets/attachments';
import { TicketAttachments } from './ticket-attachments';

vi.mock('../../app/tickets/actions', () => ({
  addTicketAttachments: vi.fn(),
  removeTicketAttachment: vi.fn(),
}));

const attachment = (overrides: Partial<Attachment>): Attachment => ({
  id: 1,
  ticketNumber: 4,
  name: 'shot.png',
  mediaType: 'image/png',
  size: 2048,
  author: 'user',
  createdAt: new Date('2026-03-01T09:00:00Z'),
  ...overrides,
});

describe('TicketAttachments', () => {
  beforeEach(() => {
    vi.mocked(addTicketAttachments).mockReset();
    vi.mocked(removeTicketAttachment).mockReset();
  });

  it('says there are no Attachments', () => {
    renderWithTheme(<TicketAttachments ticketNumber={4} attachments={[]} />);

    expect(
      screen.getByRole('heading', { name: 'Attachments' }),
    ).toBeInTheDocument();
    expect(screen.getByText('No Attachments')).toBeInTheDocument();
  });

  it('shows a previewable image as a thumbnail that opens it in a new tab', () => {
    renderWithTheme(
      <TicketAttachments
        ticketNumber={4}
        attachments={[attachment({ id: 7 })]}
      />,
    );

    const link = screen.getByRole('link', { name: /shot\.png/ });
    expect(link).toHaveAttribute('href', '/attachment/7');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
    expect(link).not.toHaveAttribute('download');
    expect(within(link).getByRole('img', { name: 'shot.png' })).toHaveAttribute(
      'src',
      '/attachment/7',
    );
  });

  it('shows any other file, SVG included, as a name and size link', () => {
    renderWithTheme(
      <TicketAttachments
        ticketNumber={4}
        attachments={[
          attachment({
            id: 8,
            name: 'logo.svg',
            mediaType: 'image/svg+xml',
            size: 1536,
          }),
          attachment({
            id: 9,
            name: 'report.pdf',
            mediaType: 'application/pdf',
            size: 3 * 1024 * 1024,
          }),
        ]}
      />,
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'logo.svg (1.5 KB)' }),
    ).toHaveAttribute('href', '/attachment/8');
    expect(
      screen.getByRole('link', { name: 'report.pdf (3 MB)' }),
    ).toHaveAttribute('href', '/attachment/9');
    for (const name of ['logo.svg (1.5 KB)', 'report.pdf (3 MB)']) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('download');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noreferrer');
    }
  });

  it('shows who added each Attachment and when', () => {
    renderWithTheme(
      <TicketAttachments
        ticketNumber={4}
        attachments={[
          attachment({ id: 1, author: 'user' }),
          attachment({
            id: 2,
            name: 'log.txt',
            mediaType: 'text/plain',
            author: 'agent',
          }),
        ]}
      />,
    );

    const [first, second] = screen.getAllByRole('listitem');
    expect(within(first).getByText('User')).toBeInTheDocument();
    expect(within(second).getByText('Agent')).toBeInTheDocument();
    expect(within(first).getByRole('time')).toHaveAttribute(
      'datetime',
      '2026-03-01T09:00:00.000Z',
    );
  });

  describe('removing', () => {
    const openDialog = async () => {
      renderWithTheme(
        <TicketAttachments
          ticketNumber={4}
          attachments={[attachment({ id: 7 })]}
        />,
      );
      await userEvent.click(
        within(screen.getByRole('listitem')).getByRole('button', {
          name: 'Remove',
        }),
      );
      return screen.getByRole('dialog', { name: 'Remove shot.png?' });
    };

    it('asks in a dialog before removing an Attachment for good', async () => {
      vi.mocked(removeTicketAttachment).mockResolvedValue({ ok: true });
      const dialog = await openDialog();

      expect(removeTicketAttachment).not.toHaveBeenCalled();
      expect(
        within(dialog).getByText('It cannot be restored once removed.'),
      ).toBeInTheDocument();

      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Remove attachment' }),
      );

      expect(removeTicketAttachment).toHaveBeenCalledExactlyOnceWith({ id: 7 });
    });

    it('keeps an Attachment when removing it is cancelled', async () => {
      const dialog = await openDialog();

      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Cancel' }),
      );

      expect(removeTicketAttachment).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows why removing was refused in the dialog', async () => {
      vi.mocked(removeTicketAttachment).mockResolvedValue({
        ok: false,
        error: 'There is no Attachment 7.',
      });
      const dialog = await openDialog();

      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Remove attachment' }),
      );

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'There is no Attachment 7.',
      );
    });
  });

  describe('adding', () => {
    const sent = () => {
      const [form] = vi.mocked(addTicketAttachments).mock.calls[0];
      return {
        number: form.get('number'),
        names: form.getAll('files').map((file) => (file as File).name),
      };
    };

    it('adds the files picked with the add button', async () => {
      vi.mocked(addTicketAttachments).mockResolvedValue({ ok: true });
      renderWithTheme(<TicketAttachments ticketNumber={4} attachments={[]} />);

      expect(screen.getByRole('button', { name: 'Add files' })).toBeEnabled();
      await userEvent.upload(screen.getByLabelText('Files to attach'), [
        new File(['a'], 'a.txt', { type: 'text/plain' }),
        new File(['b'], 'b.png', { type: 'image/png' }),
      ]);

      expect(sent()).toEqual({ number: '4', names: ['a.txt', 'b.png'] });
    });

    it('adds the files dropped on the section', async () => {
      vi.mocked(addTicketAttachments).mockResolvedValue({ ok: true });
      renderWithTheme(<TicketAttachments ticketNumber={4} attachments={[]} />);

      fireEvent.drop(screen.getByRole('region', { name: 'Attachments' }), {
        dataTransfer: {
          files: [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')],
        },
      });

      await vi.waitFor(() => expect(addTicketAttachments).toHaveBeenCalled());
      expect(sent()).toEqual({ number: '4', names: ['a.txt', 'b.txt'] });
    });

    it('shows why a file was refused on the section', async () => {
      vi.mocked(addTicketAttachments).mockResolvedValue({
        ok: false,
        error: 'Keep the file to 10 MB or smaller.',
      });
      renderWithTheme(<TicketAttachments ticketNumber={4} attachments={[]} />);

      await userEvent.upload(
        screen.getByLabelText('Files to attach'),
        new File(['a'], 'big.bin'),
      );

      expect(
        await screen.findByText('Keep the file to 10 MB or smaller.'),
      ).toBeInTheDocument();
    });

    it('clears the reason when the next add succeeds', async () => {
      vi.mocked(addTicketAttachments)
        .mockResolvedValueOnce({ ok: false, error: 'Too big.' })
        .mockResolvedValueOnce({ ok: true });
      renderWithTheme(<TicketAttachments ticketNumber={4} attachments={[]} />);
      const input = screen.getByLabelText('Files to attach');

      await userEvent.upload(input, new File(['a'], 'big.bin'));
      expect(await screen.findByText('Too big.')).toBeInTheDocument();
      await userEvent.upload(input, new File(['b'], 'b.txt'));

      await vi.waitFor(() =>
        expect(screen.queryByText('Too big.')).not.toBeInTheDocument(),
      );
    });
  });
});
