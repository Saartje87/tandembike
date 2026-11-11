// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { type FC, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadAgentChoices } from '../../app/conversations/actions';
import { renderWithTheme } from '../../test/render';
import type { AgentKind } from '../../tickets/agent-kind';
import { AgentPicker } from './agent-picker';

vi.mock('../../app/conversations/actions', () => ({
  loadAgentChoices: vi.fn(),
}));

const bothCanRun = {
  ok: true as const,
  choices: {
    defaultKind: 'copilot' as const,
    kinds: [
      {
        kind: 'claude-code' as const,
        label: 'Claude Code',
        available: true as const,
      },
      { kind: 'copilot' as const, label: 'Copilot', available: true as const },
    ],
  },
};

/** The picker with its value kept, as a start's form keeps it. */
const Picked: FC<{ onPicked?: (kind: AgentKind | undefined) => void }> = ({
  onPicked,
}) => {
  const [value, setValue] = useState<AgentKind>();
  return (
    <AgentPicker
      scope={{ ticketNumber: 4 }}
      value={value}
      onChange={(kind) => {
        setValue(kind);
        onPicked?.(kind);
      }}
    />
  );
};

describe('AgentPicker (T1368)', () => {
  beforeEach(() => {
    vi.mocked(loadAgentChoices).mockReset();
  });

  it("shows the Project's default first picked, and the kind the User picks", async () => {
    vi.mocked(loadAgentChoices).mockResolvedValue(bothCanRun);
    const onPicked = vi.fn();
    renderWithTheme(<Picked onPicked={onPicked} />);

    const picker = await screen.findByLabelText('Agent');
    expect(picker).toHaveValue('copilot');
    expect(
      screen.getByRole('option', { name: 'Copilot (default)' }),
    ).toBeInTheDocument();

    await userEvent.selectOptions(picker, 'claude-code');

    expect(onPicked).toHaveBeenLastCalledWith('claude-code');
    expect(picker).toHaveValue('claude-code');
    expect(loadAgentChoices).toHaveBeenCalledWith({ ticketNumber: 4 });
  });

  it('shows a kind that cannot run disabled, with its reason', async () => {
    vi.mocked(loadAgentChoices).mockResolvedValue({
      ok: true,
      choices: {
        defaultKind: 'claude-code',
        kinds: [
          { kind: 'claude-code', label: 'Claude Code', available: true },
          {
            kind: 'copilot',
            label: 'Copilot',
            available: false,
            reason: 'Copilot is not signed in.',
          },
        ],
      },
    });
    renderWithTheme(<Picked />);

    const copilot = await screen.findByRole('option', {
      name: 'Copilot: cannot run',
    });
    expect(copilot).toBeDisabled();
    expect(screen.getByText('Copilot is not signed in.')).toBeInTheDocument();
  });

  it('shows nothing while only one Agent kind is registered', async () => {
    vi.mocked(loadAgentChoices).mockResolvedValue({ ok: true, choices: null });
    renderWithTheme(<Picked />);

    await vi.waitFor(() => expect(loadAgentChoices).toHaveBeenCalled());
    expect(screen.queryByLabelText('Agent')).not.toBeInTheDocument();
  });
});
