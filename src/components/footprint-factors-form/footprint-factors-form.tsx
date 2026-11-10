'use client';

import {
  Alert,
  Button,
  Inline,
  Label,
  Stack,
  Text,
  TextInput,
} from '@blockle/blocks';
import { type FC, useId, useState } from 'react';
import { useForm } from 'react-hook-form';

import { fieldRefusal, rootRefusal } from '../../app/lib/action-result';
import { callAction } from '../../app/lib/call-action';
import {
  resetFootprintFactor,
  saveFootprintFactors,
} from '../../app/settings/actions';
import {
  defaultFootprintFactors,
  type FootprintFactors,
} from '../../footprint/footprint';
import type { FootprintFactor } from '../../settings/settings';
import { FieldError } from '../field-error/field-error';

export type FootprintFactorsFormProps = {
  /** The saved Footprint factors. */
  factors: FootprintFactors;
};

type FactorFieldProps = {
  name: FootprintFactor;
  label: string;
  /** What resets name it by, such as "Haiku". */
  short: string;
  reason: string | undefined;
  resetting: boolean;
  register: ReturnType<typeof useForm<FootprintFactors>>['register'];
  onReset(): void;
};

const fields: { name: FootprintFactor; label: string; short: string }[] = [
  {
    name: 'haikuWhPerMillion',
    label: 'Haiku, Wh per 1M output tokens',
    short: 'Haiku',
  },
  {
    name: 'sonnetWhPerMillion',
    label: 'Sonnet, Wh per 1M output tokens',
    short: 'Sonnet',
  },
  {
    name: 'opusWhPerMillion',
    label: 'Opus, Wh per 1M output tokens',
    short: 'Opus',
  },
  {
    name: 'gridGramsPerKwh',
    label: 'Grid intensity, gCO₂e per kWh',
    short: 'grid intensity',
  },
];

/** One factor's number field, its reset control and its refusal. */
const FactorField: FC<FactorFieldProps> = ({
  name,
  label,
  short,
  reason,
  resetting,
  register,
  onReset,
}) => {
  const id = useId();
  const errorId = useId();
  return (
    <Stack gap={1}>
      <Label htmlFor={id}>{label}</Label>
      <Inline gap={2} alignY="center" flexWrap="nowrap">
        <TextInput
          {...register(name, { valueAsNumber: true })}
          id={id}
          type="number"
          step="any"
          inputMode="decimal"
          aria-invalid={reason ? true : undefined}
          aria-describedby={reason ? errorId : undefined}
        />
        <Button
          type="button"
          size="small"
          variant="ghost"
          loading={resetting}
          aria-label={`Reset ${short} to ${defaultFootprintFactors[name]}`}
          onClick={onReset}
        >
          Reset to {defaultFootprintFactors[name]}
        </Button>
      </Inline>
      <FieldError id={errorId} reason={reason} />
    </Stack>
  );
};

/**
 * The app-wide Footprint factors (ADR 0050): Wh per 1M output tokens per
 * model tier and the grid's carbon intensity, each with a reset to its
 * default. A refusal shows under the field it names and keeps the draft.
 */
export const FootprintFactorsForm: FC<FootprintFactorsFormProps> = ({
  factors,
}) => {
  const [resetting, setResetting] = useState<FootprintFactor | null>(null);
  // A reset saves one factor, so "Saved." from an earlier submit no longer
  // speaks for the form.
  const [showSaved, setShowSaved] = useState(false);
  const {
    formState: { errors, isSubmitting, isSubmitSuccessful },
    handleSubmit,
    register,
    setError,
    clearErrors,
    setValue,
  } = useForm<FootprintFactors>({ defaultValues: factors });
  const serverError = errors.root?.server?.message;

  const submit = handleSubmit(async (values) => {
    const result = await callAction(
      () => saveFootprintFactors(values),
      'The Footprint factors could not be saved. Try again.',
    );
    if (result.ok) {
      setShowSaved(true);
      return;
    }
    const refused = fields
      .map(({ name }) => [name, fieldRefusal(result, name)] as const)
      .filter(([, message]) => message);
    for (const [name, message] of refused) {
      setError(name, { type: 'server', message });
    }
    if (refused.length === 0) {
      setError('root.server', { message: rootRefusal(result) });
    }
  });

  const reset = async (name: FootprintFactor) => {
    clearErrors(name);
    setShowSaved(false);
    setResetting(name);
    const result = await callAction(
      () => resetFootprintFactor({ name }),
      'The factor could not be reset. Try again.',
    );
    setResetting(null);
    if (result.ok) {
      setValue(name, result.factors[name]);
      return;
    }
    setError(name, {
      type: 'server',
      message: fieldRefusal(result, 'name') ?? rootRefusal(result),
    });
  };

  return (
    <form aria-label="Footprint factors" onSubmit={submit}>
      <Stack gap={3}>
        <Text tag="p" fontSize="small" color="muted">
          The Footprint estimates the energy and CO₂e of each Conversation from
          the tokens its runs used. Output tokens count fully, other tokens as a
          fixed fraction of one, times the factor of the model&apos;s tier
          (data-centre overhead included); CO₂e is that energy times the grid
          intensity. Changing a factor changes every Footprint, past ones
          included. The method and the sources of the defaults are in ADR 0050
          (docs/adr) and docs/research/footprint-factors.md.
        </Text>
        {fields.map((field) => (
          <FactorField
            key={field.name}
            {...field}
            reason={errors[field.name]?.message}
            resetting={resetting === field.name}
            register={register}
            onReset={() => reset(field.name)}
          />
        ))}
        {serverError && <Alert intent="danger">{serverError}</Alert>}
        {showSaved &&
          isSubmitSuccessful &&
          !serverError &&
          fields.every(({ name }) => !errors[name]) && (
            <Text tag="p" fontSize="small" color="muted" role="status">
              Saved.
            </Text>
          )}
        <Button
          type="submit"
          alignSelf="flex-start"
          loading={isSubmitting}
          aria-label="Save Footprint factors"
        >
          Save
        </Button>
      </Stack>
    </form>
  );
};
