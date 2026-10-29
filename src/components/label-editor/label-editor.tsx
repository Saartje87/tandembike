'use client';

import {
  Alert,
  Inline,
  Label,
  Select,
  Stack,
  VisuallyHidden,
} from '@blockle/blocks';
import { type FC, useId, useOptimistic, useState, useTransition } from 'react';

import { addTicketLabel, removeTicketLabel } from '../../app/tickets/actions';
import { keepDrawerOpen } from '../keep-drawer-open/keep-drawer-open';
import { LabelList } from '../label-list/label-list';

export type LabelEditorProps = {
  ticketNumber: number;
  /** The Ticket's labels. */
  labels: string[];
  /** Every label in use, offered while typing. */
  suggestions: string[];
};

type LabelChange = { type: 'add' | 'remove'; label: string };

/** `labels` after `change`, normalized the way the Tickets module stores them. */
function changedLabels(labels: string[], change: LabelChange): string[] {
  const label = change.label.trim().toLowerCase();
  if (change.type === 'remove') {
    return labels.filter((existing) => existing !== label);
  }
  return label === '' || labels.includes(label)
    ? labels
    : [...labels, label].sort();
}

/**
 * A Ticket's labels as removable chips, with a select for adding existing
 * labels. Changes are saved at once and show before the server confirms them.
 */
export const LabelEditor: FC<LabelEditorProps> = ({
  ticketNumber,
  labels,
  suggestions,
}) => {
  const selectId = useId();
  const [shownLabels, showChange] = useOptimistic(labels, changedLabels);
  const availableLabels = suggestions.filter(
    (suggestion) => !shownLabels.includes(suggestion),
  );
  const [error, setError] = useState<string>();
  const [, startChange] = useTransition();

  const change = (labelChange: LabelChange) => {
    setError(undefined);
    startChange(async () => {
      showChange(labelChange);
      const action =
        labelChange.type === 'add' ? addTicketLabel : removeTicketLabel;
      const result = await action({
        number: ticketNumber,
        label: labelChange.label,
      });
      if (!result.ok) {
        setError(result.fieldErrors?.labels ?? result.error);
      }
    });
  };

  return (
    <Stack gap={2}>
      <Inline gap={1} alignY="center" flexWrap="wrap">
        <LabelList
          labels={shownLabels}
          onRemove={(label, event) => {
            keepDrawerOpen(event);
            change({ type: 'remove', label });
          }}
        />
        <Label htmlFor={selectId}>
          <VisuallyHidden>Add a label</VisuallyHidden>
        </Label>
        <Select
          id={selectId}
          value=""
          disabled={availableLabels.length === 0}
          onChange={(event) => {
            const label = event.currentTarget.value;
            if (label !== '') {
              change({ type: 'add', label });
            }
          }}
        >
          <option value="">
            {availableLabels.length > 0 ? 'Add a label' : 'No labels to add'}
          </option>
          {availableLabels.map((suggestion) => (
            <option key={suggestion} value={suggestion}>
              {suggestion}
            </option>
          ))}
        </Select>
      </Inline>
      {error && <Alert intent="danger">{error}</Alert>}
    </Stack>
  );
};
