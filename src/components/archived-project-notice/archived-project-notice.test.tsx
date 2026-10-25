import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { restoreProject } from '../../app/projects/actions';
import { renderWithTheme } from '../../test/render';
import { ArchivedProjectNotice } from './archived-project-notice';

vi.mock('../../app/projects/actions', () => ({ restoreProject: vi.fn() }));

const project = {
  id: 3,
  name: 'Old site',
  color: null,
  icon: null,
  archived: true,
  createdAt: new Date('2026-01-01'),
};

describe('ArchivedProjectNotice', () => {
  beforeEach(() => {
    vi.mocked(restoreProject).mockReset();
  });

  it("names the Project and says it's archived", () => {
    renderWithTheme(<ArchivedProjectNotice project={project} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Old site' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Its Board and Tickets are hidden and read-only until you restore it.',
      ),
    ).toBeInTheDocument();
  });

  it('restores the Project', async () => {
    vi.mocked(restoreProject).mockResolvedValue({ ok: true });
    renderWithTheme(<ArchivedProjectNotice project={project} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Restore Old site' }),
    );

    expect(restoreProject).toHaveBeenCalledExactlyOnceWith({ projectId: 3 });
  });
});
