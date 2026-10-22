# PLANNER-BRIEF template (Orchestrator → planner)

Target size: ~40 lines. The Orchestrator fills each section; anything not listed here does not go into a planner brief. The planner's role is defined in `.planning/orch/agents/PLANNER_AGENT.md`; task and review briefs are written per `.planning/orch/workflows/templates/BRIEF_RULES.md`.

## P1 — Task (what to produce)
- Package/lane id, brief output path, exact end-marker line.
- Downstream report path (exact, passed verbatim to `orch_dispatch` `reportPath`) + the full outcome-marker set the report must carry.
- One paragraph of intent: what change and why. No implementation instructions.

## P2 — Evidence pointers (paths only, planner reads them)
- Plan/spec/decision/report/ledger paths the planner must ground the brief in.
- Base branch name + the command the planner must run to capture the head (`git rev-parse <branch>`); the planner pastes output, never retypes.

## P3 — Boundaries (explicit lists)
- Write ceiling (exact paths, or read-only with no repository writes).
- Explicit non-goals. Authorization held by Orchestrator (no live/cluster/Git unless stated).

## P4 — Contract shape to author
- Acceptance-row families the brief must contain, proof bounds to set, interpreter/PATH lines, report gate + marker, callback line.

## FORBIDDEN in planner briefs (gate rejects; Orchestrator never rewrites)
Routing/model/provider/family content of any kind; hand-typed commit hashes; review duties, verdict language, or correction-cycle counts; refusal authority on routing/model grounds.

## Planner's job (stated in every brief)
Verify every pin from live command output, write the brief to the output path, report each verification result. Do not verify test outcomes (reviewer's job). Do not soften duties.
