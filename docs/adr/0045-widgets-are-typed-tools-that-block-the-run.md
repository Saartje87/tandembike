# Widgets are typed tools that block the run

Builds on [ADR 0019](0019-tandembike-starts-agent-runs.md), [ADR 0021](0021-runs-pre-allow-tandembike-tools.md) and [ADR 0037](0037-mcp-tools-follow-the-work.md).

Until now an Agent could ask the User only through AskUserQuestion's choice lists, which the chat showed as a form. The User prefers clicking to typing, and some questions are not a pick: a ranking, a placement on two axes, how much of something. A **Widget** is a typed question an Agent asks through a tool, which the chat shows as a control of its kind and which blocks the run until the User answers.

- **One way to wait on the User.** The runner seam's `askQuestion` becomes `askWidget(widget) → Promise<WidgetAnswer>`. AskUserQuestion is relayed as one choice Widget per question, in turn, through the same path, so a run waits on the User for a permission or a Widget and nothing else.
- **Kinds and answers.** `choice` (single or multi select, with `recommended` options preselected) answers `{ selected }`; `rank` answers `{ order }`; `matrix` answers `{ positions }` with each item's quadrant; `scale` answers `{ values }`. Any Widget may be answered `{ other: text }` or `{ skipped: true }`, and a run that ends first resolves `{ expired: true }`, so the Agent never mistakes a skip or an expiry for an answer. The shapes and the one check of an answer live in `src/conversations/widget.ts`.
- **Served in-process.** The Claude runner serves the Widget tools (`ask_choice`, `ask_rank`, `ask_matrix`, `ask_scale`) from an in-process SDK MCP server named `widgets`, added to every run beside the HTTP `tandembike` server and pre-allowed like it. MCP tools never reach `canUseTool`, so each handler awaits `askWidget` and returns the answer as JSON text: the blocking lives in the handler. The HTTP tool list (ADR 0037) does not change for Widgets, and no other process can answer one.
- **In the transcript.** A `widget` entry holds the Widget, its answer or null, and `expired`. While one is unanswered the Conversation is `waiting`, exactly as for a permission request, so the Board bell, Needs you, the Status line and the `waiting` Notice need no new kind. `answerWidget(conversationId, entryId, answer)` checks the answer against the Widget's kind and resumes the run; a Server Action calls it. Older `question` entries stay readable.
- **In every Conversation.** The run brief tells every Agent the Widget tools exist and to prefer them to a question in text whenever the answer is a pick, an order, a placement or an amount.

## Considered Options

- Block in `canUseTool`, as AskUserQuestion does: MCP tools are pre-allowed and never reach it.
- Serve the Widget tools on the HTTP `tandembike` server: the handler would have to find the live run of another request to block on, and the tool list would grow for every client, Terminal sessions included, which cannot show a Widget.
- Keep AskUserQuestion as its own path beside Widgets: two ways to wait, two transcript shapes and two forms to keep in step.

## Consequences

- A Terminal Conversation has no in-process server, so its Agent asks in the terminal as before.
- A new Widget kind is a shape and a check in `widget.ts`, a tool in `widget-server.ts` and a component in the chat; the transcript, waiting and Notices need nothing.
