import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../../test/render';
import type { Attachment } from '../../tickets/attachments';
import { TicketAttachments } from './ticket-attachments';

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
  it('says there are no Attachments', () => {
    renderWithTheme(<TicketAttachments attachments={[]} />);

    expect(
      screen.getByRole('heading', { name: 'Attachments' }),
    ).toBeInTheDocument();
    expect(screen.getByText('No Attachments')).toBeInTheDocument();
  });

  it('shows a previewable image as a thumbnail that opens it in a new tab', () => {
    renderWithTheme(
      <TicketAttachments attachments={[attachment({ id: 7 })]} />,
    );

    const link = screen.getByRole('link', { name: /shot\.png/ });
    expect(link).toHaveAttribute('href', '/attachment/7');
    expect(link).toHaveAttribute('target', '_blank');
    expect(within(link).getByRole('img', { name: 'shot.png' })).toHaveAttribute(
      'src',
      '/attachment/7',
    );
  });

  it('shows any other file, SVG included, as a name and size link', () => {
    renderWithTheme(
      <TicketAttachments
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
  });

  it('shows who added each Attachment and when', () => {
    renderWithTheme(
      <TicketAttachments
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
});
