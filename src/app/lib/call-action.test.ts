import { afterEach, describe, expect, it, vi } from 'vitest';

import { callAction } from './call-action';

describe('callAction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the action's result when it resolves", async () => {
    await expect(
      callAction(async () => ({ ok: true as const, number: 7 }), 'Failed.'),
    ).resolves.toEqual({ ok: true, number: 7 });
    await expect(
      callAction(
        async () => ({ ok: false as const, error: 'There is no Ticket T42.' }),
        'Failed.',
      ),
    ).resolves.toEqual({ ok: false, error: 'There is no Ticket T42.' });
  });

  it('turns a throw into a refusal with the fallback message, and logs it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const thrown = new Error('network down');

    await expect(
      callAction(async () => {
        throw thrown;
      }, 'The answer could not be sent. Try again.'),
    ).resolves.toEqual({
      ok: false,
      error: 'The answer could not be sent. Try again.',
    });
    expect(log).toHaveBeenCalledWith(thrown);
  });
});
