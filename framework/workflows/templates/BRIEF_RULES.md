# BRIEF_RULES — how to write execution and review briefs

This document is the single construction checklist for task and review briefs, whether Planner-authored or direct. Authorship, the gate and self-check, and defective-direct-brief handling live in `.planning/orch/workflows/EXECUTION_WORKFLOW.md`, Briefs. It is policy: changes need human approval plus independent review. The "Task brief" and "Review brief" sections below are each marked; the task-brief rules also govern correction briefs for the executor (inheritance below). The planner brief (Orchestrator → planner) is not governed here; it keeps its own short forbidden lines in its template `.planning/orch/workflows/templates/PLANNER-BRIEF-template.md`.

## Task brief — required items

Every task brief (and every correction's original brief) carries exactly these items:

1. Objective and settled behavior.
2. Writable/owned boundaries and protected files/actions.
3. Acceptance checks and proportionate evidence.
4. Prohibited actions.
5. Risk tier (risk never selects a model; see `.planning/orch/agents/ORCHESTRATOR_AGENT.md`).
6. Callback/report requirements (exact marker line, report path).

Correction briefs inherit these rules: the original task brief plus links to the recorded findings/reproductions, filled by the Orchestrator with no new content.

## Review brief — required items

Every review brief carries the package-specific variables only — standing review rules live in `.planning/orch/agents/REVIEWER_AGENT.md`:

Package id; branch + base (never a commit hash); diff range; declared/owned vs protected files; contract rows; risk; report path and exact marker; pointers to `REVIEWER_AGENT.md` and the review skill (below). Which items apply is marked per brief; correction reviews reuse the original review brief plus finding links.

## Explicit skill and agent-doc paths (no auto-loading)

- Implementation briefs reference the code-quality skill: `/Users/domenicoimbrici/.pi/agent/npm/node_modules/@firstpick/pi-skill-code-quality/skills/code-quality/SKILL.md`.
- Reviewer briefs reference the independent review skill: `.planning/orch/skills/reviewing-code-modularity-skill/SKILL.md`, Mode A (diff review), alongside the review requirements in `REVIEWER_AGENT.md`.
- Refactor work names the specific skill paths and modes (`refactor-analysis` review vs discovery, `safe-refactor` only for an authorized executor assignment). Agent role boundaries live in the role docs: `.planning/orch/agents/PLANNER_AGENT.md`, `.planning/orch/agents/EXECUTOR_AGENT.md`, `.planning/orch/agents/REVIEWER_AGENT.md`.

## Forbidden list (a brief containing any of these fails the gate)

- Routing, model, provider, or family content of any kind.
- Hand-typed commit hashes. Pin capture is branch name + pasted command output, never retyped. The reviewer records the commit in its header; the Orchestrator compares it with the implementation report and stops on mismatch as baseline drift.
- Verdict language or expected findings.
- Refusal authority on routing/model grounds for any agent.
- Overriding role-doc invariants (executor worktree isolation, reviewer read-only).

## Gate behavior

Both authorship paths use this checklist. Apply `.planning/orch/workflows/EXECUTION_WORKFLOW.md`, Briefs, for the Planner-authored gate, the direct-brief self-check, and the defective-direct-brief path. That section owns the behavior; this document adds no checklist or gate.
