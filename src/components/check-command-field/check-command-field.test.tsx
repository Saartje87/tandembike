import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { FC } from 'react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../test/render';
import {
  CheckCommandField,
  type CheckCommandFieldProps,
} from './check-command-field';

const Harness: FC<
  Pick<CheckCommandFieldProps, 'candidates' | 'error' | 'onUse'>
> = (props) => {
  const { register, watch } = useForm({
    defaultValues: { checkCommand: 'npm test' },
  });
  return (
    <CheckCommandField
      {...props}
      registration={register('checkCommand')}
      value={watch('checkCommand')}
    >
      Help text
    </CheckCommandField>
  );
};

describe('CheckCommandField', () => {
  it('shows the field with its help and no candidates before detection', () => {
    renderWithTheme(<Harness candidates={null} onUse={vi.fn()} />);

    expect(screen.getByRole('textbox', { name: 'Check command' })).toHaveValue(
      'npm test',
    );
    expect(screen.getByText('Help text')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers each other candidate and reports the one used', async () => {
    const onUse = vi.fn();
    renderWithTheme(
      <Harness candidates={['npm test', 'make test']} onUse={onUse} />,
    );

    expect(screen.queryByRole('button', { name: 'Use npm test' })).toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: 'Use make test' }),
    );

    expect(onUse).toHaveBeenCalledExactlyOnceWith('make test');
  });

  it('says when detection found no candidates', () => {
    renderWithTheme(<Harness candidates={[]} onUse={vi.fn()} />);

    expect(
      screen.getByText('No Check command candidates found.'),
    ).toBeInTheDocument();
  });

  it('shows why the value was refused on the field', () => {
    renderWithTheme(
      <Harness candidates={null} error="Too long." onUse={vi.fn()} />,
    );

    expect(
      screen.getByRole('textbox', { name: 'Check command' }),
    ).toHaveAccessibleDescription('Too long.');
  });
});
