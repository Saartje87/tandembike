import type {
  PermissionRequest as CopilotPermissionRequest,
  PermissionHandler,
  PermissionRequestResult,
} from '@github/copilot-sdk';

import type { PermissionRequest, RunOptions } from './agent-runner';

type PermissionHandlerInvocation = Parameters<PermissionHandler>[1];

type SessionApproval = Extract<
  PermissionRequestResult,
  { kind: 'approve-for-session' }
>['approval'];

const recordOf = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : value === undefined
      ? {}
      : { args: value };

/**
 * What Copilot can approve for the rest of the session for `request`, with
 * the rule the User reads for it, or null when it cannot (ADR 0051): shell
 * commands and file writes only when Copilot offers it, MCP and custom tools
 * by name. Paths and URLs have none.
 */
function sessionApprovalOf(
  request: CopilotPermissionRequest,
): { rule: string; approval: SessionApproval } | null {
  switch (request.kind) {
    case 'shell': {
      if (!request.canOfferSessionApproval) {
        return null;
      }
      const identifiers = [
        ...new Set(request.commands.map(({ identifier }) => identifier)),
      ];
      return identifiers.length === 0
        ? null
        : {
            rule: `shell(${identifiers.join(', ')})`,
            approval: { kind: 'commands', commandIdentifiers: identifiers },
          };
    }
    case 'write':
      return request.canOfferSessionApproval
        ? { rule: 'write', approval: { kind: 'write' } }
        : null;
    case 'mcp':
      return {
        rule: `${request.serverName}-${request.toolName}`,
        approval: {
          kind: 'mcp',
          serverName: request.serverName,
          toolName: request.toolName,
        },
      };
    case 'custom-tool':
      return {
        rule: request.toolName,
        approval: { kind: 'custom-tool', toolName: request.toolName },
      };
    default:
      return null;
  }
}

/**
 * A Copilot permission request in Tandembike's terms: the tool it is for,
 * the input the User judges it by, and the rule Allow-always would approve
 * for the session. Only the fields a person needs to decide are kept, so the
 * Allow/Deny card stays readable.
 */
export function permissionRequestOf(
  request: CopilotPermissionRequest,
): PermissionRequest {
  const forSession = sessionApprovalOf(request);
  const rules = forSession === null ? [] : [forSession.rule];
  const asked = (toolName: string, input: Record<string, unknown>) => ({
    toolName,
    input,
    rules,
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
 * Whether Copilot's Assisted judge approved `request` and nothing reserves
 * it for a person (ADR 0051). Assisted mode approves nothing by itself
 * through the SDK, so an `auto` run acts on the verdict here.
 */
function judgeApproved(
  request: CopilotPermissionRequest,
  invocation: PermissionHandlerInvocation | undefined,
): boolean {
  const assessment = invocation?.assistedApprovalAssessment;
  // The derived prompt's marker wins over the raw one when present.
  const prompt = invocation?.promptRequest;
  const reserved =
    prompt !== undefined && 'managedApprovalRequired' in prompt
      ? prompt.managedApprovalRequired
      : request.managedApprovalRequired;
  return (
    assessment?.status === 'completed' &&
    assessment.recommendation === 'approve' &&
    reserved !== true
  );
}

/**
 * The Copilot runner's permission handler (ADR 0051): every request Copilot
 * would ask a terminal about is asked in the Conversation as Allow or Deny,
 * and the run waits for the answer. In an `auto` run, a request the judge
 * approves goes ahead without asking, as Claude Code's classifier does.
 * Allow-always approves for the rest of the session only.
 */
export function copilotPermissionHandler(
  askPermission: RunOptions['askPermission'],
  assisted: () => boolean,
): PermissionHandler {
  return async (request, invocation): Promise<PermissionRequestResult> => {
    if (assisted() && judgeApproved(request, invocation)) {
      return { kind: 'approve-once' };
    }
    const answer = await askPermission(permissionRequestOf(request));
    if (answer === 'deny') {
      return { kind: 'reject', feedback: 'The User denied this.' };
    }
    const forSession = sessionApprovalOf(request);
    return answer === 'allow-always' && forSession !== null
      ? { kind: 'approve-for-session', approval: forSession.approval }
      : { kind: 'approve-once' };
  };
}
