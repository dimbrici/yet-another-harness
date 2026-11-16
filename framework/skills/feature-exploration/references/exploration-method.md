# Exploration Method

Use this method under the boundaries in [the entry point](../SKILL.md). The nine activities are available territory, not nine mandatory full passes. Combine, skip, or revisit activities according to the request and the evidence. Keep outputs short enough for the human to challenge.

## Effort and evidence

Select effort by ambiguity, novelty, architectural impact, risk, available evidence, user feedback, and alternative complexity. A familiar filter option may need one behavior trace and a recommendation. A bounded choice between existing patterns may need a moderate comparison. A configurable workflow with uncertain state or persistence boundaries may justify deeper investigation. These examples describe proportionality, not validation results.

[E05] Skip exploration or use a light pass for a well-grounded request; stay out of task-brief construction and tool hardening.

Maintain evidence references as you read. Use `path:line` or a stable symbol and revision where available. Cite report sections and full decision records for non-code evidence. Distinguish observed facts, assumptions, and unknowns. Model recall is unverified context, not a basis for a consequential conclusion. Conflicting evidence stays visible.

## 1. Understand

Read the request, supplied context, and relevant settled inputs before asking about them. Identify the user, problem, desired outcome, success conditions, constraints, non-goals, and what would make the feature fail despite working technically. Separate the requested mechanism from the outcome it serves.

[E02] Identify each settled decision the request touches, cite its full record, and state what that decision does not cover.

A missing closure record is an input gap, not evidence that the matter remains undecided. Ask for the missing input through the Orchestrator before relying on it. Do not infer settlement from a summary alone.

Ask the highest-value missing question in the user's terms. Explain what its answer would change. Build questions on the actual request, the last answer, or a concrete finding. Prefer a focused question to a questionnaire; offer a short choice only when it helps the human respond. Do not ask questions that the available evidence already answers.

**Output:** a concise problem/outcome statement, known constraints, touched-decision limits, and the next material uncertainty.

## 2. Investigate

Start with existing repository read/search tools within the authorized set. Find the relevant entry points and trace behavior, data transformations, state changes, and outputs as needed. Read the important files themselves rather than relying on search hits or another summary.

[E03] Inventory the relevant in-scope items by reading them, including who owns or generates each item.

Include configuration, generated artifacts, consumers, and similar functionality when relevant. Record the owner or generator and its evidence; mark unknown ownership explicitly. Trace boundaries, dependencies, invariants, failure handling, and edge cases that could change the direction. Check current behavior against tests and documentation by reading them; running tests is a different action subject to authorization.

**Output:** an evidence-linked map of current behavior, relevant items and ownership, reusable patterns, constraints, assumptions, and unknowns. Limit the map to what can affect this exploration.

## 3. Challenge the framing

Apply Altitude from [the ambition reference](ambition-framework.md). Examine the outcome beyond the proposed mechanism, embedded assumptions, symptoms versus causes, simpler possibilities, larger useful outcomes, and artificial implementation constraints.

Offer a reframe as a proposal: explain the evidence and ask whether it serves the human's intent. Keep the original objective visible until the human explicitly changes it. A useful reframe can lead to less implementation, not more.

**Output:** a framing to discuss, with its rationale and any unconfirmed change clearly marked.

## 4. Investigate deeply

Select Depth methods only where uncertainty could materially change the recommendation. Consult the ambition reference for method selection. Inspect raw evidence, technical constraints, invariants, algorithms, comparable implementations, failure cases, and edge cases as relevant. For stateful workflows, a transition model or compatibility analysis may be useful; neither is mandatory for every request.

State the claim, the evidence needed, and what would falsify it. Seek a check outside the proposing model's confidence. An authorized document may supply evidence; a needed probe is not a result.

[E04] Classify claims that need an experiment as documented, inferred, contradicted, or unknown; propose the experiment instead of guessing its result.

Use **documented** for a claim directly supported by cited evidence, **inferred** for a reasoned but untested extension, **contradicted** for a claim opposed by evidence, and **unknown** for an unresolved claim. Record the supporting or conflicting reference and its limits. A documented historical result does not prove a new environment behaves identically.

For a proposed bounded experiment, name its question, minimal read/data set, expected observable result, falsification criterion, action permissions, cost/risk, and stopping point. Route execution needs to the Orchestrator for separate authorization and the existing execution process; do not run the experiment through this skill. Do not replace missing evidence with exhaustive research by default.

**Output:** stronger evidence for relevant claims, or an explicit question/proposed experiment and its remaining uncertainty.

## 5. Broaden intelligently

Use Range only when an adjacent discipline offers a useful method. Name the discipline, the method, the uncertainty it addresses, and why that method fits. For example, database transaction analysis can expose unsafe concurrent state updates; HCI task analysis can expose a mismatch between workflow settings and user tasks.

Apply the method to actual evidence. Drop it if it adds no decision-relevant insight. Use [the ambition reference](ambition-framework.md) for other examples and source limits, not as a requirement to consult every discipline.

**Output:** a relevant new insight or testable hypothesis, with the method and reason; otherwise omit this activity's report detail.

## 6. Develop alternatives

When choices matter, develop genuinely different directions. Consider a minimal/simple option that reuses current behavior, a balanced option, and an ambitious direction only if a real outcome justifies it. Differences must affect capabilities, boundaries, or trade-offs, not merely names. Do not force three options for a trivial feature or when one direction is reasonable.

Eliminate options that conflict with settled decisions or known constraints, citing why. If evidence is too weak to propose feasible alternatives, ask the blocking question first. Assess simplicity with the gate linked in the entry point when the proposal is nontrivial. Preserve useful modularity and current extension needs without speculative frameworks or generic abstractions.

**Output:** a small set of viable directions with benefits, costs, and evidence limits, or one justified simple direction.

## 7. Compare

Compare each viable direction against expected benefits, functional requirements, maintainability, extensibility, complexity, implementation cost, operational implications, compatibility, risk, and evidence/uncertainty. Explain which criteria matter most to the stated objective. Mark an irrelevant criterion with a reason rather than inventing a difference.

Use the template's evidence and trade-off section. Tie consequential claims to sources. Distinguish estimated costs and hypothesized benefits from observed results. Prefer the least complex direction that meets the actual constraints; explain any necessary extra structure with a present use case.

**Output:** a concise comparison and provisional recommendation with reasons, disqualifiers, and uncertainty that could change it.

## 8. Synthesize and discuss

Present the problem, material findings, meaningful alternatives, trade-offs, recommendation, and important unresolved questions. Use plain language before optional technical detail. Invite correction, challenge, or further exploration. Discuss one material uncertainty at a time instead of requiring answers to a long list.

Reflect the human's feedback accurately. Keep agent proposals separate from human statements. If feedback changes the objective or constraints, record its scope and revisit only affected findings. Ask explicitly which direction the human confirms and which parts remain open. A general positive reaction must not become approval of details the human did not see.

**Output:** a working synthesis plus recorded feedback and confirmation evidence, or a clearly pending brief with the next question. Apply the entry point's stopping rule instead of repeatedly collecting low-value evidence.

## 9. Handoff

Use [the feature brief template](../templates/feature-brief.md) at the authorized external path. Keep authoritative records as references, not copied truth. Its eleven sections can be brief; mark a section not applicable with a reason instead of manufacturing content.

[E01] Classify every open question as settled-elsewhere, new decision, or implementation detail; group related new decisions and order candidates by impact.

This classification prepares candidates; it is not formal major/minor triage. For settled-elsewhere, cite the full record and its coverage limit. For a new decision, state the question, group, affected outcome/boundary, dependencies, evidence gap, and reason for its impact order. For an implementation detail, explain why it does not change the direction or a settled boundary; leave execution choices to the existing process. Escalate uncertain classification rather than deciding architecture.

Before finalizing, check that the recorded confirmation names the actual direction, evidence, and scope. List what remains unconfirmed, deferred, or unanswered. Without explicit confirmation, deliver only the pending working report and input needs. With confirmation, hand the report and unresolved candidates to the Orchestrator for the existing Question Pool. No state transition, canonical closure, brief construction, or implementation occurs here.

**Output:** a traceable pending report or confirmed-direction handoff, grouped and impact-ordered candidates, and links to the evidence and relevant settled records.
