---
name: modularity-review
description: Read-only review of whether module boundaries and abstractions make the code easier to understand and change. Use when a file or module "does too much", layers only forward calls, an abstraction feels ceremonial, or a boundary is unclear. Classifies abstractions as useful, questionable, or worth deleting, and finds missing boundaries and misplaced responsibilities. Reduces complexity without architecture cosplay. Does not edit code.
metadata:
  read-only: true
  toolkit-stage: diagnose
---

# Modularity Review

Reduce real complexity. Do not add architecture ceremony to look sophisticated.

The deep reference this skill adapts is vendored at `../reviewing-code-modularity-skill/`. Read the relevant numbered entries in `references/red-flags.md` and the tradeoffs in `references/principles.md` before making a broad claim; do not recite them.

## Boundaries

Read-only. Findings only. Execution belongs to `safe-refactor`.

When used in a post-implementation review, scope to the changed files, their callers, and the boundaries they touch — not the whole repository.

## Core test for every abstraction

1. What complexity does it hide?
2. Would the code be easier to understand if it disappeared?
3. Does it provide a stable boundary?
4. Are callers simpler because it exists?

If the honest answers are "none / yes / no / no", it is a deletion candidate.

## What to inspect

- module boundaries and responsibility placement;
- cohesion and coupling;
- dependency direction (who imports whom);
- public surface and information hiding;
- locality of behavior (how many files to understand one change);
- module depth (small surface, real work behind it) versus shallow modules;
- duplicated concepts and repeated structural decisions;
- abstractions spread thin across many files;
- abstractions that only forward calls;
- interfaces with no meaningful boundary;
- modules that exist only as structural ceremony.

Special attention to a **shallow module**: a wide or pass-through surface with little behavior. A chain `Controller → Service → Manager → Repository` is not automatically wrong, but each hop must earn its place.

## Classify, do not just criticize

Produce five lists:

- **Useful abstractions** — keep; say why.
- **Questionable abstractions** — cost today, possibly premature.
- **Abstractions worth deleting** — smallest removal and what changes.
- **Missing boundaries** — behavior leaking across an owner.
- **Misplaced responsibilities** — code living with the wrong owner.

Do not blindly recommend merging layers either. Fewer files is not automatically simpler; locality and ownership matter.

## Output

For each finding: severity (high / medium / low), `path:line`, the mechanism (change amplification, leakage, shallow module, low locality, reversed dependency), the smallest useful fix, and — when over-refactor risk is real — **what not to change**. Cap the list at what is real. A clean module is a valid outcome.

## Anti-patterns

- Splitting by line count.
- Recommending Clean Architecture, DDD, hexagonal layering, SOLID-heavy layering, repositories, factories, adapters, or DI as defaults.
- Proposing a broad rewrite for a local problem.
- Merging duplicated-looking code whose concepts may evolve separately.
- Presenting style taste as a defect.

## Hand-off

Cross-module or subsystem concerns → `architecture-audit`. Simplicity gate → `anti-overengineering`. An approved change → `safe-refactor`.
