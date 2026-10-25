import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { archiveProject } from '../../app/projects/actions';
import { renderWithTheme } from '../../test/render';
import { ArchiveProjectButton } from './archive-project-button';

vi.mock('../../app/projects/actions', () => ({ archiveProject: vi.fn() }));

const project = { id: 3, name: 'Old site' };

describe('ArchiveProjectButton', () => {
  beforeEach(() => {
    vi.mocked(archiveProject).mockReset();
  });

  it('archives the Project it names', async () => {
    vi.mocked(archiveProject).mockResolvedValue({ ok: true });
    renderWithTheme(<ArchiveProjectButton project={project} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Archive Old site' }),
    );

    expect(archiveProject).toHaveBeenCalledExactlyOnceWith({ projectId: 3 });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows why archiving was refused', async () => {
    vi.mocked(archiveProject).mockResolvedValue({
      ok: false,
      error: 'There is no Project with id 3.',
    });
    renderWithTheme(<ArchiveProjectButton project={project} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Archive Old site' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'There is no Project with id 3.',
    );
  });
});
