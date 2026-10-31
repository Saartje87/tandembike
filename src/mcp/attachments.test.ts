// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { connectMcpClient, resultJson, resultText } from '../test/mcp';
import { createTestTickets } from '../test/tickets';

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
});
