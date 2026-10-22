# REVIEW-BRIEF template (Planner-authored or direct → Reviewer)

Short, package-specific. The reviewer's standing rules — output criteria, finding classes, report sections, skill modes — live in `.planning/orch/agents/REVIEWER_AGENT.md`; this brief carries only the package variables. Written per `.planning/orch/workflows/templates/BRIEF_RULES.md`. Authorship, the gate and self-check, and defective-direct-brief handling follow `.planning/orch/workflows/EXECUTION_WORKFLOW.md`, Briefs.

## R1 — Package identity
- Package/lane id.
- Base branch name + the base the diff runs against. Never a commit hash: the reviewer runs `git rev-parse` itself, records the commit in its RC1 header, and the Orchestrator compares it with the implementation report (mismatch = baseline drift, stop).

## R2 — Change under review
- Diff range (branch + base, stated as a range to reproduce from live commands).
- Declared/owned files and protected files, as explicit lists.

## R3 — Contract rows
- The contract-item inventory copied from the task brief: identifiers, concise item text, one row per item; and the risk tier.

## R4 — Report and marker
- Report path.
- Exact end-marker line: `REVIEW_COMPLETE: <ID> RESULT=<PASS|FAIL> REPORT=<path>`, or `REVIEW_INSUFFICIENT: <ID> REQUIRED_CAPABILITY=<capability> REASON=<reason> REPORT=<path>` per `REVIEWER_AGENT.md`.
- Callback line to the Orchestrator.

## R5 — Pointers
- `.planning/orch/agents/REVIEWER_AGENT.md` (standing review rules, RC1–RC12, report sections).
- Review skill: `.planning/orch/skills/reviewing-code-modularity-skill/SKILL.md`, Mode A.
- Refactoring reviews additionally name the skills and modes listed in `REVIEWER_AGENT.md`.

## FORBIDDEN in this brief (gate rejects; see BRIEF_RULES.md)
Routing/model/provider/family content; hand-typed commit hashes; verdict language or expected findings; refusal authority on routing/model grounds.

## Revision-cycle variant
For a re-review, the Orchestrator dispatches via `CORRECTION-BRIEF-template.md`: the original review brief plus links to the recorded findings/reproductions, no new content.
