/**
 * Runs once when the server starts. In the Node.js runtime it starts
 * Autopilot, which also creates the Conversations module and so marks the
 * runs the previous server left behind as interrupted (ADR 0030).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }
  const { startAppAutopilot } = await import('./autopilot/app-autopilot');
  startAppAutopilot();
}
