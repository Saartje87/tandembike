// @vitest-environment node

import { expect, it } from 'vitest';

import { connectMcpClient } from '../test/mcp';
import { createTestTickets } from '../test/tickets';
import { instructions } from './mcp-server';

it('lists the twenty-two workflow tools, their descriptions and schemas, and the instructions', async () => {
  const client = await connectMcpClient(createTestTickets());

  const { tools } = await client.listTools();

  expect(tools).toHaveLength(22);
  await expect(
    JSON.stringify(
      [...tools].sort((a, b) => a.name.localeCompare(b.name)),
      null,
      2,
    ),
  ).toMatchFileSnapshot('./__snapshots__/tool-list.txt');
  await expect(instructions).toMatchFileSnapshot(
    './__snapshots__/instructions.txt',
  );
  await client.close();
});
