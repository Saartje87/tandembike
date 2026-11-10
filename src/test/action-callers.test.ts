import { describe, expect, it } from 'vitest';

import { actionCallerProblems } from './action-callers';

const bypassing = `import { closeConversation } from '../../app/conversations/actions';
export const Close = () => <button onClick={() => closeConversation(1)} />;
`;

const handled = `import { callAction } from '../../app/lib/call-action';
import { closeConversation } from '../../app/conversations/actions';
export const Close = () => (
  <button onClick={() => callAction(() => closeConversation(1), 'Could not close')} />
);
`;

describe('actionCallerProblems', () => {
  it('flags a file that imports a Server Action without callAction', () => {
    expect(actionCallerProblems({ 'close/close.tsx': bypassing }, {})).toEqual([
      'close/close.tsx imports a Server Action but never calls callAction; route each call through callAction, or add it to the allowlist with why it is safe',
    ]);
  });

  it('passes a file that routes its calls through callAction', () => {
    expect(actionCallerProblems({ 'close/close.tsx': handled }, {})).toEqual(
      [],
    );
  });

  it('passes a bypassing file that is on the allowlist', () => {
    expect(
      actionCallerProblems(
        { 'close/close.tsx': bypassing },
        { 'close/close.tsx': 'Its promise has a .catch' },
      ),
    ).toEqual([]);
  });

  it('ignores files that import no Server Action, or only its types', () => {
    expect(
      actionCallerProblems(
        {
          'plain/plain.tsx': `import { sparPath } from '../../app/lib/paths';`,
          'near/near.tsx': `import { total } from '../../app/lib/transactions';`,
          'types/types.tsx': `import type { MachineRunsState } from '../../app/settings/actions';`,
        },
        {},
      ),
    ).toEqual([]);
  });

  it('flags a multi-line import of a Server Action', () => {
    expect(
      actionCallerProblems(
        {
          'open/open.tsx': `import {
  loadConversation,
  reopenConversation,
} from '../../app/conversations/actions';`,
        },
        {},
      ),
    ).toHaveLength(1);
  });

  it('flags an allowlist entry whose file now uses callAction or is gone', () => {
    expect(
      actionCallerProblems(
        { 'close/close.tsx': handled },
        {
          'close/close.tsx': 'Its promise has a .catch',
          'gone/gone.tsx': 'Its promise has a .catch',
        },
      ),
    ).toEqual([
      'close/close.tsx is on the allowlist but no longer needs to be: remove it',
      'gone/gone.tsx is on the allowlist but no longer needs to be: remove it',
    ]);
  });

  it('flags an allowlist entry without a reason', () => {
    expect(
      actionCallerProblems(
        { 'close/close.tsx': bypassing },
        { 'close/close.tsx': ' ' },
      ),
    ).toEqual(['close/close.tsx is on the allowlist without a reason']);
  });
});
