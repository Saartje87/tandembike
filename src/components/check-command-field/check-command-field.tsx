import { Button, Inline, Label, Stack, Text, TextInput } from '@blockle/blocks';
import { type FC, type ReactNode, useId } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';

import { FieldError } from '../field-error/field-error';

export type CheckCommandFieldProps = {
  /** The form's `register('checkCommand')`. */
  registration: UseFormRegisterReturn;
  /** The field's current value; a candidate equal to it is not offered. */
  value: string;
  /** Why the value was refused. */
  error?: string;
  /** Detected candidates; `null` before any detection, none offered then. */
  candidates: string[] | null;
  /** Called with the candidate whose "Use" button was pressed. */
  onUse: (candidate: string) => void;
  /** Help under the field. */
  children?: ReactNode;
};

/**
 * The Check command text field with the candidates a repository detection
 * found, each as a "Use <candidate>" button, and the reason a save was refused.
 */
export const CheckCommandField: FC<CheckCommandFieldProps> = ({
  registration,
  value,
  error,
  candidates,
  onUse,
  children,
}) => {
  const inputId = useId();
  const errorId = useId();
  const offered = candidates?.filter((candidate) => candidate !== value);

  return (
    <Stack gap={1}>
      <Label htmlFor={inputId}>Check command</Label>
      <TextInput
        {...registration}
        id={inputId}
        placeholder="npm run check"
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {children}
      {candidates !== null && (
        <Inline gap={1} alignY="center">
          {candidates.length === 0 ? (
            <Text tag="p" fontSize="small" color="muted">
              No Check command candidates found.
            </Text>
          ) : (
            offered?.map((candidate) => (
              <Button
                key={candidate}
                type="button"
                size="small"
                variant="ghost"
                onClick={() => onUse(candidate)}
              >
                Use {candidate}
              </Button>
            ))
          )}
        </Inline>
      )}
      <FieldError id={errorId} reason={error} />
    </Stack>
  );
};
