import { isPreviewable } from '../../tickets/attachment-preview';
import { NotFoundError } from '../../tickets/errors';
import type { Tickets } from '../../tickets/tickets';

/** A `Content-Disposition` that downloads a file named `name`. */
function downloadDisposition(name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * The response for Attachment `id`: its bytes with the stored media type and
 * `nosniff`, shown inline when it is a previewable image and downloaded
 * under its name otherwise (SVG included, as it may hold script), or a 404
 * when there is no such Attachment.
 */
export function attachmentResponse(
  tickets: Pick<Tickets, 'getAttachment'>,
  id: number,
): Response {
  let attachment: ReturnType<Tickets['getAttachment']>;
  try {
    attachment = tickets.getAttachment(id);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return new Response('Not found', { status: 404 });
    }
    throw error;
  }
  return new Response(new Uint8Array(attachment.content), {
    headers: {
      'Content-Type': attachment.mediaType,
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': isPreviewable(attachment.mediaType)
        ? 'inline'
        : downloadDisposition(attachment.name),
    },
  });
}
