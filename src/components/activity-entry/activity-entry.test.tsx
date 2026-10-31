import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../../test/render';
import type { ActivityChange } from '../../tickets/activity-change';
import { ActivityEntry } from './activity-entry';

function renderEntry(
  changes: ActivityChange[],
  actor: 'user' | 'agent' = 'agent',
) {
  renderWithTheme(
    <ul>
      <ActivityEntry
        entry={{
          id: 1,
          ticketNumber: 4,
          actor,
          changes,
          createdAt: new Date('2026-03-01T09:00:00Z'),
        }}
      />
    </ul>,
  );
  return screen.getByRole('listitem');
}

describe('ActivityEntry', () => {
  it('shows who acted, every change, and when', () => {
    const item = renderEntry([
      { type: 'status', from: 'Todo', to: 'In progress' },
      { type: 'labelAdded', label: 'ready-for-agent' },
      { type: 'labelRemoved', label: 'needs-triage' },
      { type: 'title', from: 'Fix it', to: 'Fix the header' },
    ]);

    expect(item).toHaveTextContent(
      'Agent changed the Status from Todo to In progress, added the label ready-for-agent, removed the label needs-triage, renamed it from “Fix it” to “Fix the header”',
    );
    expect(screen.getByRole('time')).toHaveAttribute(
      'datetime',
      '2026-03-01T09:00:00.000Z',
    );
  });

  it.each<[ActivityChange, string]>([
    [{ type: 'created' }, 'created this Ticket'],
    [
      { type: 'externalReferenceAdded', reference: '#55' },
      'added the External reference #55',
    ],
    [
      { type: 'attachmentAdded', name: 'screenshot.png' },
      'attached screenshot.png',
    ],
    [
      { type: 'attachmentRemoved', name: 'screenshot.png' },
      'removed the attachment screenshot.png',
    ],
    [
      { type: 'externalReferenceRemoved', reference: 'ABC-33' },
      'removed the External reference ABC-33',
    ],
    [
      {
        type: 'project',
        from: { id: 1, name: 'Website' },
        to: { id: 2, name: 'Shop' },
      },
      'moved it from Website to Shop',
    ],
    [{ type: 'description' }, 'edited the description'],
    [
      { type: 'color', from: 'red', to: 'blue' },
      'changed the colour from red to blue',
    ],
    [{ type: 'origin', from: null, to: 5 }, 'set the Origin to T5'],
    [{ type: 'origin', from: 5, to: null }, 'cleared the Origin T5'],
    [{ type: 'origin', from: 5, to: 6 }, 'changed the Origin from T5 to T6'],
    [{ type: 'blockedByAdded', number: 7 }, 'added Blocker T7'],
    [{ type: 'blockedByRemoved', number: 7 }, 'removed Blocker T7'],
    [{ type: 'blocksAdded', number: 12 }, 'made it block T12'],
    [{ type: 'blocksRemoved', number: 12 }, 'stopped it blocking T12'],
    [{ type: 'archived' }, 'archived it'],
    [{ type: 'restored' }, 'restored it'],
    [
      { type: 'claimTaken', agentRunId: 'run-1', agentName: 'Claude' },
      'claimed it for Claude (run-1)',
    ],
    [
      { type: 'claimReleased', agentRunId: 'run-1', agentName: null },
      'released the Claim of Agent run run-1',
    ],
    [
      { type: 'claimCleared', agentRunId: 'run-1', agentName: 'Claude' },
      'cleared the Claim of Claude (run-1)',
    ],
    [{ type: 'criterionChecked', text: 'It works' }, 'checked “It works”'],
    [{ type: 'criterionUnchecked', text: 'It works' }, 'unchecked “It works”'],
    [{ type: 'criteriaEdited' }, 'edited the acceptance criteria'],
  ])('describes %o', (change, text) => {
    const item = renderEntry([change], 'user');

    expect(item).toHaveTextContent(`User ${text}`);
  });
});
