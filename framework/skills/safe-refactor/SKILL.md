---
name: safe-refactor
description: Execute an already-approved refactoring as small, behavior-preserving increments with verification after each step. Use when a diagnosis (refactor-analysis, modularity-review, architecture-audit) has identified the target and the change is authorized. This is the toolkit's mutation skill. It does not invent a new architecture mid-implementation and does not mix unrelated cleanup into the change.
metadata:
  read-only: false
  mutates-code: true
  toolkit-stage: execute
---

# Safe Refactor

Refactor in the smallest coherent increments. Change structure without unintended behavior change.

## Boundary

This is the only mutating skill in the toolkit, and only within the authorized scope. If the diagnosis is missing or incomplete, stop and go back to it — do not improvise architecture here.

## Pre-flight (before the first edit)

1. **Behavioral invariants** — list what must stay the same (outputs, errors, side effects, ordering, persisted formats).
2. **Existing tests** — find the tests covering the area; note what they actually pin and what they do not.
3. **Validation commands** — the exact commands to build, format, lint, typecheck, and test this project. Read the repo (package manifest, Makefile, CI) rather than guessing.
4. **Baseline** — run them on the untouched revision and record the result. A red baseline is not your change's fault, but you must know it.
5. **Affected callers** — list imports, callers, and dynamic entry points before moving anything.
6. **Authorization and scope** — the change is approved and file ownership is clear.

## The loop

```
small change → format/lint → compile/type-check → targeted tests → next increment
```

Never make one large change and validate only at the end. If a step goes red, fix or revert that step before continuing.

## Behavior vs structure

- A structural refactor preserves externally observable behavior.
- If behavior must change, split it into a separate, clearly labelled change. Never hide a behavior change inside a structural one.

## Keep the change honest

Track the surfaces a move can silently break: imports · callers · tests · configuration · serialization · public APIs · CLI/interfaces · persisted formats · schemas · side effects · concurrency and ordering.

Inside the refactor itself:

- do not rename, move modules, change APIs, replace libraries, rewrite tests, reformat, and add a pattern in one step;
- do not touch unrelated code because you noticed it — record it as a follow-up instead;
- do not silently change a public API;
- do not introduce a new abstraction "while you are here".

## Use a pattern, not a new architecture

Pick a transform from `refactoring-patterns` with a small blast radius. If none fits, the diagnosis is incomplete — stop and re-diagnose.

## Verification (each increment and at the end)

1. Smallest relevant tests.
2. Typecheck / compile.
3. Lint / format check.
4. Import or dependency-boundary check if available.
5. Inspect the diff — confirm no unrelated change crept in.
6. For a move or split: prove no outward references to the old location remain (including comments), and imports resolve.

If a check cannot run, say so and why; do not present it as passing.

## Completion report

```
What changed:                         <files/symbols and the structural change>
What was deliberately left unchanged: <guardrails honored>
Tests/validation performed:           <exact commands + results>
Behavioral change:                    <none | separate labelled change>
Remaining risks:                      <what is not covered>
Follow-up opportunities:              <unrelated things noticed but not done>
```
