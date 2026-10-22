# TASK-BRIEF template (planner → executor, via Orchestrator gate)

Target size: ~60 lines. The planner fills each section per `BRIEF_RULES.md`; the Orchestrator gate checks, never rewrites.

## T1 — Objective
- Package id, one-paragraph objective, settled behavior with spec/decision pointers.

## T2 — Scope
- Base branch + captured head (pasted output). Worktree/branch convention for this lane.
- Worktree isolation: the executor works only in its own worktree and branch (per `EXECUTOR_AGENT.md`); the brief states the worktree/branch convention and never overrides this; merge-back is a separate assignment by a different worker.
- Exact write ceiling (paths). Protected files/actions. Explicit non-goals.

## T3 — Contract
- Numbered acceptance rows, each with its evidence (commands, receipts).
- Interpreter/PATH lines.
- Maintainability criteria + named skill paths where the plan requires them.

## T4 — Prohibitions
Prohibited actions for this package (live/cluster/Git/network/install/secret/customer as applicable; no-reviewer-contact; no scope expansion).

## T5 — Delivery
Report path + exact end-marker line (`IMPLEMENTATION_READY_FOR_REVIEW` / `IMPLEMENTATION_BLOCKED` / `BRIEF_REJECTED` per `EXECUTOR_AGENT.md`) + callback line. Risk tier.
