'use client';

import {
  Alert,
  Button,
  Inline,
  Label,
  Stack,
  Text,
  TextInput,
  VisuallyHidden,
} from '@blockle/blocks';
import { type FC, useId, useOptimistic, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import {
  addTicketExternalReference,
  removeTicketExternalReference,
} from '../../app/tickets/actions';
import {
  externalReferenceDisplay,
  type ReferenceTemplateLink,
} from '../../tickets/external-reference-display';
import { AppLink } from '../app-link/app-link';
import { FieldError } from '../field-error/field-error';
import { Icon } from '../icon/icon';
import {
  claimEscape,
  keepDrawerOpen,
} from '../keep-drawer-open/keep-drawer-open';
import * as styles from './external-reference-editor.css';

export type ExternalReferenceEditorProps = {
  ticketNumber: number;
  /** The Ticket's External references, in the order they were added. */
  references: string[];
  /** The Project's Reference templates, which link keys. Defaults to none. */
  templates?: ReferenceTemplateLink[];
};

type ReferenceChange = { type: 'add' | 'remove'; reference: string };

/** `references` after `change`, trimmed the way the Tickets module stores them. */
function changedReferences(
  references: string[],
  change: ReferenceChange,
): string[] {
  const reference = change.reference.trim();
  if (change.type === 'remove') {
    return references.filter((existing) => existing !== reference);
  }
  return references.includes(reference)
    ? references
    : [...references, reference];
}

type ReferenceProps = {
  reference: string;
  templates: ReferenceTemplateLink[];
};

/**
 * A URL, or a key one of `templates` matches, as a link that opens in a new
 * tab; any other key as plain text.
 */
const Reference: FC<ReferenceProps> = ({ reference, templates }) => {
  const { text, href } = externalReferenceDisplay(reference, templates);

  return (
    <Text fontSize="small" wordBreak="break-word">
      {href === undefined ? (
        text
      ) : (
        <AppLink
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          variant="primary"
          underline
        >
          {text}
        </AppLink>
      )}
    </Text>
  );
};

/**
 * A Ticket's External references, each with a button to remove it, then a
 * button that opens a field for another URL or key. Both changes show at
 * once; a refused addition reopens the field with the draft and the reason.
 */
export const ExternalReferenceEditor: FC<ExternalReferenceEditorProps> = ({
  ticketNumber,
  references,
  templates = [],
}) => {
  const inputId = useId();
  const errorId = useId();
  const [shown, showChange] = useOptimistic(references, changedReferences);
  const [adding, setAdding] = useState(false);
  // Focus goes back to the add button after Escape or adding.
  const [refocusAdd, setRefocusAdd] = useState(false);
  // Kept mounted with the editor, so the draft outlives the field.
  const {
    clearErrors,
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<{ reference: string }>({ defaultValues: { reference: '' } });
  const fieldError = errors.reference?.message;
  const serverError = errors.root?.server?.message;
  const [, startChange] = useTransition();

  const stopAdding = () => {
    setAdding(false);
    setRefocusAdd(true);
  };

  const add = handleSubmit(({ reference }) => {
    stopAdding();
    startChange(async () => {
      showChange({ type: 'add', reference });
      const result = await addTicketExternalReference({
        number: ticketNumber,
        reference,
      });
      if (result.ok) {
        reset();
        return;
      }
      setAdding(true);
      const reason = result.fieldErrors?.externalReferences;
      if (reason) {
        setError('reference', { type: 'server', message: reason });
      } else {
        setError('root.server', { message: result.error });
      }
    });
  });

  const remove = (reference: string) => {
    clearErrors();
    startChange(async () => {
      showChange({ type: 'remove', reference });
      const result = await removeTicketExternalReference({
        number: ticketNumber,
        reference,
      });
      if (!result.ok) {
        setError('root.server', { message: result.error });
      }
    });
  };

  return (
    <Stack gap={2}>
      {shown.length > 0 ? (
        <Stack
          tag="ul"
          gap={1}
          aria-label="External references"
          className={styles.list}
        >
          {shown.map((reference) => (
            <li key={reference}>
              <Inline gap={2} alignY="center" flexWrap="nowrap">
                <Reference reference={reference} templates={templates} />
                <Button
                  type="button"
                  variant="ghost"
                  size="small"
                  aria-label={`Remove External reference ${reference}`}
                  onClick={(event) => {
                    keepDrawerOpen(event);
                    remove(reference);
                  }}
                >
                  <Icon name="x-mark" size="small" />
                </Button>
              </Inline>
            </li>
          ))}
        </Stack>
      ) : (
        <Text tag="p" fontSize="small" color="muted">
          None
        </Text>
      )}
      {adding ? (
        <form
          onSubmit={add}
          onKeyDown={(event) => {
            if (claimEscape(event)) {
              stopAdding();
              reset();
            }
          }}
        >
          <Stack gap={1}>
            <Label htmlFor={inputId}>
              <VisuallyHidden>URL or key</VisuallyHidden>
            </Label>
            <Inline gap={2} alignY="center">
              <TextInput
                {...register('reference', { required: 'Enter a URL or key.' })}
                id={inputId}
                placeholder="https://… or ABC-33"
                autoComplete="off"
                autoFocus
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? errorId : undefined}
              />
              <Button type="submit" size="small" onClick={keepDrawerOpen}>
                Add
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="small"
                onClick={(event) => {
                  keepDrawerOpen(event);
                  stopAdding();
                  reset();
                }}
              >
                Cancel
              </Button>
            </Inline>
            <FieldError id={errorId} reason={fieldError} />
          </Stack>
        </form>
      ) : (
        <Inline gap={0}>
          <Button
            type="button"
            variant="ghost"
            size="small"
            startSlot={<Icon name="plus" size="small" />}
            autoFocus={refocusAdd}
            onClick={(event) => {
              keepDrawerOpen(event);
              clearErrors();
              setAdding(true);
            }}
          >
            Add External reference
          </Button>
        </Inline>
      )}
      {serverError && <Alert intent="error">{serverError}</Alert>}
    </Stack>
  );
};
