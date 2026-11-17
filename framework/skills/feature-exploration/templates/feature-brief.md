# Feature Brief — <feature / assignment ID>

Working, noncanonical report. Store only at the assignment-authorized external report path, normally `/tmp/orch/<repo>/reports/`. Replace prompts with concise findings or a justified not-applicable note. Use the entry point's authority limits and the method's classification rules; this template grants no write or decision authority.

Report path: <authorized path>
Request/context reference: <human request and supplied inputs>
Repository snapshot/read set: <revision if available, exact authorized paths>
Status: <PENDING HUMAN CONFIRMATION | CONFIRMED DIRECTION; default PENDING>

## 1. Problem statement

- Who encounters the problem, in what context, and why does it matter now?
- Separate the observed problem from the requested mechanism. Cite evidence.
- Proposed reframe, if any: <rationale; original objective; human response or pending>

## 2. Desired outcome

- What observable outcome would count as success? Identify whose statement supports it.
- Goals, non-goals, and failure conditions: <current scope, not speculative future needs>
- What is confirmed versus still proposed about this outcome?

## 3. Current behavior and relevant code references

Describe the relevant entry points, behavior/data/state flow, boundaries, invariants, similar functionality, failures, and edge cases as needed. Cite inspected `path:line` or stable symbols and the snapshot. Distinguish facts from assumptions and unknowns.

| In-scope item read | Role/current behavior | Owner or generator | Evidence reference | Gap or limit |
| --- | --- | --- | --- | --- |
| <item> | <relevance> | <owner/generator or unknown> | <read location> | <unknowns> |

## 4. User scenarios and constraints

- Relevant user situations and expected behavior: <from evidence or human statements, not invented approvals>
- Functional requirements and technical, operational, compatibility, security, and authorization constraints: <sources and status>
- Touched settled decisions: <ID; full record reference; what it covers; what it does NOT cover>
- Missing full records: <input gaps; affected claims paused, not reopened decisions>

## 5. Assumptions and uncertainties

Separate verified facts, assumptions, and unknowns. For claims that need an experiment, use the method's four statuses.

| Claim | Status: documented / inferred / contradicted / unknown | Supporting or conflicting evidence | Impact if wrong | Question or proposed check |
| --- | --- | --- | --- | --- |
| <claim> | <status> | <reference and limits> | <effect> | <falsification criterion> |

For each proposed experiment, record the minimum data/read set, observable result, falsification criterion, permission needed, cost/risk, and stopping point. Record no guessed results. Link any selected Depth or Range method, its discipline, and why it fits.

## 6. Alternative approaches

Describe genuinely different viable directions when useful. Consider minimal/simple, balanced, and a justified ambitious option without forcing three. If one direction suffices, explain why. Cite why any otherwise plausible direction is incompatible with a settled constraint.

For each direction: <capability; boundary differences; present use case; evidence; assumptions; material unknowns>

## 7. Evidence and trade-offs

Compare expected benefits, functional requirements, maintainability, extensibility, complexity, implementation cost, operations, compatibility, risk, and evidence/uncertainty. Explain the criteria that matter most; justify irrelevant criteria instead of inventing differences.

| Criterion | Direction(s) and trade-off | Evidence reference | Observed fact, estimate, or hypothesis | Uncertainty that could change the choice |
| --- | --- | --- | --- | --- |
| <criterion> | <comparison> | <source> | <kind> | <gap> |

Read-only simplicity-gate assessment, when relevant: <present needs; necessary structure; cheaper adequate alternative; what to preserve>. This is an assessment, not an implementation handoff.

## 8. Recommended direction

- Proposed direction and reasons tied to the actual outcome and comparison: <recommendation, not an architectural approval>
- Why the simplest adequate approach is sufficient, or what present need justifies extra structure: <rationale>
- Conditions or missing evidence that could change this recommendation: <limits and next question>

## 9. Human feedback and confirmation status

- Feedback: <human words or faithful summary; message/reference/date; agent response>
- Direction actually confirmed: <exact direction/version, or NONE>
- Explicit confirmation evidence: <human statement and traceable conversation reference, or ABSENT>
- Confirmation scope: <what the human saw and confirmed; exclusions; conditions>
- Still unconfirmed, deferred, or unanswered: <list; preserve pending status>

A recommendation is not confirmation. Silence or an unanswered question leaves the direction pending. Finalize a confirmed-direction handoff only when the evidence above supports it. Confirmation here supplies no implementation authorization or canonical closure.

## 10. Unresolved decision candidates

Classify every open question using the method. Link a settled record instead of reopening it. Group related new decisions; order candidate groups by impact with reasons. This is not formal major/minor triage.

| Open question | Class: settled-elsewhere / new decision / implementation detail | Full settled record and coverage limit, if applicable | Candidate group / impact order and reason | Dependencies / evidence gap / next question |
| --- | --- | --- | --- | --- |
| <question> | <class and rationale> | <reference or input gap> | <group, or not applicable> | <limits> |

For each new-decision group, state the affected outcome or boundary and why its questions belong together. Explain why an implementation detail does not change direction or a settled boundary. Keep deferred and unanswered questions visible without marking them canonically resolved.

## 11. Handoff references

- This report and status: <authorized path; pending input request OR confirmed-direction handoff>
- Source evidence and full relevant settled-decision records: <references, not duplicated authoritative text>
- Human confirmation and scope: <section 9 reference; absent if pending>
- Unresolved grouped candidates: <section 10 reference; to Orchestrator for the Question Pool after direction confirmation>
- Input gaps, proposed experiments needing separate authorization, and stopping reason: <references>
- Next process: <existing Question Pool/Decision Workflow, then settled specification and Execution Workflow; no automatic execution>
