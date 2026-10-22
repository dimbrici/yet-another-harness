# Standalone Refactoring Workflow

For a large, one-time structural refactor that is **not** triggered by a feature package. Feature-driven
refactoring stays in `.planning/orch/workflows/EXECUTION_WORKFLOW.md` and rides the same lifecycle as the
feature it serves. This workflow reuses the same roles, routes, review contract, ledger, and correction
loop as ordinary execution; only the trigger and the acceptance evidence differ.
Control-plane invariants live in `.planning/orch/agents/ORCHESTRATOR_AGENT.md`.

## When this workflow applies

- The human asks for a structural change to existing code with no new behavior.
- A diagnosis (`refactor-analysis` discovery mode, `architecture-audit`, or a structural finding) proposes
  a refactor, and the human accepts it as worth doing on its own.
- A technical-debt backlog item is the entry point for a standalone refactor: diagnosis at Step 1 turns
  the accepted item into a scoped refactor plan and execution package. A backlog entry or selection is not
  edit authorization; the human must still authorize scope at Step 3. The Orchestrator tracks item state in
  `.planning/ledger`, while the Architect's backlog ownership is defined in
  `.planning/orch/agents/ARCHITECT_AGENT.md`; its proposed content register remains subject to the
  Orchestrator's ruling.

It does **not** apply to a refactor that is part of delivering a feature (in-scope work in that feature's
package) or to a direction that is still open (route to `DECISION_WORKFLOW.md` first). No new role or route
is introduced. Executor and Independent Reviewer role definitions are in
`.planning/orch/agents/EXECUTOR_AGENT.md` and `.planning/orch/agents/REVIEWER_AGENT.md`; this workflow defines
the refactoring work.

## Difference from feature packages

- There is no feature spec and no new behavior to build.
- The acceptance criterion is **behavior unchanged plus measurable simplification**. The burden of proof is
  behavior preservation: existing tests, captured golden/differential evidence, and the invariants named in
  diagnosis.
- Because the whole point is to change structure without changing behavior, a slipped behavior change is
  the primary failure mode and scope creep (unrelated cleanup) is the secondary one.

## Steps

1. **Diagnose and scope.** `refactor-analysis` in discovery mode names the target, symptom, root cause,
   blast radius, invariants, risk, the not-to-change list, and the smallest boundary; `architecture-audit`
   when the change crosses packages, layers, or ownership. The result is a refactor plan report (a working
   artifact, never canonical).
2. **Gate.** `anti-overengineering` reviews the plan and may REJECT it. Reject speculative, architecture-
   cosplay, or non-measurable refactors; a refactor that cannot state a measurable simplification does not
   proceed.
3. **Authorize.** The human authorizes the refactor scope (owned paths) before any edit. A large refactor is
   HIGH consequence by default. Initiation is a human call.
4. **Capture the baseline.** Record the baseline commit and a byte-identical `git status`, the full validation
   battery and its current result, and golden output for any behavior not covered by tests. This is the
   reference the whole refactor is measured against. (`safe-refactor` pre-flight requires the same.)
5. **Split into coherent slices.** Break the plan into small, independently reviewable, behavior-preserving
   slices that each leave the tree green. Per slice, `safe-refactor` runs small change → format/lint →
   compile/type-check → targeted tests.
6. **Review each slice for behavior preservation.** A fresh Independent Reviewer verifies: the named
   invariants hold; no behavior change slipped in; the claimed simplification actually happened (structure
   changed, not merely moved); no unrelated cleanup or scope creep; and no unjustified new abstraction,
   indirection, or configuration. Applicable reviewer skills are defined in
   `.planning/orch/agents/REVIEWER_AGENT.md`; this workflow specifies the behavior-preservation checks.
7. **Full battery at slice end.** Each accepted slice leaves the full validation battery green from a clean
   checkout, and the final slice reproduces the captured baseline behavior (differential or golden evidence)
   — not merely passing targeted tests. A green run must never be obtained by weakening, skipping, deleting,
   or relaxing a test: behavior preservation is proved against the captured baseline, not an edited test.
8. **Acceptance and merge.** A PASS completes the slice. Merge-back is an authorized Git action in a recorded
   order, never an Orchestrator action, exactly as for worktree execution.

## Failure and rollback

A slice that breaks behavior is reverted to the last known-green baseline, not patched further forward;
revert is an authorized Git action. A correctable same-scope mistake follows the bounded revision loop in
the Execution Workflow (step 9). A design or scope change, a repeated failure, or newly exposed ambiguity
escalates like any other execution work.

## Markers and ledger

Reuse the execution markers. Add `REFACTOR_BASELINE_CAPTURED: <ID> COMMIT=<sha> REPORT=<path>` after step 4.
Package states, the ledger, and the one-writer rules are unchanged from the Execution Workflow.
