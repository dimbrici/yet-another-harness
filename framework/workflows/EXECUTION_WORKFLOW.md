# Task Execution Workflow

Settled work only. Unsettled questions go to `.planning/orch/workflows/DECISION_WORKFLOW.md` first.
Control-plane invariants (authorization, routing, risk) live in `.planning/orch/agents/ORCHESTRATOR_AGENT.md`.
The Architect's shared role definition is `.planning/orch/agents/ARCHITECT_AGENT.md`; this workflow defines its work with the Planner and execution packages.
Standalone, non-feature refactors — large one-time structural changes not triggered by a feature — follow
`.planning/orch/workflows/REFACTORING_WORKFLOW.md`, which reuses this lifecycle's roles, review contract,
ledger, and correction loop.

## Planner (conditional)

The Planner is required under `.planning/orch/agents/ORCHESTRATOR_AGENT.md`, Classification and planning. Its role definition is `.planning/orch/agents/PLANNER_AGENT.md`. Authorship and defective-direct-brief rework follow Briefs below. The Orchestrator supplies intent and evidence pointers; the checklist is `.planning/orch/workflows/templates/BRIEF_RULES.md`.

The planner partitions the settled specification (`.planning/specs`, produced by the decision workflow) into acceptance packages (Acceptance package lifecycle, step 1): each package the smallest slice that is independently useful, testable, and reviewable — small enough for the assigned executor route to deliver, big enough to be worth a review. Executor capability constrains package granularity only, not acceptance criteria, risk tier, or evidence. Where granularity and risk conflict, risk and the settled spec win. It never lowers the acceptance bar, which is fixed by the settled spec. The planner records the breakdown in a plan report (working artifact under the reports convention, cross-linked by ID; never canonical), surfaces spec doubt instead of improvising, and never redesigns.

**Spec-doubt sessions.** If the planner spots spec drift or ambiguity, the Orchestrator convenes a bounded session between planner and architect: one round per issue. The planner folds clarifications back into the plan report before any dispatch. The outcome is recorded as clarification (plan report updated; specs, decision log, and ledger unchanged — proceed) or as a genuinely new decision, which enters the Question Pool for normal triage — never bypassing it. The planner never improvises scope or design. The Orchestrator facilitates and records; it does not judge content.

## Briefs

This section governs execution-lane task briefs and review briefs. It does not change the Planner-brief template (Orchestrator to Planner) or decision-side briefs. `.planning/orch/workflows/templates/BRIEF_RULES.md` is the single checklist: required items, explicit skill and agent-doc paths (no auto-loading is ever assumed), and the forbidden list. Templates: `.planning/orch/workflows/templates/TASK-BRIEF-template.md` and `REVIEW-BRIEF-template.md`.

**Authorship.** When a trigger in `.planning/orch/agents/ORCHESTRATOR_AGENT.md`, Classification and planning holds, the Planner authors the task brief and the review brief. Otherwise, for simple, quick, clear, bounded work, the Orchestrator may author a direct task brief and review brief. This residual option is not mandatory. Short duration or small effort never overrides a trigger. Direct briefs follow the same checklist; review briefs carry package variables only, never verdict language or expected findings.

**Gate.** The Orchestrator checks a Planner-authored brief against `BRIEF_RULES.md`. It passes the brief or rejects it back to the Planner with a reason; it never rewrites it. For a direct brief, the Orchestrator checks its own brief against the same checklist before dispatch. This self-check is checklist conformance, not acceptance of the work. Independent review of the work is unchanged.

**Defective direct briefs.** The Orchestrator corrects a draft that fails the pre-dispatch self-check as part of drafting. If that failure shows the work is not clear and bounded, a Planner trigger holds and Classification and planning applies. A direct brief found deficient after it passed the self-check is not patched in place. The Orchestrator calls a Planner to intervene and rework it. The Orchestrator records the wrong judgment call to skip the Planner through its existing ledger responsibility (States and task ledger). An Executor's `BRIEF_REJECTED`, a Reviewer finding traced to the brief, or the Orchestrator's own later discovery can each start this path. The reworked brief is Planner-authored and must pass the Orchestrator gate above. Unresolved design returns to the decision workflow; Planner intervention never redesigns settled requirements. A brief defect never enters a correction-brief cycle.

**Correction exception.** Task and review briefs are Planner-authored or direct; corrections reuse already-approved text. The Orchestrator fills the fixed `.planning/orch/workflows/templates/CORRECTION-BRIEF-template.md` with links only: the original task brief plus recorded findings/reproductions for the Executor, and the original review brief plus the same links for a fresh Reviewer in a revision cycle. It adds no new instructions, findings content, or scope. Human authorization boundaries, independent Executor/Reviewer review and family separation at dispatch remain unchanged. No role, template, or approval gate is added.

Briefs stay concise: commands may be chosen within the authorized scope and recorded in the report; architecture is settled by the human-facing workflow. Before dispatch, the Orchestrator verifies baseline, scope, authorization, risk route, acceptance criteria, and provider readiness (Routing in the main document). For review dispatch, the brief follows `REVIEW-BRIEF-template.md` (package id, branch + base — never a commit hash, diff range, declared/protected files, contract rows, risk, report/marker, pointers to `REVIEWER_AGENT.md` and the review skill); executor/reviewer separation is checked only at dispatch, by model family, not provider, and applies only to that pair. The Orchestrator also checks the implementation report and worktree:

1. The report ends with `IMPLEMENTATION_READY_FOR_REVIEW`, and its body does not say BLOCKED, NOT IMPLEMENTED, or raise an open contract doubt.
2. The commit named in the report exists and the worktree has nothing uncommitted.
3. The executor is idle or gone (`orch_status`), and no revision cycle is running in that worktree.
4. The report has a claim for every contract item.
5. For a re-review, the report states how each recorded blocking finding was addressed.

Reviewer role boundaries, review-output criteria, and report sections are defined once in `.planning/orch/agents/REVIEWER_AGENT.md`.

## Executor (implementation role)

The Executor role and its shared authority are defined once in `.planning/orch/agents/EXECUTOR_AGENT.md`; this workflow defines the assignment-specific work.

### Worktree-isolated execution

Migration-style streams that must not disturb a live or in-flight workstream run one Git worktree per acceptance package, under a stated path, branched from a human-authorized checkpoint commit, with scope limited to listed paths. The Orchestrator authorizes and dispatches this worktree-per-package execution within the human-authorized Git boundary; the assigned worker performs the Git mutations. Worktrees are separate checkouts and never touch live systems or in-flight runs. The Orchestrator never creates, disposes, or switches worktrees, and never performs Git mutations itself. Merge-back is the package's **closing step**, never an independent assignment: it is performed by a worker after the package is `ACCEPTED`, in the recorded order (main document, Guardrails), and never by the Orchestrator. Worktree creation and merge-back are Git actions: separate explicit authorization, per the main document — which step 11's `auto` mode may supply **in advance** for a stated scope.

### Self-containment acceptance (promotion streams)

When a package promotes code into a new root, acceptance additionally requires: a clean scan showing zero outward references to the old location, including in comments; every import resolving entirely inside the new root; and the full test battery green from a clean checkout of the new root alone.

### Research boundary

Findings that require repository code or live/cluster/network action become execution packages; research never edits code and never substitutes for a package. A research brief attached as context to a plan does not settle scope and never lowers the acceptance bar.

## Acceptance package lifecycle

The Independent Reviewer role and its shared authority are defined once in `.planning/orch/agents/REVIEWER_AGENT.md`; this lifecycle defines package-specific review work.

1. **Size the package.** Review occurs once per coherent acceptance package, not once per executor checkpoint. A package ends at the smallest independently useful exercised behavior boundary — not an internal helper, file, or checkpoint — and may contain related executor checkpoints under one objective, authorization, risk, and ownership. There is no fixed file or task minimum; the package takes its highest actual consequence/risk.
2. **Include the first consumer.** When a helper, abstraction, schema, or foundation has a known first consumer, include that first integration in the same package whenever objective, authorization, ownership, dependencies, and reviewability permit; if the next package would mostly repeat the same behavioral tests or assumptions, merge them. The step-1 "smallest independently useful" boundary governs any merge-or-split call.
3. **Split when required.** Split for an unresolved decision, different authorization or ownership, live action, separate security boundary, substantially different objective, or loss of executor/reviewer comprehensibility.
4. **Keep the package provisional.** The executor keeps focused tests and boundaries green at checkpoints, but the package remains provisional until review. Review immediately before handoff to another owner, package, or downstream consumer — never between a foundation and its first integration inside one package (step 2) — or when a shared interface, HIGH risk, live/deployment/security/privacy/identity/authorization, concurrency/retry/cancellation/recovery, scope, or design boundary is crossed.
5. **Dispatch one fresh Independent Reviewer**, as defined in `.planning/orch/agents/REVIEWER_AGENT.md`, for the package (independence: main document), using the reviewer route current at dispatch time, not an assumed permanent model.
6. **Reviewer authority.** The reviewer may block only for: package-required behavior or tests; writable/owned files; explicitly protected files; authorization or prohibited-action violations; an unexpected file clearly attributable to the package; a flagged executor assumption that breaks requirements; or a blocking complexity/maintainability finding (step 7). Unrelated historical or pre-existing dirty-file differences are nonblocking observations. The reviewer reports PASS or FAIL to the Orchestrator.
7. **Simplicity and maintainability assessment.** The bar is defined once in `.planning/orch/agents/REVIEWER_AGENT.md` (Simplicity and maintainability bar); this step points to it. The reviewer assesses against that bar; "step-7 findings" and "the step-7 bar" in this workflow and the skill documents mean findings meeting it.
8. **Insufficient verdicts.** If the reviewer cannot produce a reliable verdict, or identifies a capability gap shown by the work itself, it reports `REVIEW_INSUFFICIENT` with the required capability and stops; it never reroutes or silently substitutes a model. The Orchestrator may then make one replacement assignment only if it stays within an existing route. Any change of route, provider, or model family is a routing change for the human. `REVIEW_INSUFFICIENT` is never a refusal on routing, model, provider, or family grounds. A rejected brief returns to the Orchestrator with the Executor's `BRIEF_REJECTED` marker (defined in `.planning/orch/agents/EXECUTOR_AGENT.md`). A defective direct brief follows Briefs, Defective direct briefs above, not a correction cycle. Spec doubt goes to the Planner spec-doubt session; a genuinely new decision goes to the Question Pool. A rejected brief is never a `HANDOFF_FAILED`, never silently substituted.
9. **Corrections (bounded revision loop).** A FAIL caused by a correctable same-scope mistake with no design or scope change enters a bounded revision loop the Orchestrator runs **without human involvement**:
   - **Evidence gate, not an assurance.** Before any cycle the Orchestrator records a reproduction of each blocking finding: the exact command and its output, the failing test, a hash or diff, or the concrete `path:line` relationship. A finding with no recorded reproduction is not actionable and triggers no revision. The gate leaves an artifact, not a claim — this is the primary control against acting on a false positive.
   - **Only objective findings may start a cycle:** a failing test, a violated invariant, a scope or authorization violation, a missing required evidence item, or a step-7 complexity finding that already meets the evidence bar. Taste, style preference, and "I would have written it differently" are recorded as NON-BLOCKING and never trigger a cycle.
   - **Deterministic evidence first.** Machine-checkable proof (test result, hash, diff, scope check) is required wherever it exists. LLM judgment is used only for genuinely subjective calls, which default to non-blocking.
   - One cycle = one fresh implementation assignment fixing only the recorded blocking findings, dispatched via `.planning/orch/workflows/templates/CORRECTION-BRIEF-template.md` (Orchestrator-filled, links only), followed by a fresh independent review dispatched under `.planning/orch/agents/REVIEWER_AGENT.md`.
   - **No test weakening.** A revision may never delete, skip, or relax a test, assertion, or invariant to make a failure disappear. Changing a test is itself a blocking review concern and is recorded.
   - The loop is capped at **three revision cycles per package**. The cap is a safety bound, not a target.
   - A revision addresses only the recorded blocking findings and their direct consequences; it never widens scope. NON-BLOCKING findings are recorded, not fixed in the loop.
   - Reviewer and coder never talk directly or form a standing pair. Reviewer authority is defined in `.planning/orch/agents/REVIEWER_AGENT.md`; every cycle is a normal Orchestrator dispatch and is audited like any other.
   - **Escalate to the human, and loop no further**, when: the cap is reached; the same blocking finding survives a cycle (no progress); coder and reviewer disagree on a finding; the fix needs a design or scope change; newly exposed ambiguity appears; or the next step is irreversible (merge, ledger, live action).
   - **Record the stop reason** for every loop exit — `completed | max_cycles | no_progress | disagreement | scope_change | escalated` — in the ledger, so a stall is visible rather than averaged away.
   - **Rollout posture (shadow first).** Until the human promotes it, the loop runs in **shadow mode**: the Orchestrator performs the evidence gate and proposes each revision cycle with its recorded reproduction, but a human authorizes the dispatch. Every gate decision — accepted or rejected, with its artifact — is recorded in the ledger. Promotion to unattended operation is a human call made on that record, not on a schedule.

   Repeated failure, a design/scope change, or newly exposed ambiguity escalates to the Orchestrator and, when needed, planner rework or the human.
10. **Acceptance.** A PASS verdict accepted by the Orchestrator means the package has **met its acceptance bar**; it does not by itself put the package's code into the shipping tree (step 11 does that). Dependent work unlocks only once its prerequisites are accepted **and, where a prerequisite ran in a worktree, integrated** — so a dependent worktree is always branched from a checkpoint that already contains what it depends on.
11. **Merge-back — the package's completing step, not a package of its own.** A package that ran in a worktree branch reaches the shipping tree only here, and only **after** step 10 accepts it: a PASS verdict comes first, and a FAILed or rejected package is never merged. The merge-back is therefore:
   - **the closing step of an already-planned package**, not a new acceptance package. It is never partitioned by the Planner as its own package, never carries its own acceptance bar, and is **not board work in the feature sense** — it is tracked as the package's closing state in the ledger, not opened as a separate task. Its method is settled by the package's own contract (branch, base, owned paths) plus live Git evidence at execution time; it needs no new plan.
   - **authorized in one of two modes, chosen by the human and recorded with the package in the ledger:**
     - **`auto`** — the human pre-authorizes the merge, for one package or a standing batch, so the step **fires as soon as the package is `ACCEPTED`**, with no further ask. Pre-authorization is real Git authorization: it must be explicit, recorded with its exact scope, and it never covers a package outside that scope.
     - **`pending`** — the human authorizes **each** merge explicitly after reviewing the acceptance.
     **Absent a recorded pre-authorization the mode is `pending`.** The default is fail-closed: an unrecorded, stale, or ambiguous authorization is never treated as `auto`.
   - **still a Git action under the main document's Git boundary**: performed by an assigned worker, never by the Orchestrator, in the recorded order — and it remains **separate explicit authorization** unless mode `auto` has already supplied it.
   - **verified like any other mutation**: a pre-merge run fixing the expected inventory the post-merge run must equal, the owned paths confirmed as the branch's exact delta, and a conflict reported as a blocker rather than resolved by discarding a side.
   - **expected to be a no-op for the acceptance bar.** A successful merge proves the tree still builds; it never substitutes for the package's review, and a green post-merge run cannot rescue a FAILed review.

## Markers

Marker formats are defined in the documents for the agents that emit them: `.planning/orch/agents/EXECUTOR_AGENT.md`, `.planning/orch/agents/REVIEWER_AGENT.md`, and `.planning/orch/agents/PLANNER_AGENT.md` (which defines `TASK_CONTRACT_READY: <ID> ARTIFACT=<path>`).

## States and task ledger

Execution states: `PLANNING` (when Planner work is needed; see `.planning/orch/agents/ORCHESTRATOR_AGENT.md`, Classification and planning, and Briefs above), `READY`, `AUTHORIZED`, `IMPLEMENTING`, `READY_FOR_REVIEW`, `REVIEWING`, `ACCEPTED`, `AWAITING_INTEGRATION` (accepted, worktree branch not yet merged — the resting state of a `pending` merge), `INTEGRATED` (step 11 done), `BLOCKED`, `ESCALATED`. `ACCEPTED` alone is not a finished package: a worktree package is finished only at `INTEGRATED`. The Orchestrator keeps a lean task ledger in `.planning/ledger` — package, state, date, report link — recording every package state transition through to `INTEGRATED` (a worktree package is finished there, not at `ACCEPTED`). Only the Orchestrator writes it; all other roles read. It sits alongside the decision log and the spec artifact (`.planning/decisions`, `.planning/specs`) and never amends them. Decision-item transitions are recorded in the same ledger by item ID (decision doc, States).
