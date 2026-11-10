---
name: to-spec
description: "Turn the current conversation into a spec and publish it to the project issue tracker: a synthesis of what you've already discussed, with one check of the test seams."
disable-model-invocation: true
---

This skill takes the current conversation context and codebase understanding and produces a spec. Synthesize it from what you already know. The one thing you ask the user is the seam check in step 2; settle everything else from the conversation and the code.

The issue tracker and triage label vocabulary should have been provided to you. If not, tell the user to run `/setup-matt-pocock-skills`.

## Process

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the spec, and respect any ADRs in the area you're touching.

2. Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.

Check with the user that these seams match their expectations, in one question, and wait for the answer before writing the spec.

3. Write the spec using the template below, then publish it to the project issue tracker. Apply the `ready-for-agent` triage label - no need for additional triage. In Tandembike a spec is always an Epic, whatever its size: see "Publishing a spec" in `docs/agents/issue-tracker.md`, including the check of what changed in the target Project right before you publish. When the User names an existing Epic, fill it with the spec instead of publishing a new one, whether or not it already has children.

<spec-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts, not a working demo, just the important bits.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)
- Each browser check (`docs/agents/browser-checks.md`), on a screen and control the app has today, named as the user reaches them: "Escape on the Move to Cycle menu in the Board's selection bar". Read the code to confirm the control sits on that screen. A check for a case the app does not have yet is marked **future**, with the case it guards: the implementer runs it once that case exists, and builds nothing to reach it now.

## Out of Scope

A description of the things that are out of scope for this spec.

## Further Notes

Any further notes about the feature.

</spec-template>
