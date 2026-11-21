# How it works

Start with the [README](../README.md) for purpose, requirements, and placement; use the [glossary](glossary.md) for definitions.
The [overview diagram](workflows-overview.svg) is a high-level guide, not the detailed operating policy.
The linked framework sources below own the rules, including qualifications that an overview cannot show.

## Roles before procedures

The [Orchestrator](../framework/agents/ORCHESTRATOR_AGENT.md) is the control plane: it classifies work, resolves dependencies, assigns workers, gathers evidence, and reports.
It does not perform delegated repository edits, tests, Git mutations, or live-system actions.
It owns the ledger and local `tsk` board, rather than delegating their state changes to relays.

The [Planner](../framework/agents/PLANNER_AGENT.md) writes contracts for settled work; it does not design new behavior, judge results, or control workers.
The [Executor](../framework/agents/EXECUTOR_AGENT.md), named `implementation` in routing, alone edits code, within its contracted files and assignment.
It works in its own branch and worktree, commits only owned paths, and never merges its own work or pushes.
The [Independent Reviewer](../framework/agents/REVIEWER_AGENT.md) checks one committed package read-only and writes its external review report.
It never repairs the work; disposable copies are permitted for authorized probes.
The reviewer uses a fresh context and a different model family from the Executor, never the same exact model.
The Orchestrator checks that separation at dispatch; it is not a worker's refusal decision.

The [Architect](../framework/agents/ARCHITECT_AGENT.md) owns specifications, decisions, and maintainability assessment, but does not edit code or dispatch agents.
The Interlocutor discusses a major decision with the human.
The Decision Maker proposes a minor decision; one fresh Critic appends a critique rather than rewriting the proposal.
Those two roles share the `deliberation` assignment and have no human contact or canonical-write authority.
The Researcher supplies one read-only evidence brief per requested item; it does not decide.
Decision-side pairs require fresh contexts, not different model families.
Their procedures are in the [Decision Workflow](../framework/workflows/DECISION_WORKFLOW.md).

## Choose one of three workflows

Unresolved product or architecture questions use the Decision Workflow.
Settled requirements use the [Execution Workflow](../framework/workflows/EXECUTION_WORKFLOW.md).
A large, one-time structural change without a feature trigger uses the [Refactoring Workflow](../framework/workflows/REFACTORING_WORKFLOW.md).
Refactoring needed by a feature stays within that feature's execution package.
An unresolved design is a decision problem, not a reason to send work to a Planner.

### Decision: turn questions into settled requirements

Open questions enter the Question Pool.
The Architect records whether each item is major or minor; the human may promote any item to major.
Only the human may demote an item.

The human decides whether each item needs research. For researched items, Architect triage requires the human's recorded informed disposition of the evidence brief.
The Orchestrator presents the question, facts, uncertainties, options, and trust summary before requesting that disposition.
Research is offline by default, uses prior evidence first, and has one question, one brief, and one pass.
A needed code, cluster, container, or network experiment becomes a separately authorized execution package; the Researcher names it and stops.
New questions in research findings become pool items only through an Architect or human call.

The Interlocutor closes a major decision only after explicit human confirmation: approval, rejection with deferral, or an exact-text amendment.
The Architect checks every major and minor artifact for specification consistency, correct lane, and enough detail to integrate.
Claims that rely on research must trace to documented facts, reproducible output, or authorized external sources, not unlabelled model recall.
Architect dissent is recorded; the human prevails on a confirmed major decision.

The minor lane permits one proposal and one critique, not an open-ended debate.
Architectural conflict promotes to major; the Architect rules on non-architectural conflict with recorded reasons.
Minor items share one return budget across conformance conflict and batch denial; a denied item never receives a second return.
After that budget is consumed, architectural conflict promotes; a denied non-architectural item is terminal unless the human promotes it.
Re-entry after terminal denial requires a new pool item.

The human approves, denies, or exactly amends each minor item before the Architect integrates the approved batch scope.
The Architect orders batches by relevance, normally up to four items, with dependencies attached.
It rechecks coherence after vetoes; orphaned items move to a later batch with a ledger note.
An amendment that raises a new architectural question promotes the item to major.
The Architect alone integrates approved specifications and decision entries.
If the Architect is unavailable or stalled, decision work stops; another role cannot assume its judgments or writes.

### Execution: deliver a bounded change

A package is the smallest independently useful, testable, reviewable slice of settled work, not necessarily one file or checkpoint.
A known first consumer belongs with its helper when scope, authorization, dependencies, and reviewability permit.
Different permissions, ownership, security boundaries, objectives, or unresolved decisions can require a split.

A Planner is required for multiple acceptance packages, cross-component work, or high consequences or coordination, including high risk.
Otherwise, the Orchestrator may write direct task and review briefs for simple, quick, clear, bounded work.
Small effort never overrides a Planner trigger.
Both paths use [the brief checklist](../framework/workflows/templates/BRIEF_RULES.md).
The Orchestrator checks Planner-authored briefs without rewriting them; direct drafts receive its pre-dispatch self-check.
A direct brief found deficient after that check goes to Planner rework, not an in-place patch or correction cycle.
A Planner's specification doubt gets one clarification round with the Architect; a genuinely new decision returns to the Question Pool.

Before dispatch, the Orchestrator checks baseline, owned paths, authorization, acceptance requirements, and service readiness.
The Executor implements only that brief, records checks and assumptions, and reports its committed work.
An impossible or contradictory brief stops work; it is not permission to redesign.
The Orchestrator checks report completeness, commit existence, clean worktree, and worker state before review dispatch.
The Independent Reviewer checks required behavior, evidence, scope, authorization, and maintainability against the contract.
A reliable verdict is `PASS` or `FAIL`; inability to provide one is `REVIEW_INSUFFICIENT`.
The Orchestrator can make one replacement review assignment within an existing route; a route change returns to the human.

A correctable same-scope failure may enter a bounded correction loop.
First, the Orchestrator records a concrete reproduction of every blocking finding; an unsupported finding cannot start a cycle.
A cycle uses a fresh implementation assignment, then fresh independent review, limited to recorded blocking findings and direct consequences.
The [correction template](../framework/workflows/templates/CORRECTION-BRIEF-template.md) links existing briefs, findings, and reproductions; it adds no instructions or scope.
Tests and invariants must not be weakened to obtain a passing result.
The limit is three revision cycles, not a target.
No progress, disagreement, changed scope or design, new ambiguity, the cap, or an irreversible next step stops the loop and escalates.
The ledger records the stop reason.

Until the human promotes unattended operation, the human must authorize every revision dispatch after the Orchestrator records its evidence gate.
This shadow mode qualifies the otherwise unattended correction-loop procedure.

A passing review accepted by the Orchestrator establishes acceptance, not integration into the shipping tree.
The human must authorize integration separately, or explicitly pre-authorize its exact scope in the recorded `auto` mode; otherwise approval remains `pending`.
After acceptance, an assigned different worker performs merge-back as the package's closing step, never as a new acceptance package.
The Orchestrator never merges; conflicts stop the assigned worker instead of authorizing discarded changes.
Dependent work unlocks only after prerequisites are accepted and any prerequisite worktree changes are integrated.

### Refactoring: change structure, preserve behavior

Standalone refactoring reuses the execution roles, independent review, ledger, and bounded correction loop.
Diagnosis names the problem, affected boundary, invariants, risk, and things not to change.
The simplicity gate may reject a speculative plan or one without measurable simplification.
The human must approve the standalone refactor's owned paths before any edit; selecting backlog work is not edit authorization.
The baseline includes the commit, unchanged status, validation results, and golden output for behavior not covered by tests.
Small behavior-preserving slices use the named refactoring skills and verification between changes.
Each slice receives fresh review and the full validation battery from a clean checkout.
A behavior-breaking slice returns to the known-good baseline through an authorized Git action, rather than being patched forward.
Acceptance requires unchanged behavior plus measurable simplification; merge-back still needs the execution workflow's authorization.

## Human gates and safety boundaries

The human must explicitly authorize the exact repository-edit scope before edits; standing bookkeeping and approved-batch exceptions are limited as described below.
The human must separately authorize each Git action and its exact scope, including staging, commits, worktree operations, and merge-back.
The human must explicitly authorize reading a secret for that exact case; workers must not search for alternative credentials.
The human must give separate explicit approval for deployment; permission to edit files does not include deployment.
The human must separately approve live actions, including live-cluster mutations; repository authorization does not cover them.
The human must separately authorize network access; research network permission must be explicit in each brief and defaults to none.

Approving the workflow supplies standing authorization for Orchestrator ledger writes and Architect sole-writer bookkeeping.
It also covers batch-approved integration exactly as approved, only in the approved specification and decision scope, never implementation edits.
Those exceptions do not grant Git, secret, deployment, or live-action permission.

Before edits, workers inspect a non-secret baseline and preserve unexplained or pre-existing changes.
Each file has one writable owner.
Baseline drift, unexpected changes, requirement conflict, secret exposure, unauthorized actions, or unresolved ambiguity stop affected work.
Policy instructions are not a complete security sandbox; a tool's presence does not grant permission to use it.
For configuration with live-cluster effects, policy additionally requires bounded offline proof of the exact artifact before deployment.

## The control loop and completion signals

The repeated control loop is: classify, check authority, assign, collect evidence, verify outcome, then accept, block, or escalate.
The routing [assignment file](../framework/agents/orchestrator-routing.yaml) selects replaceable model-service data, not role authority or risk policy.
The [shared lookup](../framework/helpers/routing_lookup.py) supplies assignments to both launch paths.
The [dispatch extension](../pi-extensions/orch-dispatch.ts) checks service availability, passes an explicit model selection, and reads the actual session model.
Invalid or unavailable assignments stop dispatch rather than silently selecting a fallback.
Policy separately requires the Executor and reviewer family-separation check.

`orch_dispatch` starts work and arms a watch-only relay; `orch_status` reads live state, session model, and report checks.
`orch_stop` requests retirement and checks disappearance before closing a pane.
The generated relay checks report existence, expected marker, freshness against its arm stamp, and a state other than working before signalling settlement.
That last condition is weaker than verified completion: the Orchestrator must inspect the full report, baseline, scope, authorization, and actual worker state.
Only verified `idle` or `done` supports completion; blocked, unknown, disappearance, silence, or a timeout does not.
A relay cannot approve work, update the board, retry the assignment, or kill its worker.

Markers are recognizable outcome strings, such as `IMPLEMENTATION_READY_FOR_REVIEW`, not proof that acceptance requirements passed.
`IMPLEMENTATION_BLOCKED` records inability to finish; `BRIEF_REJECTED` identifies a contradictory or impossible brief.
`TASK_CONTRACT_READY` identifies a Planner handoff; `REVIEW_COMPLETE` and `REVIEW_INSUFFICIENT` identify review outcomes.
`REFACTOR_BASELINE_CAPTURED` identifies the recorded refactoring baseline; `HANDOFF_FAILED` is reserved for terminal inability to meet acceptance safely.
A generic report ending might read `IMPLEMENTATION_READY_FOR_REVIEW: <ID> REPORT=<path>`; actual assignments supply their identifier and report location. Decision handoffs use `DECISION_ARTIFACT_READY`, `CRITIQUE_APPENDED`, `CONFORMANCE_COMPLETE`, `BATCH_PRESENTED`, and `EVIDENCE_BRIEF_READY` for decisions, critique, conformance, batch presentation, and research respectively.

Planning, implementation, and independent review use the Orchestrator-owned relay, with no worker callback required.
Decision-side handoffs instead actively prompt the registered Orchestrator with the appropriate marker, without waiting for its response.
Callback submission and `RELAY_EVENT` both trigger verification; neither establishes completion.
The [inbox implementation](../pi-extensions/lib/orch-events.mjs) retains event files, but claims them before live delivery.
A crash between claim and delivery can leave retained evidence without a live notification; delivery is not guaranteed.

For long local commands, `run_command` returns a run folder while a separate command watcher reports completion, stalls, crashes, or excessive duration.
It watches the command, not the worker; time alerts do not kill, retry, extend, or approve work.
The foreground watchdog reports open tool calls that are silent or too long; it also takes no corrective action.
These mechanisms are in [command handling](../pi-extensions/run-command.ts) and [the watchdog](../pi-extensions/tool-watchdog.ts).

## Records and advisory material

Consumer `.planning/specs/` holds living specifications; consumer `.planning/decisions/` holds append-only decisions and separately typed process records.
The Architect alone writes both; supersession adds a linked decision entry and rewrites the affected specification section.
Consumer `.planning/ledger/` records package and decision-item state under the Orchestrator's sole ownership; it never amends specifications or decisions.
Briefs define assignments, while reports collect evidence outside the decision log and consumer planning directory.
The default runtime-state root is `/tmp/orch/<repo>/`, with relay scripts, inbox, command runs, and adjacent reports.
`ORCH_HOME` can relocate that root; the [state resolver](../pi-extensions/lib/orch-home.mjs) defines the convention.
The Architect's proposed debt-register location is not an established record home.

The advisory [feature exploration skill](../framework/skills/feature-exploration/SKILL.md) can prepare a pending report or a human-confirmed direction and unresolved candidates.
The Orchestrator document routes it: one fresh agent in the existing Interlocutor role holds the conversation as an interim arrangement, and the human types in that agent's pane.
It grants no implementation or canonical-write authority; human direction confirmation does not supply execution permission.
Generic exploration input and the per-item Researcher lane do not activate that separate conversation route.
For source ownership and installed-versus-consumer paths, return to the [README](../README.md); definitions remain in the [glossary](glossary.md).
