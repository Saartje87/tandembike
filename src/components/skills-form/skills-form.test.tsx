import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { setProjectSkills } from '../../app/projects/actions';
import { renderWithTheme } from '../../test/render';
import { SkillsForm } from './skills-form';

vi.mock('../../app/projects/actions', () => ({ setProjectSkills: vi.fn() }));

describe('SkillsForm', () => {
  beforeEach(() => {
    vi.mocked(setProjectSkills).mockReset();
  });

  it('shows the Skills one per line and saves the edited lines', async () => {
    const user = userEvent.setup();
    vi.mocked(setProjectSkills).mockResolvedValue({
      ok: true,
      skills: ['/review', '/plan'],
    });
    renderWithTheme(<SkillsForm projectId={3} skills={['/review']} />);
    const field = screen.getByRole('textbox', { name: 'Skills' });
    expect(field).toHaveValue('/review');

    await user.type(field, '\nplan');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(setProjectSkills).toHaveBeenCalledWith({
      projectId: 3,
      text: '/review\nplan',
    });
    expect(field).toHaveValue('/review\n/plan');
  });

  it('shows a refusal under the field and keeps the text', async () => {
    const user = userEvent.setup();
    vi.mocked(setProjectSkills).mockResolvedValue({
      ok: false,
      error: 'x',
      fieldErrors: { skills: '"/to spec" has a space.' },
    });
    renderWithTheme(<SkillsForm projectId={3} skills={[]} />);
    const field = screen.getByRole('textbox', { name: 'Skills' });

    await user.type(field, '/to spec');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('"/to spec" has a space.'),
    ).toBeInTheDocument();
    expect(field).toHaveValue('/to spec');
    expect(field).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a refusal that names no field as an alert', async () => {
    const user = userEvent.setup();
    vi.mocked(setProjectSkills).mockResolvedValue({
      ok: false,
      error: 'The Project "Website" is archived.',
    });
    renderWithTheme(<SkillsForm projectId={3} skills={[]} />);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Project "Website" is archived.',
    );
  });
  it('shows a save whose action throws as an alert and keeps the text (T1322)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    onTestFinished(() => log.mockRestore());
    const user = userEvent.setup();
    vi.mocked(setProjectSkills).mockRejectedValue(new Error('network down'));
    renderWithTheme(<SkillsForm projectId={3} skills={['/review']} />);
    const field = screen.getByRole('textbox', { name: 'Skills' });

    await user.type(field, '\n/plan');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Skills could not be saved. Try again.',
    );
    expect(field).toHaveValue('/review\n/plan');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});
