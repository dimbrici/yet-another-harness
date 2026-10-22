# workflows-overview — evidence note

Diagram: `workflows-overview.svg`. Source (the only thing edited by hand): `workflows-overview.reladraw`.
Regenerate: `node ~/.pi/agent/skills/reladraw/dist/cli.js workflows-overview.reladraw -o workflows-overview.svg`
The layout is computed by the Reladraw engine from placement sentences ("below X", "right of Y"). No coordinates are written by hand.

Abbreviations: **ORCH** = `.planning/orch/agents/ORCHESTRATOR_AGENT.md`, **EXEC** = `.planning/orch/workflows/EXECUTION_WORKFLOW.md`,
**DEC** = `.planning/orch/workflows/DECISION_WORKFLOW.md`, **REF** = `.planning/orch/workflows/REFACTORING_WORKFLOW.md`,
**HERDR** = `.planning/orch/agents/HERDR_USAGE.md`, **ROUTE** = `.planning/orch/agents/orchestrator-routing.yaml`.

## Orchestrator and gates

| Diagram element | Source |
|---|---|
| Orchestrator = sole control plane; DOES classify / resolve dependencies / assign / gather evidence / mediate corrections / report | ORCH:3 |
| DOES NOT: repository edits, tests, Git mutations, live-cluster actions | ORCH:3; ORCH:11 ("the Orchestrator performs no Git mutations itself") |
| Accepts, blocks or escalates; never turns a worker into its own reviewer | ORCH:15 (last sentence) |
| Sole writer of `.planning/ledger` | EXEC:88; DEC:41 |
| Owns the tsk board (relays never write it) | HERDR:5 |
| Gate: repository edit needs explicit human authorization | ORCH:9 |
| Gate: Git, secrets, deployment, live cluster each need separate approval | ORCH:9 ("Git, secrets, deployment, and live actions always need separate explicit approval"); ORCH:11 |
| Gate: network none by default, per-brief authorization for research | ORCH:9 ("Research network access defaults to none and requires separate explicit authorization per brief"); ORCH:11 |
| Gate: Interlocutor closes only on explicit human confirm; batch approve / deny / amend | DEC:9; DEC:37 |
| Gate: human authorizes refactor scope before any edit | REF:38-39 |
| Gate: revision cycles need a human in SHADOW mode | EXEC:71 |

## Selection rule and the three workflows

| Diagram element | Source |
|---|---|
| CLASSIFY: settled -> execution; unsettled product/architecture -> decision; large one-off refactor -> refactoring | ORCH:7; ORCH:19; EXEC:3-6; REF:3-5 |
| Decision -> "settled spec feeds execution" edge | DEC:3 ("Produces the settled specification that task execution consumes"); EXEC, Planner (conditional). The edge reaches the brief-path selector, not a mandatory Planner. ORCH, Classification and planning owns the triggers; EXEC, Briefs owns authorship. |
| Refactoring "reuses execution roles, review, ledger, correction loop" | REF:5-6; ORCH:7 |

### Decision workflow

| Node / edge | Source |
|---|---|
| QUESTION POOL | DEC:9; DEC:13 |
| Research lane: human decides per item; read-only Researcher; one evidence brief | DEC:17; ORCH:31 |
| Architect triages major or minor; human may pull any item to major | DEC:9 |
| MAJOR: fresh Interlocutor discusses with the human | DEC:9; DEC:21 |
| MINOR: Decision Maker + one fresh Critic, one pass | DEC:9; DEC:25 |
| Architect conformance check (a) consistent with specs (b) correctly laned (c) complete enough | DEC:29 |
| Batch: human approves / denies / amends per item | DEC:37 |
| Architect integrates, sole writer of specs and decisions | DEC:41; DEC:37 |

### Execution workflow

| Node / edge | Source |
|---|---|
| Brief-path selector: Planner triggers outrank short duration or small effort | ORCH, Classification and planning owns the three triggers: multiple acceptance packages, cross-component work, high consequences or coordination (including HIGH risk). EXEC, Briefs owns the residual option and trigger precedence. Unresolved design goes to the decision workflow, not planning. |
| Planner branch: advisory, partitions settled spec, authors task and review briefs when required | ORCH, Classification and planning; EXEC, Planner (conditional) and Briefs; ORCH, Role independence. |
| Residual branch: Orchestrator MAY author direct task and review briefs; no mandatory Planner | EXEC, Briefs, Authorship. This branch is optional only after the triggers are excluded; it is not a shortcut for short work with a trigger. |
| Both branches: one BRIEF_RULES checklist; Planner-authored gate or pre-dispatch direct self-check | EXEC, Briefs, Gate; `.planning/orch/workflows/templates/BRIEF_RULES.md`. The self-check is not acceptance; independent review remains unchanged. A failed draft self-check returns to Orchestrator drafting; unclear or unbounded work returns to the Planner trigger rule (EXEC, Briefs, Defective direct briefs). |
| Defect branch: direct brief deficient after self-check; no in-place patch; Planner rework and Orchestrator gate | EXEC, Briefs, Defective direct briefs. Executor rejection, a Reviewer finding traced to the brief, or Orchestrator discovery can each start it. The Orchestrator records the wrong call through its existing ledger responsibility. This is not a correction cycle. The return edge ends at Planner authorship and then the same gate. |
| Correction briefs remain Orchestrator-filled and links-only | EXEC, Briefs, Correction exception and lifecycle step 9; `CORRECTION-BRIEF-template.md`. No new instructions, findings content, or scope. R1–R5 apply only to execution-lane task/review briefs, not Planner or decision-side briefs (EXEC, Briefs). |
| Implementation agent: fresh, one bounded assignment, edits in scope, never reviews itself | EXEC:34 |
| Independent Reviewer: fresh, read-only, different model family; PASS or FAIL, never repairs | ORCH:15; EXEC:56-57 |
| PASS accepted by the Orchestrator completes the package; dependents unlock | EXEC:74 |
| FAIL -> bounded revision loop (correctable same-scope mistake only) | EXEC:60 |
| Evidence gate: a reproduction recorded before any cycle | EXEC:61 |
| One cycle = fresh implementer fixing recorded blocking findings, then a fresh independent review | EXEC:64 |
| Cap of three cycles | EXEC:66 |
| SHADOW mode: human authorizes each cycle until promoted | EXEC:71 |
| ESCALATE: cap reached, no progress, disagreement, scope/design change, newly exposed ambiguity, irreversible step; stop reason recorded in the ledger | EXEC:69-70 |

### Refactoring workflow (steps 1-8)

| Node | Source |
|---|---|
| 1 Diagnose and scope (refactor-analysis discovery) | REF:31-34 |
| 2 Gate: anti-overengineering may REJECT | REF:35-37 |
| 3 Human authorizes scope; HIGH consequence by default | REF:38-40 |
| 4 Capture baseline (commit, git status, battery, golden output) | REF:41-42 |
| 5 Behavior-preserving slices; safe-refactor per slice | REF:43-45 |
| 6-7 Fresh reviewer per slice; full battery green at slice end | REF:46-54 |
| 8 PASS completes slice; merge-back is an authorized Git action, never an Orchestrator action | REF:55-56; ORCH:11 |

## Roles, independence, relay, states

| Diagram element | Source |
|---|---|
| Roles: planning, implementation, reviewer (execution side); architect, interlocutor, deliberation, research (decision side) | ORCH:31; ROUTE (role keys) |
| Deliberation = Decision Maker + Critic on one shared assignment | ORCH:31; DEC:25 |
| Research is read-only, one bounded brief per item | ORCH:31; DEC:17 |
| Model assignments are replaceable data in the routing file | ORCH:29; ROUTE:1-4. The diagram deliberately does not print model names. |
| Reviewer is a fresh agent from a different model family than the executor, never its exact model; verified at every dispatch | ORCH:15; ORCH:32 |
| Decision-side pairs separate by fresh context, not family | ORCH:15 |
| No silent fallback; stop, record, ask the human | ORCH:34 |
| Bad or missing routing file: stop before dispatch | ORCH:35 |
| Relay is a plain watch-only script, no model, no tokens, watches ONE agent, wakes the orchestrator when the agent settled AND the report exists | HERDR:5 |
| RELAY_EVENT with settled / blocked / error; deduplicated by task ID | ORCH:48; ORCH:50; ORCH:57 |
| Orchestrator verifies exact marker, complete report, baseline + scope, authorization, actual agent state | ORCH:48 |
| `idle` or `done` is proof; `blocked`, `unknown`, disappearance, or an unverified local claim is not | ORCH:48 |
| Decision-side agents call back directly with a marker, no `--wait` | ORCH:52 |
| States PLANNING (when Planner work is needed), READY, AUTHORIZED, IMPLEMENTING, READY_FOR_REVIEW, REVIEWING, ACCEPTED, BLOCKED, ESCALATED | ORCH, States and stop conditions; EXEC, States and task ledger. Conditional PLANNING points to ORCH, Classification and planning and EXEC, Briefs, including Planner rework. |

## Deliberate omissions and caveats

- **No arrows between states.** ORCH:65 and EXEC:88 only list the states ("lightweight states such as"). They do not define a transition table, so the diagram does not invent one. It shows the chips in source order and says so in its caption.
- **Board ownership is not drawn as a human gate.** The documents make the Orchestrator the owner of the tsk board (HERDR:5). No document says the human gates it, so it appears in the Orchestrator box.
- **Left out because the documents are too detailed or conditional to draw faithfully:** risk tiers (ORCH:21-25), provider readiness check (ORCH:33), the sandbox pre-proof gate (ORCH:40), spec-doubt sessions (EXEC:13), worktree execution (EXEC:38-40), minor-lane conflict and return budget (DEC:31-33), the minor batch cap (DEC:37: "default cap: the 4 most relevant, adjustable"), Herdr tab hygiene (HERDR:7), `REVIEW_INSUFFICIENT` and `BRIEF_REJECTED` (EXEC:59), `HANDOFF_FAILED` (ORCH:44), and the decision-item state list (DEC:57-59). Their detail would crowd the picture and they are not needed to understand the main flow.
- **MEMORY.md** and `.planning/workflow/` were read. They hold operational facts and board tooling, and nothing in them was used as a diagram source.
- The authorship rows use section anchors because source edits move line numbers. Other line receipts remain historical; this package does not repair unrelated overview claims.
- This overview describes source policy, not activation. Consumer/global propagation is separate; source alignment does not complete spec A7 or close T214.
- Diagram text and edges describe the two authorship paths and Planner rework. Arrangement statements express intent, not verified visual layout.
