/**
 * Calls a Server Action from the UI and never rejects: a throw, rather than
 * a returned refusal, is logged and becomes `{ ok: false, error: fallback }`,
 * so the caller shows it like any refusal (T1186).
 */
export async function callAction<T extends { ok: boolean }>(
  call: () => Promise<T>,
  fallback: string,
): Promise<T | { ok: false; error: string }> {
  try {
    return await call();
  } catch (thrown) {
    console.error(thrown);
    return { ok: false, error: fallback };
  }
}
