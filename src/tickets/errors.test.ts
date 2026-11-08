// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  NameTakenError,
  NotAllowedError,
  NotFoundError,
  TicketsError,
  ValidationError,
} from './errors';

/**
 * A second copy of this module, as Next bundles one for instrumentation
 * (Autopilot) apart from the Server Actions' copy (T1185).
 */
async function loadSecondCopy() {
  vi.resetModules();
  return import('./errors');
}

describe('Tickets errors', () => {
  it('each declare a kind of their own, or they would match their parent', async () => {
    const errors = await import('./errors');
    const classes = Object.values(errors).filter(
      (value) =>
        typeof value === 'function' &&
        (value === TicketsError || value.prototype instanceof Error),
    );

    expect(classes.length).toBeGreaterThan(1);
    for (const type of classes) {
      expect(Object.hasOwn(type, 'kind'), type.name).toBe(true);
    }
    const kinds = classes.map((type) => (type as typeof TicketsError).kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it('are recognised by a second copy of the module, by their own class only', async () => {
    const other = await loadSecondCopy();
    expect(other.TicketsError).not.toBe(TicketsError);

    const refusal = new other.NotAllowedError('No.');

    expect(refusal instanceof TicketsError).toBe(true);
    expect(refusal instanceof NotAllowedError).toBe(true);
    expect(refusal instanceof Error).toBe(true);
    expect(refusal instanceof ValidationError).toBe(false);
    expect(refusal instanceof NotFoundError).toBe(false);
    expect(refusal.message).toBe('No.');
  });

  it('keep a ValidationError’s field errors across copies', async () => {
    const other = await loadSecondCopy();

    const error: unknown = new other.ValidationError({ text: 'Write one.' });

    expect(error instanceof ValidationError).toBe(true);
    expect(error instanceof TicketsError).toBe(true);
    expect(error instanceof NameTakenError).toBe(false);
    expect((error as ValidationError).fieldErrors).toEqual({
      text: 'Write one.',
    });
  });

  it('do not match plain errors or other values', () => {
    expect(new Error('x') instanceof TicketsError).toBe(false);
    const nothing: unknown = null;
    expect(nothing instanceof TicketsError).toBe(false);
    expect({ name: 'TicketsError' } instanceof TicketsError).toBe(false);
  });
});
