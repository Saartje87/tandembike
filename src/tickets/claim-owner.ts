/** Who holds a Claim, as messages name them: `Name (run-1)` or `Agent run run-1`. */
export function claimOwner(
  agentRunId: string | null,
  agentName: string | null,
) {
  if (agentRunId === null) {
    throw new Error('A claimed Ticket must have an Agent run id.');
  }
  return agentName === null
    ? `Agent run ${agentRunId}`
    : `${agentName} (${agentRunId})`;
}
