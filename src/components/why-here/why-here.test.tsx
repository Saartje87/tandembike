// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type {
  AutopilotExplanation,
  TicketExplanation,
} from '../../autopilot/explanation';
import { renderWithTheme } from '../../test/render';
import { WhyHere } from './why-here';
import { type WhyHereInput, whyHereOf } from './why-here-of';

const running = { state: 'running' } as const;

const eligible = (place: number, fitsFreeSlots = true): TicketExplanation => ({
  number: 7,
  build: { eligible: true, place, fitsFreeSlots },
  triage: {
    eligible: false,
    reasons: [{ type: 'triaged', label: 'ready-for-agent' }],
  },
});

/** Renders the sentence for `input` and returns its text. */
function sentence(input: Partial<WhyHereInput>): string | null {
  const segments = whyHereOf({
    placement: { lane: 'Queued', section: null },
    hasLive: false,
    epicNumber: null,
    autopilot: running,
    autoTriage: running,
    entry: eligible(1),
    ...input,
  });
  if (segments === null) {
    return null;
  }
  const { container } = renderWithTheme(
    <WhyHere
      segments={segments}
      ticketHref={(number) => `/ticket/${number}`}
      conversationHref={(id) => `/project/1?ticket=7&conversation=${id}`}
    />,
  );
  return container.textContent;
}

const paused = (
  ...reasons: Extract<
    AutopilotExplanation['autopilot'],
    { state: 'paused' }
  >['reasons']
) => ({ state: 'paused', reasons }) as const;

describe('WhyHere', () => {
  it('says Autopilot starts a Queued Ticket next, or its place in line', () => {
    expect(sentence({})).toBe('Queued: Autopilot starts this next.');
    expect(sentence({ entry: eligible(3, false) })).toBe(
      'Queued: 3rd in line.',
    );
    expect(
      sentence({
        entry: eligible(2, false),
        autopilot: paused({ type: 'noFreeStartRunSlot', limit: 1 }),
      }),
    ).toBe('Queued: 2nd in line, once a run slot frees.');
  });

  it('says why Autopilot will not start an Eligible Ticket', () => {
    expect(
      sentence({
        autopilot: paused({ type: 'switchedOff' }, { type: 'noActiveCycle' }),
      }),
    ).toBe('Queued, but Autopilot is off, there is no Active Cycle.');
  });

  it('lists every reason a Queued Ticket waits, linking its Blockers and holding Conversation', () => {
    expect(
      sentence({
        autopilot: paused({ type: 'switchedOff' }),
        entry: {
          number: 7,
          build: {
            eligible: false,
            reasons: [
              { type: 'blocked', blockers: [12, 13] },
              { type: 'claimed' },
              { type: 'heldByConversation', conversationId: 4 },
            ],
          },
          triage: { eligible: false, reasons: [] },
        },
      }),
    ).toBe(
      'Queued, but waiting: blocked by T12, T13, claimed by another run, held by an open Start Conversation, Autopilot is off.',
    );
    expect(screen.getByRole('link', { name: 'T12' })).toHaveAttribute(
      'href',
      '/ticket/12',
    );
    expect(
      screen.getByRole('link', { name: 'an open Start Conversation' }),
    ).toHaveAttribute('href', '/project/1?ticket=7&conversation=4');
  });

  it("says an Epic's child runs with its Epic, and an Epic without children waits to be split", () => {
    expect(sentence({ epicNumber: 3 })).toBe(
      'Runs with its Epic T3: Autopilot starts the Epic, and its children run in that one run.',
    );
    expect(
      sentence({
        placement: { lane: 'Intake', section: null },
        entry: {
          number: 7,
          build: {
            eligible: false,
            reasons: [{ type: 'epicWithoutChildren' }],
          },
          triage: { eligible: true, place: 1, fitsFreeSlots: true },
        },
      }),
    ).toBe(
      'Waits for triage to split it: an Epic is queued once it has children.',
    );
  });

  it('says whether Auto-triage picks up an Intake Ticket, and why not', () => {
    const intake = (triage: TicketExplanation['triage']) => ({
      placement: { lane: 'Intake', section: null } as const,
      entry: {
        number: 7,
        build: { eligible: false, reasons: [{ type: 'notReady' }] },
        triage,
      } satisfies TicketExplanation,
    });
    expect(
      sentence(intake({ eligible: true, place: 1, fitsFreeSlots: true })),
    ).toBe('In Intake: needs triage. Auto-triage picks it up next.');
    expect(
      sentence({
        ...intake({ eligible: true, place: 1, fitsFreeSlots: false }),
        autoTriage: { state: 'paused', reasons: [{ type: 'switchedOff' }] },
      }),
    ).toBe('In Intake: needs triage. Auto-triage is off.');
    expect(
      sentence(intake({ eligible: false, reasons: [{ type: 'proposed' }] })),
    ).toBe(
      'In Intake: needs triage. Auto-triage leaves it: its triage proposal waits for your decision.',
    );
  });

  it('says Your work is left to the User', () => {
    expect(sentence({ placement: { lane: 'Your work', section: null } })).toBe(
      'Your work: Autopilot leaves it to you.',
    );
  });

  it('says an In progress Ticket is Running, needs action, is in Review or is Stalled', () => {
    const inProgress = (
      section: 'Running' | 'Action needed' | 'Review',
      hasLive = true,
    ) =>
      sentence({
        placement: { lane: 'In progress', section },
        hasLive,
        entry: null,
      });
    expect(inProgress('Running')).toBe(
      'Running: an Agent run is working on it.',
    );
    expect(inProgress('Review')).toBe(
      'In Review: its pull request waits for your review and Approve merge.',
    );
    expect(inProgress('Action needed')).toBe(
      'Action needed: its run waits for you, or ended without finishing.',
    );
    expect(inProgress('Action needed', false)).toMatch(/^Stalled: /);
  });

  it('says nothing for a Done Ticket', () => {
    expect(sentence({ placement: { lane: 'Done', section: null } })).toBe(null);
  });
});
