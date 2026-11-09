// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { connectMcpClient, resultJson, resultText } from '../test/mcp';
import { createTestSpars } from '../test/spars';

async function sparRun() {
  const world = createTestSpars();
  const spar = await world.spars.startSpar({ projectId: world.project.id });
  const client = await connectMcpClient(world.tickets, {
    runId: String(spar.id),
    spars: world.spars,
  });
  return { ...world, spar, client };
}

describe('The Spar tools', () => {
  it("get_canvas reads the run's own Canvas", async () => {
    const { client, spars, spar } = await sparRun();

    const canvas = resultJson(
      await client.callTool({ name: 'get_canvas', arguments: {} }),
    );

    expect(canvas).toEqual(spars.getCanvas(spar.id));
    await client.close();
  });

  it('edit_canvas applies a batch as the Agent and returns the Canvas', async () => {
    const { client, spars, spar } = await sparRun();
    const [ideas] = spars.getCanvas(spar.id).columns;

    const canvas = resultJson(
      await client.callTool({
        name: 'edit_canvas',
        arguments: {
          ops: [
            { op: 'addColumn', title: 'Risks' },
            { op: 'addSticky', columnId: ideas.id, title: 'Cache it' },
          ],
        },
      }),
    ) as { columns: { title: string; stickies: { author: string }[] }[] };

    expect(canvas.columns.map(({ title }) => title)).toContain('Risks');
    expect(canvas.columns[0].stickies[0]).toMatchObject({
      title: 'Cache it',
      author: 'agent',
    });
    expect(spars.canvasDiff(spar.id)).toEqual([]);
    await client.close();
  });

  it('edit_canvas changes nothing when one op is refused', async () => {
    const { client, spars, spar } = await sparRun();
    const before = spars.getCanvas(spar.id);
    const [ideas] = before.columns;

    const result = await client.callTool({
      name: 'edit_canvas',
      arguments: {
        ops: [
          { op: 'addSticky', columnId: ideas.id, title: 'A' },
          { op: 'removeColumn', columnId: ideas.id },
        ],
      },
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toMatch(/still holds/);
    expect(spars.getCanvas(spar.id)).toEqual(before);
    await client.close();
  });

  it('are refused outside a Spar run', async () => {
    const world = createTestSpars();
    const conversation = await world.conversations.start({
      startedBy: 'user',
      projectId: world.project.id,
      intent: 'ask',
      prompt: 'Hi',
    });
    for (const runId of [String(conversation.id), undefined]) {
      const client = await connectMcpClient(world.tickets, {
        ...(runId === undefined ? {} : { runId }),
        spars: world.spars,
      });
      const result = await client.callTool({
        name: 'get_canvas',
        arguments: {},
      });
      expect(result.isError).toBe(true);
      expect(resultText(result)).toBe('This tool works only in a Spar run.');
      await client.close();
    }
  });
});
