// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { BackToTodoButton } from './back-to-todo-button';

describe('BackToTodoButton', () => {
  it('calls back on click', async () => {
    const onClick = vi.fn();
    renderWithTheme(<BackToTodoButton onClick={onClick} />);

    await userEvent.click(screen.getByRole('button', { name: 'Back to Todo' }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is disabled while pending', () => {
    renderWithTheme(<BackToTodoButton onClick={vi.fn()} pending />);

    expect(screen.getByRole('button', { name: 'Back to Todo' })).toBeDisabled();
  });
});
