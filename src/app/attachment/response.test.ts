// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createTestTickets } from '../../test/tickets';
import { attachmentResponse } from './response';

function ticketsWithAttachment(name: string, mediaType: string) {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  const ticket = tickets.createTicket({
    projectId: project.id,
    title: 'Fix the header',
  });
  const attachment = tickets.addAttachment(ticket.number, {
    name,
    mediaType,
    content: new TextEncoder().encode('content'),
    author: 'user',
  });
  return { tickets, id: attachment.id };
}

describe('attachmentResponse', () => {
  it.each(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])(
    'serves %s inline with its stored media type',
    async (mediaType) => {
      const { tickets, id } = ticketsWithAttachment('shot', mediaType);

      const response = attachmentResponse(tickets, id);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe(mediaType);
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('Content-Disposition')).toBe('inline');
      expect(await response.text()).toBe('content');
    },
  );

  it('serves an SVG as a download, never inline', () => {
    const { tickets, id } = ticketsWithAttachment('logo.svg', 'image/svg+xml');

    const response = attachmentResponse(tickets, id);

    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="logo.svg"; filename*=UTF-8\'\'logo.svg',
    );
  });

  it('serves a PDF as a download with an encoded file name', () => {
    const { tickets, id } = ticketsWithAttachment(
      'Q3 "report" é.pdf',
      'application/pdf',
    );

    const response = attachmentResponse(tickets, id);

    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="Q3 _report_ _.pdf"; filename*=UTF-8\'\'Q3%20%22report%22%20%C3%A9.pdf',
    );
  });

  it('answers 404 for an unknown id', () => {
    const { tickets } = ticketsWithAttachment('a.png', 'image/png');

    expect(attachmentResponse(tickets, 999).status).toBe(404);
  });
});
