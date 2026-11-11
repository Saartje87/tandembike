import { asc, eq } from 'drizzle-orm';

import { ticketAttachments, ticketComments } from '../db/schema';
import { type ActivityEntry, activityOf } from './activity';
import {
  type AddAttachmentInput,
  type Attachment,
  attachmentColumns,
  checkAttachmentCount,
  checkedAttachment,
  type StoredAttachment,
} from './attachments';
import { NotAllowedError, NotFoundError } from './errors';
import { maxCommentLength, throwFieldErrors } from './rules';
import type { TicketRowContext } from './ticket-row-context';
import type {
  AddCommentInput,
  Comment,
  CommentAuthor,
  EditCommentInput,
  RemoveAttachmentInput,
  RemoveCommentInput,
} from './tickets';

/** A comment body trimmed, or a `ValidationError` if it is empty or too long. */
function checkedCommentBody(rawBody: string): string {
  const body = rawBody.trim();
  throwFieldErrors({
    body:
      body === ''
        ? 'Enter a comment.'
        : body.length > maxCommentLength
          ? `Keep the comment to ${maxCommentLength.toLocaleString('en-US')} characters or fewer.`
          : undefined,
  });
  return body;
}

const commentColumns = {
  id: ticketComments.id,
  ticketNumber: ticketComments.ticketNumber,
  author: ticketComments.author,
  body: ticketComments.body,
  createdAt: ticketComments.createdAt,
  editedAt: ticketComments.editedAt,
};

/**
 * The discussion area of the Tickets module: a Ticket's comments, its
 * Activity and its Attachments (ADR 0018).
 */
export function createDiscussion(ctx: TicketRowContext) {
  const {
    db,
    changes,
    getTicket,
    recordActivity,
    touchTicket,
    checkTicketProjectWritable,
  } = ctx;

  /**
   * Comment `id`, if `by` may edit or remove it: the User may change any
   * comment, an Agent only an Agent's.
   */
  function editableComment(id: number, by: CommentAuthor) {
    const comment = db
      .select({
        ticketNumber: ticketComments.ticketNumber,
        author: ticketComments.author,
      })
      .from(ticketComments)
      .where(eq(ticketComments.id, id))
      .get();
    if (!comment) {
      throw new NotFoundError(`There is no comment ${id}.`);
    }
    if (by === 'agent' && comment.author !== 'agent') {
      throw new NotAllowedError(
        `Comment ${id} was written by the User. Agents can only edit or remove comments written by an Agent.`,
      );
    }
    return comment;
  }

  return {
    /** The comments on Ticket `number`, oldest first. */
    listComments(number: number): Comment[] {
      getTicket(number);
      return db
        .select(commentColumns)
        .from(ticketComments)
        .where(eq(ticketComments.ticketNumber, number))
        .orderBy(asc(ticketComments.id))
        .all();
    },

    /**
     * Ticket `number`'s Activity, oldest first, whether or not it is
     * archived.
     */
    listActivity(number: number): ActivityEntry[] {
      getTicket(number);
      return activityOf(db, number);
    },

    /** Adds a Markdown comment by `author` to Ticket `number`. */
    addComment(number: number, input: AddCommentInput): Comment {
      const body = checkedCommentBody(input.body);
      getTicket(number);
      checkTicketProjectWritable(number);
      const comment = db
        .insert(ticketComments)
        .values({
          ticketNumber: number,
          author: input.author,
          body,
          createdAt: new Date(),
        })
        .returning(commentColumns)
        .get();
      changes.publish({ type: 'ticket', number });
      return comment;
    },

    /**
     * Replaces comment `id`'s body by the rules for adding one and sets its
     * edited time; the author and created time stay.
     */
    editComment(id: number, input: EditCommentInput): Comment {
      const body = checkedCommentBody(input.body);
      const { ticketNumber } = editableComment(id, input.by);
      checkTicketProjectWritable(ticketNumber);
      const comment = db
        .update(ticketComments)
        .set({ body, editedAt: new Date() })
        .where(eq(ticketComments.id, id))
        .returning(commentColumns)
        .get();
      changes.publish({ type: 'ticket', number: ticketNumber });
      return comment;
    },

    /**
     * Deletes comment `id` for good (ADR 0006), by the same rule for who
     * may as editing it.
     */
    removeComment(id: number, { by }: RemoveCommentInput): void {
      const { ticketNumber } = editableComment(id, by);
      checkTicketProjectWritable(ticketNumber);
      db.delete(ticketComments).where(eq(ticketComments.id, id)).run();
      changes.publish({ type: 'ticket', number: ticketNumber });
    },

    /**
     * Adds a file to Ticket `number` (ADR 0018) and returns its metadata. The
     * name is trimmed; the media type comes from the input, else the name's
     * extension. Recorded as Activity in the same transaction.
     */
    addAttachment(number: number, input: AddAttachmentInput): Attachment {
      const { name, mediaType } = checkedAttachment(input);
      const attachment = db.transaction(() => {
        checkTicketProjectWritable(number);
        touchTicket(number);
        checkAttachmentCount(db, number);
        const added = db
          .insert(ticketAttachments)
          .values({
            ticketNumber: number,
            name,
            mediaType,
            size: input.content.byteLength,
            author: input.author,
            content: Buffer.from(input.content),
            createdAt: new Date(),
          })
          .returning(attachmentColumns)
          .get();
        recordActivity(number, [{ type: 'attachmentAdded', name }]);
        return added;
      });
      changes.publish({ type: 'ticket', number });
      return attachment;
    },

    /** Attachment `id` with its metadata and content. */
    getAttachment(id: number): StoredAttachment {
      const attachment = db
        .select({ ...attachmentColumns, content: ticketAttachments.content })
        .from(ticketAttachments)
        .where(eq(ticketAttachments.id, id))
        .get();
      if (!attachment) {
        throw new NotFoundError(`There is no Attachment ${id}.`);
      }
      return attachment;
    },

    /**
     * Deletes Attachment `id` for good (ADR 0018), by the Comment rule: the
     * User may remove any, an Agent only one an Agent added. Recorded as
     * Activity naming the file, in the same transaction.
     */
    removeAttachment(id: number, { by }: RemoveAttachmentInput): void {
      const attachment = db
        .select({
          ticketNumber: ticketAttachments.ticketNumber,
          name: ticketAttachments.name,
          author: ticketAttachments.author,
        })
        .from(ticketAttachments)
        .where(eq(ticketAttachments.id, id))
        .get();
      if (!attachment) {
        throw new NotFoundError(`There is no Attachment ${id}.`);
      }
      if (by === 'agent' && attachment.author !== 'agent') {
        throw new NotAllowedError(
          `Attachment ${id} was added by the User. Agents can only remove Attachments added by an Agent.`,
        );
      }
      db.transaction(() => {
        checkTicketProjectWritable(attachment.ticketNumber);
        touchTicket(attachment.ticketNumber);
        db.delete(ticketAttachments).where(eq(ticketAttachments.id, id)).run();
        recordActivity(attachment.ticketNumber, [
          { type: 'attachmentRemoved', name: attachment.name },
        ]);
      });
      changes.publish({ type: 'ticket', number: attachment.ticketNumber });
    },
  };
}
