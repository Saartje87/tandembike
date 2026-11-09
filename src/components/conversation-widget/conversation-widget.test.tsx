import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { answerConversationWidget } from '../../app/conversations/actions';
import type { ChoiceWidget, WidgetEntry } from '../../conversations/widget';
import { renderWithTheme } from '../../test/render';
import { ConversationWidget } from './conversation-widget';

vi.mock('../../app/conversations/actions', () => ({
  answerConversationWidget: vi.fn(),
}));

const choice: ChoiceWidget = {
  kind: 'choice',
  prompt: 'Which library?',
  options: [
    { label: 'Alpha', description: 'The first' },
    { label: 'Beta', description: 'The second' },
    { label: 'Gamma' },
  ],
  multiSelect: false,
  recommended: ['Beta'],
};

const renderWidget = (entry: Partial<WidgetEntry> = {}) =>
  renderWithTheme(
    <ConversationWidget
      conversationId={3}
      entryId={7}
      entry={{ widget: choice, answer: null, expired: false, ...entry }}
    />,
  );

const sent = () => vi.mocked(answerConversationWidget).mock.calls.at(-1)?.[0];

beforeEach(() => {
  vi.mocked(answerConversationWidget)
    .mockReset()
    .mockResolvedValue({ ok: true } as never);
});

describe('A choice Widget', () => {
  it('preselects and marks the recommended choice, so agreeing is one click', async () => {
    renderWidget();

    expect(screen.getByRole('radio', { name: 'Beta' })).toBeChecked();
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    expect(screen.getByText('The first')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Send answer' }));

    expect(sent()).toEqual({
      conversationId: 3,
      entryId: 7,
      answer: { selected: ['Beta'] },
    });
  });

  it('sends another single choice, picked by keyboard', async () => {
    renderWidget({ widget: { ...choice, recommended: [] } });
    const send = screen.getByRole('button', { name: 'Send answer' });
    expect(send).toBeDisabled();

    screen.getByRole('radio', { name: 'Alpha' }).focus();
    await userEvent.keyboard(' ');
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.click(send);

    expect(sent()?.answer).toEqual({ selected: ['Beta'] });
  });

  it('sends several choices of a multi select', async () => {
    renderWidget({
      widget: { ...choice, multiSelect: true, recommended: ['Alpha'] },
    });
    expect(screen.getByRole('checkbox', { name: 'Alpha' })).toBeChecked();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Gamma' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send answer' }));

    expect(sent()?.answer).toEqual({ selected: ['Alpha', 'Gamma'] });
  });

  it('sends Other with its text instead of the options', async () => {
    renderWidget();

    await userEvent.click(screen.getByRole('button', { name: 'Other…' }));
    expect(screen.queryByRole('radio', { name: 'Beta' })).toBeNull();
    const send = screen.getByRole('button', { name: 'Send answer' });
    expect(send).toBeDisabled();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Other answer to Which library?' }),
      'Delta',
    );
    await userEvent.click(send);

    expect(sent()?.answer).toEqual({ other: 'Delta' });
  });

  it('sends Skip', async () => {
    renderWidget();

    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));

    expect(sent()?.answer).toEqual({ skipped: true });
  });

  it('shows a refusal and keeps the choice', async () => {
    vi.mocked(answerConversationWidget).mockResolvedValue({
      ok: false,
      error: 'This Widget is no longer waiting.',
    });
    renderWidget();

    await userEvent.click(screen.getByRole('radio', { name: 'Gamma' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send answer' }));

    expect(
      await screen.findByText('This Widget is no longer waiting.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Gamma' })).toBeChecked();
  });
});

describe('A settled Widget', () => {
  it.each([
    [{ selected: ['Alpha', 'Gamma'] }, ['Alpha', 'Gamma']],
    [{ other: 'Delta' }, ['Other: Delta']],
    [{ skipped: true as const }, ['Skipped']],
  ])('shows the answer %j read-only', (answer, lines) => {
    renderWidget({ answer });

    expect(screen.getByText('Which library?')).toBeInTheDocument();
    for (const line of lines) {
      expect(screen.getByText(line)).toBeInTheDocument();
    }
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows an expired one as expired', () => {
    renderWidget({ expired: true });

    expect(screen.getByText(/Expired/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
