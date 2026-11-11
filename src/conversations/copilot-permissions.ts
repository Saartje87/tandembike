import type {
  PermissionRequest as CopilotPermissionRequest,
  PermissionHandler,
  PermissionRequestResult,
} from '@github/copilot-sdk';

import type { PermissionRequest, RunOptions } from './agent-runner';

const recordOf = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : value === undefined
      ? {}
      : { args: value };

/**
 * A Copilot permission request in Tandembike's terms: the tool it is for and
 * the input the User judges it by. Only the fields a person needs to decide
 * are kept, so the Allow/Deny card stays readable.
 */
export function permissionRequestOf(
  request: CopilotPermissionRequest,
): PermissionRequest {
  const asked = (toolName: string, input: Record<string, unknown>) => ({
    toolName,
    input,
    rules: [],
  });
  switch (request.kind) {
    case 'shell':
      return asked('shell', {
        command: request.fullCommandText,
        intention: request.intention,
      });
    case 'write':
      return asked('write', {
        file: request.fileName,
        intention: request.intention,
        diff: request.diff,
      });
    case 'read':
      return asked('read', {
        path: request.path,
        intention: request.intention,
      });
    case 'url':
      return asked('url', { url: request.url, intention: request.intention });
    case 'mcp':
      return asked(
        `${request.serverName}-${request.toolName}`,
        recordOf(request.args),
      );
    case 'custom-tool':
      return asked(request.toolName, recordOf(request.args));
    case 'memory':
      return asked('memory', { fact: request.fact });
    default: {
      const { kind, ...rest } = request as { kind: string };
      return asked(kind, rest);
    }
  }
}

/**
 * The Copilot runner's permission handler (ADR 0051): every request Copilot
 * would ask a terminal about is asked in the Conversation as Allow or Deny,
 * and the run waits for the answer.
 */
export function copilotPermissionHandler(
  askPermission: RunOptions['askPermission'],
): PermissionHandler {
  return async (request): Promise<PermissionRequestResult> => {
    const answer = await askPermission(permissionRequestOf(request));
    return answer === 'deny'
      ? { kind: 'reject', feedback: 'The User denied this.' }
      : { kind: 'approve-once' };
  };
}
