---
name: anti-overengineering
description: Read-only gate that stops a code or refactoring change from making a repository more complicated. Use before approving or implementing a non-trivial refactor or design change to check it against deletion-over-abstraction, no speculative abstractions, interface justification, no pattern-driven development, no unnecessary layering, no configuration for hypotheticals, and measurable simplification. It can reject a proposed refactor. Does not edit code.
metadata:
  read-only: true
  toolkit-stage: gate
---

# Anti-Overengineering

The goal of refactoring is lower cognitive complexity, not more architecture. This skill evaluates a proposed change and is willing to reject it.

## Boundary

Read-only. Evaluate and report; do not implement. When it approves, the change still goes through `safe-refactor`.

## Rules

### 1. Prefer deletion over abstraction
Before creating something, ask: can code simply be removed? can an existing abstraction absorb this responsibility? can ordinary language or framework features express it?

### 2. No speculative abstractions
Extensibility is allowed only for a current, named use case — never "we might need it later".

### 3. Interfaces need justification
An interface is justified by at least one of: multiple meaningful implementations; an important architectural boundary; external-dependency isolation; independently testable behavior; a stable public contract. A one-implementation interface is fine only when one of these clearly applies.

### 4. No pattern-driven development
Do not introduce Factory, Builder, Strategy, Repository, Mediator, Adapter, Facade, Command, Visitor, event bus, or plugin system unless a concrete present problem makes it useful. Structural resemblance to a textbook example is not a reason.

### 5. No unnecessary layering
Flag `A → B → C → D` where each layer mostly forwards. Ask whether fewer boundaries would improve locality.

### 6. No configuration for hypotheticals
Prefer simple explicit behavior over a generic configurable mechanism unless multiple real configurations exist now.

### 7. Optimize concepts, not LOC
Fewer lines is not simpler; more lines is not worse. Weigh concept count, indirections, files needed to understand behavior, states, abstractions, dependencies, and required reader knowledge.

### 8. Preserve useful duplication
Distinguish duplicated **code** (may be fine) from duplicated **knowledge** (implies a single owner). Do not DRY unrelated concepts together.

### 9. Require measurable simplification
For a non-trivial refactor, compare before and after on: concept count · dependency count · API surface · indirection · files touched for a common change · cyclomatic complexity · state complexity · testability · locality. If the result is not clearly simpler, recommend rejecting the refactor.

## Output contract

```
Proposal evaluated:   <what is being proposed>
Verdict:              APPROVE | APPROVE WITH CHANGES | REJECT
Rule(s) engaged:      <which of the 9>
Evidence:             <path:line / structure sketch>
Complexity delta:     before vs after on the listed factors
Cheaper alternative:  <the simplest change that solves the real problem>
What to keep:         <existing structure that should not be touched>
Confidence:           <supported | needs_verification>
```

`REJECT` is a valid, expected outcome. "The code is fine as-is" is success, not a failure to find work.

## Anti-patterns

- Approving a refactor because the new code "looks cleaner".
- Treating more structure as more rigor.
- Requiring an abstraction because a pattern exists.
- Blocking a genuinely local simplification out of caution.
