# CORRECTION-BRIEF template (Orchestrator-filled, no new content)

Authorship and the links-only correction exception are defined in `.planning/orch/workflows/EXECUTION_WORKFLOW.md`, Briefs. Corrections reuse already-approved text from Planner-authored or direct briefs. The Orchestrator fills this fixed template by linking existing artifacts only — it writes no new instructions, no findings content, no scope. Defective direct briefs follow that section's defect path, not this template. Any correction needing new content is a design/scope change and escalates per the revision loop (EXECUTION_WORKFLOW step 9), not a correction brief.

## C1 — For the executor (revision cycle)
- Package/lane id.
- The original task brief: link by path. Unchanged and authoritative; the revision addresses only the recorded blocking findings and their direct consequences.
- Links to the recorded findings: the review report path, and for each blocking finding the recorded reproduction artifact (exact command + output, failing test, hash or diff, or `path:line` relationship — per the evidence gate).
- Report path + the `EXECUTOR_AGENT.md` end-marker line and callback line.

## C2 — For the fresh reviewer (readiness check 5)
- The original review brief: link by path.
- The same links: the revision report, the recorded blocking findings and their reproductions.
- Report path + the `REVIEWER_AGENT.md` end-marker line and callback line.

## Rules inherited
Task-brief rules apply to C1 and review-brief rules to C2 via the originals (BRIEF_RULES.md); no routing/model/provider/family content, no hand-typed hashes, no verdict language or expected findings, no refusal authority.
