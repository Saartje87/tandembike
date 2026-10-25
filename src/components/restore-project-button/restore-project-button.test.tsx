import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { restoreProject } from '../../app/projects/actions';
import { renderWithTheme } from '../../test/render';
import { RestoreProjectButton } from './restore-project-button';

vi.mock('../../app/projects/actions', () => ({ restoreProject: vi.fn() }));

const project = { id: 3, name: 'Old site' };

describe('RestoreProjectButton', () => {
  beforeEach(() => {
    vi.mocked(restoreProject).mockReset();
  });

  it('restores the Project it names', async () => {
    vi.mocked(restoreProject).mockResolvedValue({ ok: true });
    renderWithTheme(<RestoreProjectButton project={project} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Restore Old site' }),
    );

    expect(restoreProject).toHaveBeenCalledExactlyOnceWith({ projectId: 3 });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows why restoring was refused', async () => {
    vi.mocked(restoreProject).mockResolvedValue({
      ok: false,
      error: 'There is no Project with id 3.',
    });
    renderWithTheme(<RestoreProjectButton project={project} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Restore Old site' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'There is no Project with id 3.',
    );
  });
});
