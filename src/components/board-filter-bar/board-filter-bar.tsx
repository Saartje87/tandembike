'use client';

import {
  Button,
  Inline,
  Label,
  Select,
  TextInput,
  VisuallyHidden,
} from '@blockle/blocks';
import { type FC, useId } from 'react';

import { type BoardFilter, noBoardFilter } from '../../app/lib/paths';
import { isFiltering } from '../board/board-filter';
import { LabelList } from '../label-list/label-list';

export type BoardFilterBarProps = {
  filter: BoardFilter;
  /** The Labels to offer, in order; chosen ones are left out. */
  labels: string[];
  /** Called with the new filter; `typing` while the search is typed in. */
  onChange: (filter: BoardFilter, typing?: boolean) => void;
};

/**
 * A Board filter's controls (see `GLOSSARY.md`): a search field, the chosen
 * Labels as removable chips, a select that adds one, and "Clear filter"
 * while the filter hides anything.
 */
export const BoardFilterBar: FC<BoardFilterBarProps> = ({
  filter,
  labels,
  onChange,
}) => {
  const searchId = useId();
  const labelId = useId();
  const offered = labels.filter((label) => !filter.labels.includes(label));

  return (
    <Inline gap={2} alignY="center" flexWrap="wrap">
      <Label htmlFor={searchId}>
        <VisuallyHidden>Search Tickets</VisuallyHidden>
      </Label>
      <TextInput
        id={searchId}
        name="q"
        type="search"
        value={filter.query}
        onChange={(event) =>
          onChange({ ...filter, query: event.currentTarget.value }, true)
        }
        placeholder="Filter by title or number…"
        autoComplete="off"
      />
      <LabelList
        labels={filter.labels}
        name="Chosen Labels"
        onRemove={(removed) =>
          onChange({
            ...filter,
            labels: filter.labels.filter((label) => label !== removed),
          })
        }
      />
      <Label htmlFor={labelId}>
        <VisuallyHidden>Filter by Label</VisuallyHidden>
      </Label>
      <Select
        id={labelId}
        value=""
        disabled={offered.length === 0}
        onChange={(event) => {
          const label = event.currentTarget.value;
          if (label !== '') {
            onChange({ ...filter, labels: [...filter.labels, label] });
          }
        }}
      >
        <option value="">
          {offered.length > 0 ? 'Filter by Label' : 'No Labels to add'}
        </option>
        {offered.map((label) => (
          <option key={label} value={label}>
            {label}
          </option>
        ))}
      </Select>
      {isFiltering(filter) && (
        <Button
          type="button"
          variant="ghost"
          size="small"
          onClick={() => onChange(noBoardFilter)}
        >
          Clear filter
        </Button>
      )}
    </Inline>
  );
};
