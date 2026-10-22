---
name: refactor-analysis
description: Read-only refactoring judgment in two modes. "discovery" (before a refactor) decides whether and how to improve existing code — blast radius, root cause, invariants, risk, not-to-change. "review" (after an implementation) scopes to the change and judges whether it introduced, worsened, or preserved design problems, classifying findings BLOCKING, NON-BLOCKING, or NO ACTION. Finds duplication, coupling, low cohesion, unclear ownership, oversized units, scattered behavior, and hidden dependencies. Does not edit code.
metadata:
  read-only: true
  toolkit-stage: diagnose
---

# Refactor Analysis

Read-only refactoring judgment. In **discovery** mode it decides whether a refactor is warranted and what the safe boundary is (before a refactor). In **review** mode it judges whether an implementation just made the design better or worse (after a change). It never edits production code.

> Existing code is innocent until proven guilty. Name the friction before proposing change.

## Boundaries

- Read-only. Use `read` and read-only `bash` inspection (`rg`, `git log`, `git blame`). Tests may be run to observe behavior, never to mutate.
- If you cannot cite a file or symbol, you have not diagnosed it; keep looking or report the limit.
- Do not design the final structure here. Boundary design is `modularity-review` / `architecture-audit`; execution is `safe-refactor`.

## When to use / not

Use when: a refactor is requested; an area is repeatedly hard to change; a review flagged structural debt; before any `safe-refactor`.
Do not use for: a single local bug fix; naming-only or formatting cleanup; a change that already has an approved, evidenced plan.

## Modes

Select the mode in the brief or instruction; default is `discovery`. The two modes answer different questions and must not be blurred.

### mode: discovery — before a refactor

Broadly explore an implementation to decide whether and how it should change. The question you own: *how should this improve?* Follow the full Method below. Include dead or obsolete code in scope here.

### mode: review — after an implementation

The implementation now exists. The question you own: *did this change introduce, worsen, or preserve design problems that should affect acceptance?* Do **not** re-audit the repository. Scope to the change:

- changed files and symbols;
- affected callers and consumers;
- new or removed abstractions;
- changed boundaries and dependency direction;
- nearby code the change now impacts.

If the change is a 30-line function, the review scope is roughly that function and its callers. Widen only when the change touches a shared boundary, and hand off to `architecture-audit` only then.

Review mode classifies every finding:

- **BLOCKING** — do not accept without refactoring. Examples: duplicated business logic introduced by this change; a responsibility placed in the wrong module; serious new coupling; an unnecessary abstraction that materially obscures behavior. A structural finding is blocking only at the workflow bar: concrete evidence + tangible maintenance/testability/reliability cost + a materially simpler alternative (EXECUTION_WORKFLOW step 7).
- **NON-BLOCKING** — acceptable, but a useful cleanup opportunity. Record it; do not force another implementation loop.
- **NO ACTION** — a theoretical refactor that would not materially improve the code. State it once, briefly, and do not pursue it.

Only BLOCKING findings return work to the coder. Do not manufacture findings; a clean change is a valid review result.

## Method

1. **Scope and context.** Identify the owned area, its callers, its tests, and recent changes (`git log --oneline -- <path>`). Read the code and nearby conventions before judging it.
2. **Find friction with evidence.** Look for duplication; coupling; low cohesion; unclear responsibility; oversized functions/classes/modules; behavior scattered across files; feature envy; a module knowing too much; primitive obsession; uncontrolled state mutation; hidden dependencies; hard-to-test seams; unstable interfaces; inconsistent abstractions; needless indirection; dead or obsolete code.
3. **Separate the layers.** For each candidate write: `symptom` (what is observed) → `root cause` (the structure producing it) → `proposed intervention` (smallest change that removes the cause). A symptom without a root cause is not a finding.
4. **Quantify blast radius.** List direct callers, indirect consumers, tests, persisted formats, CLI/config surfaces, and public exports that would move or change.
5. **State invariants.** What observable behavior must not change? What do tests actually pin? What is only assumed?
6. **Rate risk.** LOW = local, covered by tests. MEDIUM = crosses one boundary, tests need updating. HIGH = public API, persisted data, concurrency, or no test coverage.
7. **Find the smallest boundary.** Propose the smallest set of files/symbols that can change together without a temporarily broken state.

## Evidence rules

Every finding cites `path:line` or `path:symbol` and shows the concrete relationship, not a smell name. If a claim rests on "no caller", prove it and check dynamic entry points (`__main__`, argparse, plugin/registry, string dispatch, docs, CI) before calling something dead.

## Output contract

```
Refactoring target:        <short name>
Problem:                   <observable friction, in plain terms>
Evidence:                  <path:line / symbol references>
Root cause:                <the structure producing the problem>
Affected code:             <files/symbols that would change>
Blast radius:              <callers, consumers, tests, formats, external surfaces>
Behavioral invariants:     <must not change>
Recommended transformation: <smallest change; direction, not a full design>
Risk:                      <LOW|MEDIUM|HIGH + why>
Expected simplification:   <what gets easier; before/after factors>
Things explicitly NOT to change: <guardrails against over-refactor>
Confidence:                <supported | needs_verification>
```

When several targets exist, rank them and mark each `Strong | Worth exploring | Speculative`. Cap the list at what is real; a clean area is a valid result.

In **review** mode add one line per finding:

```
Classification: <BLOCKING | NON-BLOCKING | NO ACTION>
```

Review mode may also conclude:

```
NO REFACTORING FINDINGS — <why the change is structurally sound>
```

If the area is reasonable, say so explicitly:

```
NO REFACTORING RECOMMENDED — <why the current shape is justified>
```

## Anti-patterns

- "This violates SOLID/DRY" with no maintenance consequence.
- Recommending a pattern or layer as a default.
- Counting lines instead of naming a responsibility.
- Treating passing tests as proof of a better design.
- Proposing a rewrite when a local change removes the cause.
- Calling code dead without checking dynamic entry points.

## Hand-off

- Boundaries or abstractions in question → `modularity-review`.
- Cross-module or subsystem seams, dependency direction, or a change touching a package, layer, component, interface, shared state, or module ownership → `architecture-audit` (review mode only when that is true).
- A proposed change needs a simplicity gate → `anti-overengineering`.
- An approved, evidenced target → `safe-refactor` with a chosen `refactoring-patterns` transform. The reviewer recommends; it never executes this.
