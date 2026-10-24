# Epics group Tickets for one-unit handoff

An Epic is a Ticket type fixed at creation, with one level of same-Project children, a Status always derived from them, and a Claim that covers them; it is delivered on one branch and PR. We rejected a separate container (it would duplicate description, comments, Activity and Claims), a mutable type (a derived Status makes conversion ambiguous), and keeping one PR per child (it stacks PRs for work that is one deliverable).
