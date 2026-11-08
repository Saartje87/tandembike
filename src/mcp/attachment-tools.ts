import { z } from 'zod';

import { isPreviewable, isTextMediaType } from '../tickets/attachment-preview';
import { ValidationError } from '../tickets/errors';
import {
  attachmentId,
  bytesOfContent,
  errorResult,
  jsonResult,
  readLocalFile,
  respond,
  type ToolContext,
  ticketNumber,
  withUrl,
} from './tool-shared';

export const registerAttachmentTools = ({
  tickets,
  origin,
  registerTool,
}: ToolContext): void => {
  registerTool(
    'add_attachment',
    {
      title: 'Add attachment',
      description:
        "Attach a file to a Ticket or Epic, added by you as an Agent, and return its metadata (id, ticketNumber, name, mediaType, size, author, createdAt). Give exactly one of path or content. path is an absolute local file path that the app reads on the machine running it, so a saved screenshot never passes through your context; name defaults to the file's base name. content is the file as base64 and needs a name. At most 10 MB per file and 50 Attachments per Ticket. An Attachment cannot be renamed or replaced. mediaType defaults from the name's extension, else application/octet-stream.",
      inputSchema: {
        number: ticketNumber,
        name: z
          .string()
          .optional()
          .describe(
            'The file name: one line of at most 255 characters. It is trimmed and may not be empty. Required with content; defaults to the base name of path.',
          ),
        path: z
          .string()
          .optional()
          .describe(
            'The absolute path of a file on the machine running the app, which the app reads. Give this or content.',
          ),
        content: z
          .string()
          .optional()
          .describe("The file's bytes as standard base64. Give this or path."),
        mediaType: z
          .string()
          .optional()
          .describe(
            'The media type, such as image/png. Inferred from the name when left out.',
          ),
      },
    },
    ({ number, name, path, content, mediaType }) =>
      respond(() => {
        if ((path === undefined) === (content === undefined)) {
          throw new ValidationError({
            path: 'Give either path or content, not both and not neither.',
          });
        }
        const file =
          path === undefined
            ? { name: name ?? '', bytes: bytesOfContent(content ?? '') }
            : readLocalFile(path, name);
        return tickets.addAttachment(number, {
          name: file.name,
          mediaType,
          content: file.bytes,
          author: 'agent',
        });
      }),
  );

  registerTool(
    'get_attachment',
    {
      title: 'Get attachment',
      description:
        'Get an Attachment by its id, as returned by get_ticket or add_attachment. The first content is its metadata (id, ticketNumber, name, mediaType, size, author, createdAt, url) as JSON. A PNG, JPEG, GIF or WebP follows as image content you can look at, and a text type (text/*, JSON, XML, YAML, JavaScript) as text. Any other type is metadata only; its url is where the app serves it on localhost.',
      inputSchema: { id: attachmentId },
      annotations: { readOnlyHint: true },
    },
    ({ id }) => {
      try {
        const { content, ...attachment } = tickets.getAttachment(id);
        const metadata = jsonResult(withUrl(attachment, origin));
        if (isPreviewable(attachment.mediaType)) {
          return {
            content: [
              ...metadata.content,
              {
                type: 'image',
                data: Buffer.from(content).toString('base64'),
                mimeType: attachment.mediaType,
              },
            ],
          };
        }
        if (isTextMediaType(attachment.mediaType)) {
          return {
            content: [
              ...metadata.content,
              { type: 'text', text: new TextDecoder().decode(content) },
            ],
          };
        }
        return metadata;
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  registerTool(
    'remove_attachment',
    {
      title: 'Remove attachment',
      description:
        "Delete an Attachment permanently by its id; it cannot be restored. Agents can only remove Attachments added by an Agent, not the User's.",
      inputSchema: { id: attachmentId },
      annotations: { destructiveHint: true },
    },
    ({ id }) =>
      respond(() => {
        tickets.removeAttachment(id, { by: 'agent' });
        return { removed: id };
      }),
  );
};
