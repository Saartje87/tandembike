import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setProjectAgentCommands } from '../../app/projects/actions';
import { renderWithTheme } from '../../test/render';
import { AgentCommandsForm } from './agent-commands-form';

vi.mock('../../app/projects/actions', () => ({
  setProjectAgentCommands: vi.fn(),
}));

const commands = {
  triageCommand: '/mattpocock-skills:triage',
  startCommand: '/mattpocock-skills:implement',
  startEpicCommand: null,
};

describe('AgentCommandsForm', () => {
  beforeEach(() => {
    vi.mocked(setProjectAgentCommands).mockReset();
  });

  it('shows the three commands, blank for none, and saves the edited ones', async () => {
    const user = userEvent.setup();
    vi.mocked(setProjectAgentCommands).mockResolvedValue({
      ok: true,
      commands: {
        triageCommand: '/triage',
        startCommand: '/mattpocock-skills:implement',
        startEpicCommand: '/implement-spec',
      },
    });
    renderWithTheme(<AgentCommandsForm projectId={3} commands={commands} />);
    const triage = screen.getByRole('textbox', { name: 'Triage command' });
    const start = screen.getByRole('textbox', { name: 'Start command' });
    const startEpic = screen.getByRole('textbox', {
      name: 'Start command for Epics',
    });
    expect(triage).toHaveValue('/mattpocock-skills:triage');
    expect(start).toHaveValue('/mattpocock-skills:implement');
    expect(startEpic).toHaveValue('');

    await user.clear(triage);
    await user.type(triage, 'triage');
    await user.type(startEpic, 'implement-spec');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(setProjectAgentCommands).toHaveBeenCalledWith({
      projectId: 3,
      triageCommand: 'triage',
      startCommand: '/mattpocock-skills:implement',
      startEpicCommand: 'implement-spec',
    });
    expect(triage).toHaveValue('/triage');
    expect(startEpic).toHaveValue('/implement-spec');
  });

  it('shows a refusal under the field it names and keeps the text', async () => {
    const user = userEvent.setup();
    vi.mocked(setProjectAgentCommands).mockResolvedValue({
      ok: false,
      error: 'x',
      fieldErrors: { startCommand: '"/implement T1" has a space.' },
    });
    renderWithTheme(<AgentCommandsForm projectId={3} commands={commands} />);
    const start = screen.getByRole('textbox', { name: 'Start command' });

    await user.clear(start);
    await user.type(start, '/implement T1');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('"/implement T1" has a space.'),
    ).toBeInTheDocument();
    expect(start).toHaveValue('/implement T1');
    expect(start).toHaveAttribute('aria-invalid', 'true');
    expect(
      screen.getByRole('textbox', { name: 'Triage command' }),
    ).not.toHaveAttribute('aria-invalid');
  });

  it('shows a refusal that names no field as an alert', async () => {
    const user = userEvent.setup();
    vi.mocked(setProjectAgentCommands).mockResolvedValue({
      ok: false,
      error: 'The Project "Website" is archived.',
    });
    renderWithTheme(<AgentCommandsForm projectId={3} commands={commands} />);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Project "Website" is archived.',
    );
  });
});
