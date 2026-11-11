'use client';

import { Label, Stack, Text, TextInput } from '@blockle/blocks';
import { type FC, type ReactNode, useId } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';

import { FieldError } from '../field-error/field-error';

export type SettingsTextFieldProps = {
  /** The field's `register(…)`, from its section's form. */
  registration: UseFormRegisterReturn;
  label: string;
  /** The field's anchor, for `projectSettingsFieldPath`. */
  anchor?: string;
  /** One line under the field. */
  hint?: ReactNode;
  /** Why the field's value was refused. */
  error?: string;
  placeholder?: string;
  /** A ceiling's amount, rather than text. */
  number?: boolean;
  disabled?: boolean;
  /** Shown under the hint, such as a Detect button. */
  children?: ReactNode;
};

/** One text field of a Settings section, saved with its section. */
export const SettingsTextField: FC<SettingsTextFieldProps> = ({
  registration,
  label,
  anchor,
  hint,
  error,
  placeholder,
  number = false,
  disabled,
  children,
}) => {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const describedBy = [hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(' ');
  return (
    <Stack gap={1} id={anchor}>
      <Label htmlFor={inputId}>{label}</Label>
      <TextInput
        {...registration}
        id={inputId}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...(number
          ? { type: 'number', min: 0, step: 'any', inputMode: 'decimal' }
          : {})}
      />
      {hint && (
        <Text id={hintId} tag="p" fontSize="small" color="muted">
          {hint}
        </Text>
      )}
      <FieldError id={errorId} reason={error} />
      {children}
    </Stack>
  );
};
