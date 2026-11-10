/**
 * Finds UI files that call a Server Action without `callAction`
 * (`src/app/lib/call-action.ts`), so a thrown action would reject unhandled
 * instead of showing as a refusal (T1325).
 *
 * `files` maps a path to its source; `allowlist` maps a path to why that file
 * is safe without `callAction`. Returns one message per problem: a file that
 * bypasses `callAction` and is not allowlisted, or an allowlist entry that is
 * stale or gives no reason. It checks a file as a whole: one `callAction`
 * passes the file, so review still catches a second, direct call in it.
 */
export function actionCallerProblems(
  files: Record<string, string>,
  allowlist: Record<string, string>,
): string[] {
  const problems: string[] = [];
  const bypassing = new Set(
    Object.keys(files).filter((path) => bypassesCallAction(files[path])),
  );
  for (const path of [...bypassing].sort()) {
    if (!(path in allowlist)) {
      problems.push(
        `${path} imports a Server Action but never calls callAction; route each call through callAction, or add it to the allowlist with why it is safe`,
      );
    }
  }
  for (const [path, reason] of Object.entries(allowlist).sort()) {
    if (!bypassing.has(path)) {
      problems.push(
        `${path} is on the allowlist but no longer needs to be: remove it`,
      );
    } else if (reason.trim() === '') {
      problems.push(`${path} is on the allowlist without a reason`);
    }
  }
  return problems;
}

/** A value import (not `import type`) from a Server Action module. */
const actionImport =
  /import\s+(?!type\b)[^;]*?from\s+'[./]*app\/(?:[^']*\/)?actions'/;

function bypassesCallAction(source: string): boolean {
  return actionImport.test(source) && !/\bcallAction\(/.test(source);
}
