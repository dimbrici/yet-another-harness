---
name: architecture-audit
description: Read-only architecture-level review across module, package, and subsystem boundaries. Use for dependency direction, architectural seams, data and state ownership, cyclic dependencies, change propagation, and modules turning into dumping grounds. Proposes incremental boundary changes with migration steps, compatibility concerns, and a verification strategy. Does not assume Clean Architecture, DDD, hexagonal, CQRS, repositories, or service layers. Does not edit code.
metadata:
  read-only: true
  toolkit-stage: diagnose
---

# Architecture Audit

Evaluate structure that crosses ownership boundaries. Architectural patterns are tools, not goals. Require a demonstrated problem before introducing one.

## Boundaries

Read-only. This is broader than `modularity-review`: it looks at seams *between* components, not inside one module.

Run it during a review only when the change touches a package, layer, component, interface, dependency direction, shared state, or module ownership. A local change inside one module does not need an architecture audit.

## What to inspect

- architectural seams and where they leak;
- dependency direction and cycles;
- subsystem responsibilities;
- domain boundaries and where they are crossed;
- data ownership (who may read or write what);
- state ownership and lifetime;
- component interfaces and their stability;
- cross-cutting concerns (logging, config, auth, errors) applied ad hoc;
- change propagation (one change touching many components);
- unstable or leaky abstractions;
- shared modules turning into dumping grounds.

## Concepts to use

Deep modules (small stable surface, substantial implementation), information hiding, seams, locality, explicit ownership, and dependency inversion **where a present problem justifies it**. Deep reference: `../reviewing-code-modularity-skill/references/principles.md`.

## Do not prescribe by default

Clean Architecture, Hexagonal / Ports-and-Adapters, DDD, CQRS, repositories, service layers, factories, event buses, plugin systems. Recommend one only when the evidence shows the problem it solves, and state what it costs.

## Method

1. Map the current dependency structure for the area (who depends on whom, in which direction).
2. State the concrete problem the structure causes today (change amplification, cycle, ownership violation, unstable seam).
3. Propose the desired dependency structure and why the new boundary is better.
4. Give incremental migration steps — no big-bang rewrite; each step leaves the system working.
5. List affected modules and compatibility concerns (public APIs, persisted formats, config, CLI, running consumers).
6. Define the verification strategy: which tests or commands prove each step preserved behavior.

## Output contract

```
Current dependency structure:   <sketch + evidence>
Problem:                        <today's cost, not a hypothetical>
Desired dependency structure:   <sketch>
Why the new boundary is better: <mechanism>
Migration steps:                <ordered, each independently safe>
Affected modules:               <list>
Compatibility concerns:         <APIs, data, config, consumers>
Verification strategy:          <commands/tests per step>
Risk and reversibility:         <LOW|MEDIUM|HIGH; how to back out>
Things NOT to change:           <guardrails>
Confidence:                     <supported | needs_verification>
```

If the architecture is sound, say so: `NO ARCHITECTURAL CHANGE RECOMMENDED`.

## Anti-patterns

- Pattern-first recommendations.
- A rewrite where an incremental seam fixes the cycle.
- Invented domain boundaries not present in the code.
- "We might need it later" as justification.
- Ignoring persisted formats, running consumers, or public APIs in the migration.

## Hand-off

Single-module boundary questions → `modularity-review`. Simplicity gate → `anti-overengineering`. An approved migration → `safe-refactor`, one step at a time.
