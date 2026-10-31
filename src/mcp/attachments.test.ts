// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { connectMcpClient, resultJson, resultText } from '../test/mcp';
import { createTestTickets } from '../test/tickets';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function ticketsWithOne() {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  const ticket = tickets.createTicket({
    projectId: project.id,
    title: 'Fix the header',
  });
  return { tickets, ticket };
}

const base64 = (text: string) => Buffer.from(text).toString('base64');
const bytes = (text: string) => new TextEncoder().encode(text);

describe('Attachment tools', () => {
  it('adds an Attachment from base64 content, authored by an Agent, and returns its metadata', async () => {
    const { tickets, ticket } = ticketsWithOne();
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'add_attachment',
      arguments: {
        number: ticket.number,
        name: 'notes.txt',
        content: base64('hello'),
      },
    });

    const [attachment] = tickets.getTicket(ticket.number).attachments;
    expect(attachment).toMatchObject({ author: 'agent', size: 5 });
    expect(resultJson(result)).toEqual({
      id: attachment.id,
      ticketNumber: ticket.number,
      name: 'notes.txt',
      mediaType: 'text/plain',
      size: 5,
      author: 'agent',
      createdAt: attachment.createdAt.toISOString(),
    });
    expect(
      new TextDecoder().decode(tickets.getAttachment(attachment.id).content),
    ).toBe('hello');
    await client.close();
  });

  it('takes the media type from the tool argument', async () => {
    const { tickets, ticket } = ticketsWithOne();
    const client = await connectMcpClient(tickets);

    await client.callTool({
      name: 'add_attachment',
      arguments: {
        number: ticket.number,
        name: 'blob',
        content: base64('x'),
        mediaType: 'image/png',
      },
    });

    expect(tickets.getTicket(ticket.number).attachments[0].mediaType).toBe(
      'image/png',
    );
    await client.close();
  });

  it('refuses invalid base64 and the rules of the module, with a reason', async () => {
    const { tickets, ticket } = ticketsWithOne();
    const client = await connectMcpClient(tickets);

    const badBase64 = await client.callTool({
      name: 'add_attachment',
      arguments: {
        number: ticket.number,
        name: 'a.txt',
        content: 'not*base64',
      },
    });
    const noName = await client.callTool({
      name: 'add_attachment',
      arguments: { number: ticket.number, name: '', content: base64('x') },
    });

    expect(badBase64.isError).toBe(true);
    expect(resultText(badBase64)).toMatch(/base64/);
    expect(noName.isError).toBe(true);
    expect(resultText(noName)).toBe('Enter a file name.');
    expect(tickets.getTicket(ticket.number).attachments).toEqual([]);
    await client.close();
  });

  it("lists Attachments' metadata in get_ticket, never the content", async () => {
    const { tickets, ticket } = ticketsWithOne();
    const attachment = tickets.addAttachment(ticket.number, {
      name: 'notes.txt',
      content: bytes('hello'),
      author: 'user',
    });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'get_ticket',
      arguments: { number: ticket.number },
    });

    expect(resultJson(result)).toMatchObject({
      attachments: [
        {
          id: attachment.id,
          name: 'notes.txt',
          mediaType: 'text/plain',
          size: 5,
          author: 'user',
          createdAt: attachment.createdAt.toISOString(),
        },
      ],
    });
    expect(resultText(result)).not.toMatch(/"content"/);
    await client.close();
  });

  it("returns an Attachment's metadata from get_attachment and refuses an unknown one", async () => {
    const { tickets, ticket } = ticketsWithOne();
    const attachment = tickets.addAttachment(ticket.number, {
      name: 'notes.txt',
      content: bytes('hello'),
      author: 'user',
    });
    const client = await connectMcpClient(tickets);

    const found = await client.callTool({
      name: 'get_attachment',
      arguments: { id: attachment.id },
    });
    const missing = await client.callTool({
      name: 'get_attachment',
      arguments: { id: 99 },
    });

    expect(resultJson(found)).toEqual({
      id: attachment.id,
      url: `http://localhost:3000/attachment/${attachment.id}`,
      ticketNumber: ticket.number,
      name: 'notes.txt',
      mediaType: 'text/plain',
      size: 5,
      author: 'user',
      createdAt: attachment.createdAt.toISOString(),
    });
    expect(missing.isError).toBe(true);
    expect(resultText(missing)).toBe('There is no Attachment 99.');
    await client.close();
  });

  it('shows the add in list_activity naming the file', async () => {
    const { tickets, ticket } = ticketsWithOne();
    const client = await connectMcpClient(tickets);
    await client.callTool({
      name: 'add_attachment',
      arguments: {
        number: ticket.number,
        name: 'notes.txt',
        content: base64('hello'),
      },
    });

    const result = await client.callTool({
      name: 'list_activity',
      arguments: { number: ticket.number },
    });

    const entries = resultJson(result) as { changes: unknown[] }[];
    expect(entries.at(-1)?.changes).toEqual([
      { type: 'attachmentAdded', name: 'notes.txt' },
    ]);
    await client.close();
  });

  it("removes an Agent's Attachment by id, refuses the User's, and shows it in list_activity", async () => {
    const { tickets, ticket } = ticketsWithOne();
    const mine = tickets.addAttachment(ticket.number, {
      name: 'mine.txt',
      content: bytes('a'),
      author: 'agent',
    });
    const theirs = tickets.addAttachment(ticket.number, {
      name: 'theirs.txt',
      content: bytes('b'),
      author: 'user',
    });
    const client = await connectMcpClient(tickets);

    const removed = await client.callTool({
      name: 'remove_attachment',
      arguments: { id: mine.id },
    });
    const refused = await client.callTool({
      name: 'remove_attachment',
      arguments: { id: theirs.id },
    });
    const missing = await client.callTool({
      name: 'remove_attachment',
      arguments: { id: 99 },
    });

    expect(resultJson(removed)).toEqual({ removed: mine.id });
    expect(refused.isError).toBe(true);
    expect(resultText(refused)).toMatch(/added by the User/);
    expect(missing.isError).toBe(true);
    expect(tickets.getTicket(ticket.number).attachments).toEqual([theirs]);
    const activity = await client.callTool({
      name: 'list_activity',
      arguments: { number: ticket.number },
    });
    const entries = resultJson(activity) as { changes: unknown[] }[];
    expect(entries.at(-1)?.changes).toEqual([
      { type: 'attachmentRemoved', name: 'mine.txt' },
    ]);
    await client.close();
  });

  describe('from a local path', () => {
    const tempFile = (name: string, content: string | Uint8Array) => {
      const dir = mkdtempSync(join(tmpdir(), 'attachment-'));
      const path = join(dir, name);
      writeFileSync(path, content);
      return { dir, path };
    };

    it('reads the file on the server and names it by its base name', async () => {
      const { tickets, ticket } = ticketsWithOne();
      const client = await connectMcpClient(tickets);
      const { path } = tempFile('shot.png', bytes('png-bytes'));

      const result = await client.callTool({
        name: 'add_attachment',
        arguments: { number: ticket.number, path },
      });

      expect(resultJson(result)).toMatchObject({
        name: 'shot.png',
        mediaType: 'image/png',
        size: 9,
        author: 'agent',
      });
      const [attachment] = tickets.getTicket(ticket.number).attachments;
      expect(
        new TextDecoder().decode(tickets.getAttachment(attachment.id).content),
      ).toBe('png-bytes');
      await client.close();
    });

    it('takes a given name over the base name', async () => {
      const { tickets, ticket } = ticketsWithOne();
      const client = await connectMcpClient(tickets);
      const { path } = tempFile('tmp123', bytes('x'));

      await client.callTool({
        name: 'add_attachment',
        arguments: { number: ticket.number, path, name: 'report.pdf' },
      });

      expect(tickets.getTicket(ticket.number).attachments[0]).toMatchObject({
        name: 'report.pdf',
        mediaType: 'application/pdf',
      });
      await client.close();
    });

    it('refuses both or neither of path and content, with a reason', async () => {
      const { tickets, ticket } = ticketsWithOne();
      const client = await connectMcpClient(tickets);
      const { path } = tempFile('a.txt', 'x');

      const both = await client.callTool({
        name: 'add_attachment',
        arguments: {
          number: ticket.number,
          path,
          name: 'a.txt',
          content: base64('x'),
        },
      });
      const neither = await client.callTool({
        name: 'add_attachment',
        arguments: { number: ticket.number, name: 'a.txt' },
      });

      expect(both.isError).toBe(true);
      expect(resultText(both)).toMatch(/either.*path.*content/i);
      expect(neither.isError).toBe(true);
      expect(resultText(neither)).toMatch(/either.*path.*content/i);
      expect(tickets.getTicket(ticket.number).attachments).toEqual([]);
      await client.close();
    });

    it('refuses content without a name', async () => {
      const { tickets, ticket } = ticketsWithOne();
      const client = await connectMcpClient(tickets);

      const result = await client.callTool({
        name: 'add_attachment',
        arguments: { number: ticket.number, content: base64('x') },
      });

      expect(result.isError).toBe(true);
      expect(resultText(result)).toBe('Enter a file name.');
      await client.close();
    });

    it('refuses a relative path, a missing path and a path that is not a file', async () => {
      const { tickets, ticket } = ticketsWithOne();
      const client = await connectMcpClient(tickets);
      const { dir } = tempFile('a.txt', 'x');
      const add = (path: string) =>
        client.callTool({
          name: 'add_attachment',
          arguments: { number: ticket.number, path },
        });
      mkdirSync(join(dir, 'folder'));

      const relative = await add('a.txt');
      const missing = await add(join(dir, 'missing.txt'));
      const folder = await add(join(dir, 'folder'));

      expect(relative.isError).toBe(true);
      expect(resultText(relative)).toMatch(/absolute/);
      expect(missing.isError).toBe(true);
      expect(resultText(missing)).toMatch(/no file/i);
      expect(folder.isError).toBe(true);
      expect(resultText(folder)).toMatch(/not a file/i);
      expect(tickets.getTicket(ticket.number).attachments).toEqual([]);
      await client.close();
    });
  });

  describe('get_attachment content', () => {
    const add = (
      tickets: ReturnType<typeof createTestTickets>,
      number: number,
      name: string,
      content: Uint8Array,
      mediaType?: string,
    ) =>
      tickets.addAttachment(number, {
        name,
        content,
        mediaType,
        author: 'user',
      });

    it.each([
      ['shot.png', 'image/png'],
      ['shot.jpg', 'image/jpeg'],
      ['shot.gif', 'image/gif'],
      ['shot.webp', 'image/webp'],
    ])(
      'returns %s as image content after the metadata',
      async (name, mimeType) => {
        const { tickets, ticket } = ticketsWithOne();
        const attachment = add(tickets, ticket.number, name, bytes('pixels'));
        const client = await connectMcpClient(tickets);

        const result = await client.callTool({
          name: 'get_attachment',
          arguments: { id: attachment.id },
        });

        expect(resultJson(result)).toMatchObject({
          id: attachment.id,
          mediaType: mimeType,
        });
        expect(result.content).toEqual([
          expect.objectContaining({ type: 'text' }),
          { type: 'image', data: base64('pixels'), mimeType },
        ]);
        await client.close();
      },
    );

    it.each([
      ['notes.txt', undefined],
      ['data.json', undefined],
      ['feed.blob', 'application/ld+json'],
      ['page.html', undefined],
    ])('returns %s as text content', async (name, mediaType) => {
      const { tickets, ticket } = ticketsWithOne();
      const attachment = add(
        tickets,
        ticket.number,
        name,
        bytes('héllo'),
        mediaType,
      );
      const client = await connectMcpClient(tickets);

      const result = await client.callTool({
        name: 'get_attachment',
        arguments: { id: attachment.id },
      });

      expect(result.content).toEqual([
        expect.objectContaining({ type: 'text' }),
        { type: 'text', text: 'héllo' },
      ]);
      await client.close();
    });

    it('returns only metadata and the localhost URL for any other type', async () => {
      const { tickets, ticket } = ticketsWithOne();
      const attachment = add(
        tickets,
        ticket.number,
        'report.pdf',
        bytes('%PDF'),
      );
      const client = await connectMcpClient(tickets);

      const result = await client.callTool({
        name: 'get_attachment',
        arguments: { id: attachment.id },
      });

      expect(result.content).toHaveLength(1);
      expect(resultJson(result)).toMatchObject({
        id: attachment.id,
        mediaType: 'application/pdf',
        url: `http://localhost:3000/attachment/${attachment.id}`,
      });
      await client.close();
    });
  });
});
