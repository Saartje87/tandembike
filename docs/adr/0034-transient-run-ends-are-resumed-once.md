# A run that ends on a transient error is resumed once

Amends [ADR 0030](0030-autopilot-dispatches-the-active-cycles-ready-work.md). Decided on 2026-11-08 (T1191) and built in phase 7 of [`software-factory-2.md`](../roadmap/software-factory-2.md) (T1193).

ADR 0030 never retries: a failed run waits in Action needed for the User, so a failing run cannot spend money over and over. For an unattended Cycle that also means one API overload stops a Ticket until the User looks.

Tandembike now classifies how a run ended. A **transient** end is an API overload, a rate limit or a network error. A **substantive** end is anything else: failing checks, a question, a refusal, a crash in the Agent's own work. A transient end is resumed once, after a backoff, as a reply sent by Autopilot, and stays inside the Project's Start run limit and the Spend ceiling. A second transient end, or any substantive end, waits for the User as before.

## Considered Options

- Keep no retries: safe, but the factory stalls on errors nobody needs to judge.
- Retry every failure a few times: a run failing on its own work would spend repeatedly on the same Ticket, the reason ADR 0030 chose no retries.

## Consequences

- The Run outcome records the classification, so Stats show how often runs end transiently.
- The resume counts as Started by Autopilot even when the User started the Conversation, and only if Autopilot is on.
