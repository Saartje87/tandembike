import { Dialog, Drawer } from '@blockle/blocks';
import { createEvent, fireEvent, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { type FC, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

/** The section inside a drawer, as the Ticket drawer shows it. */
const Harness: FC = () => {
  const [nested, setNested] = useState(false);
  return (
    <>
      <p>Outside</p>
      <Drawer open onRequestClose={() => {}} aria-label="Ticket T4">
        <p>Description</p>
        <textarea aria-label="Comment" />
        <input aria-label="Title" />
        <div contentEditable suppressContentEditableWarning>
          Editable
        </div>
        <button type="button" onClick={() => setNested(true)}>
          Open nested
        </button>
        <Dialog
          open={nested}
          onRequestClose={() => setNested(false)}
          aria-label="Nested"
        >
          <p>Inside nested</p>
        </Dialog>
        <TicketAttachments ticketNumber={4} attachments={[]} />
      </Drawer>
    </>
  );
};

describe('TicketAttachments', () => {
  beforeEach(() => {
    vi.mocked(addTicketAttachments).mockReset();
    vi.mocked(removeTicketAttachment).mockReset();
  });

  it('says there are no Attachments, inviting a drop or paste', () => {
    renderWithTheme(<TicketAttachments ticketNumber={4} attachments={[]} />);

    expect(
      screen.getByRole('heading', { name: 'Attachments' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No Attachments. Drop or paste files here.'),
    ).toBeInTheDocument();
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

    type AddResult = Awaited<ReturnType<typeof addTicketAttachments>>;

    /** An add that runs until `finish` is called. */
    const pendingAdd = () => {
      let finish: (result: AddResult) => void = () => {};
      vi.mocked(addTicketAttachments).mockImplementationOnce(
        () =>
          new Promise<AddResult>((resolve) => {
            finish = resolve;
          }),
      );
      return (result: AddResult) => finish(result);
    };

    it('lets adds overlap and reads Adding... until the last finishes', async () => {
      const finishFirst = pendingAdd();
      const finishSecond = pendingAdd();
      renderWithTheme(<TicketAttachments ticketNumber={4} attachments={[]} />);
      const input = screen.getByLabelText('Files to attach');

      await userEvent.upload(input, new File(['a'], 'a.txt'));
      const button = await screen.findByRole('button', { name: 'Adding...' });
      expect(button).toBeEnabled();
      fireEvent.drop(screen.getByRole('region', { name: 'Attachments' }), {
        dataTransfer: { files: [new File(['b'], 'b.txt')] },
      });
      await vi.waitFor(() =>
        expect(addTicketAttachments).toHaveBeenCalledTimes(2),
      );

      finishFirst({ ok: true });
      await vi.waitFor(() =>
        expect(screen.getByRole('button', { name: 'Adding...' })).toBeEnabled(),
      );
      finishSecond({ ok: true });
      expect(
        await screen.findByRole('button', { name: 'Add files' }),
      ).toBeEnabled();
    });

    it('keeps the latest refusal when an overlapping add then succeeds', async () => {
      const finishFirst = pendingAdd();
      const finishSecond = pendingAdd();
      renderWithTheme(<TicketAttachments ticketNumber={4} attachments={[]} />);
      const input = screen.getByLabelText('Files to attach');

      await userEvent.upload(input, new File(['a'], 'big.bin'));
      await userEvent.upload(input, new File(['b'], 'b.txt'));
      expect(addTicketAttachments).toHaveBeenCalledTimes(2);
      finishFirst({ ok: false, error: 'Too big.' });
      expect(await screen.findByText('Too big.')).toBeInTheDocument();
      finishSecond({ ok: true });

      expect(
        await screen.findByRole('button', { name: 'Add files' }),
      ).toBeInTheDocument();
      expect(screen.getByText('Too big.')).toBeInTheDocument();
    });

    it('clears the reason when a new add starts', async () => {
      vi.mocked(addTicketAttachments)
        .mockResolvedValueOnce({ ok: false, error: 'Too big.' })
        .mockResolvedValueOnce({ ok: true });
      renderWithTheme(<TicketAttachments ticketNumber={4} attachments={[]} />);
      const input = screen.getByLabelText('Files to attach');

      await userEvent.upload(input, new File(['a'], 'big.bin'));
      expect(await screen.findByText('Too big.')).toBeInTheDocument();
      await userEvent.upload(input, new File(['b'], 'b.txt'));

      expect(screen.queryByText('Too big.')).not.toBeInTheDocument();
    });
  });

  describe('pasting', () => {
    type ClipboardContents = { files?: File[]; text?: string };

    /** Pastes on an element; returns whether the default was prevented. */
    const paste = (
      target: Element,
      { files = [], text }: ClipboardContents,
    ): boolean => {
      const types = [...(text === undefined ? [] : ['text/plain'])];
      if (files.length > 0) {
        types.push('Files');
      }
      const event = createEvent.paste(target, {
        clipboardData: {
          files,
          types,
          getData: (type: string) =>
            type === 'text/plain' ? (text ?? '') : '',
        },
      });
      fireEvent(target, event);
      return event.defaultPrevented;
    };

    const scrollIntoView = vi.fn();
    const { scrollIntoView: originalScrollIntoView } = Element.prototype;
    let reducedMotion = false;

    beforeEach(() => {
      vi.mocked(addTicketAttachments).mockResolvedValue({ ok: true });
      scrollIntoView.mockReset();
      reducedMotion = false;
      Element.prototype.scrollIntoView = scrollIntoView;
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)' && reducedMotion,
        media: query,
      }));
    });

    afterEach(() => {
      Element.prototype.scrollIntoView = originalScrollIntoView;
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });

    const names = () =>
      vi
        .mocked(addTicketAttachments)
        .mock.calls.map(([form]) =>
          form.getAll('files').map((file) => (file as File).name),
        );

    it('adds the files pasted anywhere in the drawer', async () => {
      renderWithTheme(<Harness />);

      const prevented = paste(screen.getByText('Description'), {
        files: [new File(['a'], 'a.txt'), new File(['b'], 'b.pdf')],
      });

      expect(prevented).toBe(true);
      await vi.waitFor(() => expect(addTicketAttachments).toHaveBeenCalled());
      expect(names()).toEqual([['a.txt', 'b.pdf']]);
      const [form] = vi.mocked(addTicketAttachments).mock.calls[0];
      expect(form.get('number')).toBe('4');
    });

    it('adds the files pasted while nothing in the drawer has focus', async () => {
      renderWithTheme(<Harness />);

      expect(paste(document.body, { files: [new File(['a'], 'a.txt')] })).toBe(
        true,
      );

      await vi.waitFor(() => expect(names()).toEqual([['a.txt']]));
    });

    it('leaves a paste in a text field to the browser', () => {
      renderWithTheme(<Harness />);
      const file = new File(['a'], 'a.txt');

      for (const field of [
        screen.getByRole('textbox', { name: 'Comment' }),
        screen.getByRole('textbox', { name: 'Title' }),
        screen.getByText('Editable'),
      ]) {
        expect(paste(field, { files: [file], text: 'a' })).toBe(false);
      }

      expect(addTicketAttachments).not.toHaveBeenCalled();
    });

    it('leaves a paste to the browser while a nested dialog is open', async () => {
      renderWithTheme(<Harness />);
      await userEvent.click(
        screen.getByRole('button', { name: 'Open nested' }),
      );

      const files = [new File(['a'], 'a.txt')];
      expect(paste(screen.getByText('Inside nested'), { files })).toBe(false);
      expect(paste(document.body, { files })).toBe(false);

      expect(addTicketAttachments).not.toHaveBeenCalled();
    });

    it('leaves a paste outside the drawer to the browser', () => {
      renderWithTheme(<Harness />);

      expect(
        paste(screen.getByText('Outside'), {
          files: [new File(['a'], 'a.txt')],
        }),
      ).toBe(false);

      expect(addTicketAttachments).not.toHaveBeenCalled();
    });

    it('leaves a paste with no files to the browser', () => {
      renderWithTheme(<Harness />);

      expect(paste(screen.getByText('Description'), { text: 'hello' })).toBe(
        false,
      );

      expect(addTicketAttachments).not.toHaveBeenCalled();
      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('attaches the files and ignores text pasted with them', async () => {
      renderWithTheme(<Harness />);

      expect(
        paste(screen.getByText('Description'), {
          files: [new File(['a'], 'a.txt')],
          text: 'a.txt',
        }),
      ).toBe(true);

      await vi.waitFor(() => expect(names()).toEqual([['a.txt']]));
    });

    it('names a pasted screenshot from the local time and keeps other names', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 9, 31, 21, 4, 5));
      renderWithTheme(<Harness />);

      paste(screen.getByText('Description'), {
        files: [
          new File(['a'], 'image.png', { type: 'image/png' }),
          new File(['b'], 'notes.txt', { type: 'text/plain' }),
        ],
      });

      await vi.waitFor(() =>
        expect(names()).toEqual([
          ['Pasted image 2026-10-31 21.04.05.png', 'notes.txt'],
        ]),
      );
    });

    it('scrolls the section into view smoothly after a paste', () => {
      renderWithTheme(<Harness />);

      paste(screen.getByText('Description'), {
        files: [new File(['a'], 'a.txt')],
      });

      expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ behavior: 'smooth' }),
      );
      expect(scrollIntoView.mock.contexts[0]).toBe(
        screen.getByRole('region', { name: 'Attachments' }),
      );
    });

    it('scrolls instantly when the User prefers reduced motion', () => {
      reducedMotion = true;
      renderWithTheme(<Harness />);

      paste(screen.getByText('Description'), {
        files: [new File(['a'], 'a.txt')],
      });

      expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ behavior: 'instant' }),
      );
    });
  });
});
