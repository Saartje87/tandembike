import { asc, count, eq, inArray } from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import { ticketAttachments } from '../db/schema';
import type { Actor } from './activity';
import { ValidationError } from './errors';
import { throwFieldErrors } from './rules';

export const maxAttachmentNameLength = 255;

/** The most bytes one Attachment may hold: 10 MB. */
export const maxAttachmentSize = 10 * 1024 * 1024;

export const maxAttachments = 50;

/** A file on a Ticket, without its content. */
export type Attachment = {
  id: number;
  ticketNumber: number;
  name: string;
  mediaType: string;
  /** In bytes. */
  size: number;
  author: Actor;
  createdAt: Date;
};

/** An Attachment with its bytes. */
export type StoredAttachment = Attachment & { content: Uint8Array };

export type AddAttachmentInput = {
  name: string;
  /** Inferred from the name's extension when missing or blank. */
  mediaType?: string;
  content: Uint8Array;
  /** Who added it: the UI writes `user`, MCP writes `agent`. */
  author: Actor;
};

export const attachmentColumns = {
  id: ticketAttachments.id,
  ticketNumber: ticketAttachments.ticketNumber,
  name: ticketAttachments.name,
  mediaType: ticketAttachments.mediaType,
  size: ticketAttachments.size,
  author: ticketAttachments.author,
  createdAt: ticketAttachments.createdAt,
};

const extensionMediaTypes: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  txt: 'text/plain',
  log: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  html: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  json: 'application/json',
  xml: 'application/xml',
  yaml: 'application/yaml',
  yml: 'application/yaml',
  zip: 'application/zip',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

/** A bare `type/subtype` of RFC 6838 restricted-name characters. */
const mediaTypePattern =
  /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/i;

const fallbackMediaType = 'application/octet-stream';

/** The media type for file `name` from its extension, else octet-stream. */
function inferMediaType(name: string): string {
  const dot = name.lastIndexOf('.');
  const extension = dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
  return extensionMediaTypes[extension] ?? fallbackMediaType;
}

/** The input checked and normalized, or a `ValidationError`. */
export function checkedAttachment({
  name: rawName,
  mediaType: rawMediaType,
  content,
}: Pick<AddAttachmentInput, 'name' | 'mediaType' | 'content'>) {
  const name = rawName.trim();
  throwFieldErrors({
    name:
      name === ''
        ? 'Enter a file name.'
        : /[\r\n]/.test(name)
          ? 'Keep the file name to one line.'
          : name.length > maxAttachmentNameLength
            ? `Keep the file name to ${maxAttachmentNameLength} characters or fewer.`
            : undefined,
    mediaType:
      rawMediaType?.trim() && !mediaTypePattern.test(rawMediaType.trim())
        ? 'Use a media type such as text/plain, without parameters or spaces.'
        : undefined,
    content:
      content.byteLength === 0
        ? 'The file is empty.'
        : content.byteLength > maxAttachmentSize
          ? 'Keep the file to 10 MB or smaller.'
          : undefined,
  });
  const given = rawMediaType?.trim().toLowerCase();
  return { name, mediaType: given ? given : inferMediaType(name) };
}

/** Refuses a Ticket that already has the most Attachments. */
export function checkAttachmentCount(db: DatabaseConnection, number: number) {
  const row = db
    .select({ total: count() })
    .from(ticketAttachments)
    .where(eq(ticketAttachments.ticketNumber, number))
    .get();
  if ((row?.total ?? 0) >= maxAttachments) {
    throw new ValidationError({
      attachments: `A Ticket can have at most ${maxAttachments} Attachments.`,
    });
  }
}

/** `rows` with each Ticket's Attachments in the order added, without content. */
export function withAttachments<Row extends { number: number }>(
  db: DatabaseConnection,
  rows: Row[],
): (Row & { attachments: Attachment[] })[] {
  const byNumber = new Map<number, Attachment[]>(
    rows.map((row) => [row.number, []]),
  );
  if (rows.length > 0) {
    const attachmentRows = db
      .select(attachmentColumns)
      .from(ticketAttachments)
      .where(inArray(ticketAttachments.ticketNumber, [...byNumber.keys()]))
      .orderBy(asc(ticketAttachments.id))
      .all();
    for (const attachment of attachmentRows) {
      byNumber.get(attachment.ticketNumber)?.push(attachment);
    }
  }
  return rows.map((row) => ({
    ...row,
    attachments: byNumber.get(row.number) ?? [],
  }));
}

/** Deletes Ticket `number`'s Attachments, for deleting the Ticket. */
export function deleteAttachments(db: DatabaseConnection, number: number) {
  db.delete(ticketAttachments)
    .where(eq(ticketAttachments.ticketNumber, number))
    .run();
}
