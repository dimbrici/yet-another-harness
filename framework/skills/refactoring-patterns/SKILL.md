---
name: refactoring-patterns
description: Advisory catalog of small, proven code transformations to choose from instead of inventing an architecture. Use after a diagnosis to pick the minimal behavior-preserving transform — extraction and inlining, moves, renames, parameter objects, encapsulation, plus simplification and removal transforms such as deleting wrappers, inlining interfaces, and removing premature extension points. States when each is justified and when it is not. Advisory only; it does not itself edit code and does not replace safe-refactor.
metadata:
  read-only: true
  toolkit-stage: choose-transform
---

# Refactoring Patterns

Choose a small, proven transformation instead of inventing new structure. Read `references/patterns.md` for the full per-pattern entries; this file is the selection guide.

## Boundaries

Advisory / read-only. `safe-refactor` performs the edit. Do not use a pattern to justify architecture the diagnosis did not call for.

## How to choose

1. Match the **problem signal** from the diagnosis to a pattern.
2. Prefer the smallest blast radius that removes the root cause.
3. Read "When NOT to use" before committing.
4. Prefer a **removal or simplification** transform over an abstraction-adding one. If removing structure removes the problem, that wins.
5. Re-check with `anti-overengineering`: does the result reduce concepts, indirections, and the number of files needed to understand the change?

## Bias

- Extraction is not progress by itself; a new abstraction must hide real complexity and simplify its callers.
- Duplicated code is not automatically a defect — duplicated *knowledge* is.
- `Replace Conditional with Polymorphism` is conservative: use it only for several stable, genuinely different behaviors, not a two-branch switch.
- `Replace Polymorphism with Conditional` is equally valid and often better when the hierarchy is ceremonial.

## Catalog index

**Reshaping.** Extract Function · Inline Function · Extract Class · Inline Class · Move Function · Move Field · Rename Symbol · Change Function Declaration · Introduce Parameter Object · Replace Primitive with Value Object · Encapsulate Variable · Encapsulate Collection · Split Phase · Combine Functions into Class · Combine Functions into Transform · Separate Query from Modifier · Replace Derived Variable with Query · Replace Constructor with Factory Function · Remove Flag Argument.

**Simplifying / removing.** Delete Wrapper · Delete Pass-through Layer · Inline Interface · Collapse Hierarchy · Remove Unnecessary Factory · Remove Premature Extension Point · Replace Custom Abstraction with Language Primitive · Replace Framework Mechanism with Simple Function · Replace Polymorphism with Conditional.

Each entry in `references/patterns.md` carries: problem signal · when to use · when NOT to use · minimal transformation · verification.

## Evidence rule

Name the pattern, the exact symbols, and the smallest transformation. "Apply Strategy pattern" is not an answer; "extract the two branch bodies into functions and pass one" is.
