import { describe, expect, it } from 'vitest';

import { createTestTickets } from '../test/tickets';

describe('the Tickets facade', () => {
  it('offers the same functions, by name, as before the split into areas', () => {
    const tickets = createTestTickets();

    const names = Object.keys(tickets).sort();

    expect(names).toMatchInlineSnapshot(`
      [
        "abandonWork",
        "activeCycle",
        "addAttachment",
        "addBlocker",
        "addComment",
        "addExternalReferences",
        "addLabels",
        "addReferenceTemplate",
        "approveTriage",
        "archiveCycle",
        "archiveProject",
        "archiveTicket",
        "archiveTickets",
        "attachTicketsToEpic",
        "autoMergesSince",
        "backToTodo",
        "claimMergeMode",
        "claimTicket",
        "clearTicketClaim",
        "completeTicket",
        "createCycle",
        "createProject",
        "createTicket",
        "createTicketBatch",
        "deleteTicket",
        "detachFromEpic",
        "detachTicketsFromEpic",
        "discardCycle",
        "editComment",
        "findProjectIdOfFolder",
        "findTickets",
        "getAttachment",
        "getCycle",
        "getMachineSettings",
        "getProject",
        "getProjectAgentCommands",
        "getProjectAgentSettings",
        "getStats",
        "getTicket",
        "getTriageProposal",
        "isCycleComplete",
        "latestTriage",
        "linkPullRequest",
        "listActivity",
        "listBlockers",
        "listComments",
        "listCycles",
        "listLabels",
        "listProjects",
        "listReferenceTemplates",
        "listTickets",
        "moveTickets",
        "moveTicketsToCycle",
        "moveTicketsToEpic",
        "moveToEpic",
        "nextWork",
        "openTicketCounts",
        "pendingTriage",
        "pendingTriageNumbers",
        "planTicket",
        "planTickets",
        "proposeTriage",
        "rejectTriage",
        "releaseTicketClaim",
        "removeAttachment",
        "removeBlocker",
        "removeComment",
        "removeExternalReferences",
        "removeLabels",
        "removeReferenceTemplate",
        "renameCycle",
        "renameProject",
        "reorderTicket",
        "reorderTickets",
        "resolveProjectId",
        "restoreProject",
        "restoreTicket",
        "setAcceptanceCriteriaChecked",
        "setMachineSettings",
        "setProjectAgentCommands",
        "setProjectAgentSettings",
        "sortLane",
        "startCycle",
        "startWork",
        "styleProject",
        "subscribe",
        "transaction",
        "uncheckedCriteria",
        "unplanTicket",
        "unplanTickets",
        "updateReferenceTemplate",
        "updateTicket",
        "updateTickets",
      ]
    `);
  });

  it('offers only functions', () => {
    const tickets = createTestTickets();

    const notFunctions = Object.entries(tickets)
      .filter(([, value]) => typeof value !== 'function')
      .map(([name]) => name);

    expect(notFunctions).toEqual([]);
  });
});
