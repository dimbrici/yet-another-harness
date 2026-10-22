# Decision-Making Workflow

Produces the settled specification that task execution consumes.
Control-plane invariants live in `.planning/orch/agents/ORCHESTRATOR_AGENT.md`. Output artifacts live
under repo-root `.planning/` (created if missing).

## Decision chain (exact)

Open questions enter a QUESTION POOL. The Architect triages each item major or minor — it owns content, so it owns the call; triage is recorded, and the human may pull any item to major without justification. The Orchestrator routes each item to its lane; it never judges content and the Architect never dispatches. Major items go to a fresh per-decision Interlocutor, briefed with per-decision context, which discusses with the human until ambiguity is solved and closes only on explicit human confirm (approve, reject-defer, or exact-text amendment); the Interlocutor never judges anything solved alone. Minor items go to a Decision Maker plus exactly one fresh Critic sharing one `deliberation` assignment: the maker produces one decision artifact per item, the critic makes one pass (counterarguments, missed options, risks, spec conflicts) with critique appended, never merged; no loop, no rewrite, no human contact, no spec/log writes. Every artifact, major or minor, passes architect conformance check — (a) consistent with existing specs, (b) correctly laned, (c) complete enough to integrate. Dissent is recorded in the decision log; the human prevails; integration follows the approval. Minor-lane conflict over an architectural question promotes to major (architect's recorded opinion attached); non-architectural conflict is ruled by the architect with recorded reasoning and reaches the human only via batch veto. Promotion of an existing item to major is routing, not a new decision, and may be flagged by maker, critic, architect, or the human at batch; only the human demotes. Batch-approved minor scope integrates per batch (Batch). Triage records, conformance outcomes, conflict rulings, and dissent are separately typed process records keyed to the item ID; each decision closes with one canonical decision entry (standing authorization in the main document).

## Funnel

Inputs (documents, exploration, desiderata) open the QUESTION POOL of all decisions needed for specs. Exploration can be produced by the read-only Researcher as one evidence brief per item; the brief is context, never a decision.

## Research lane (human-gated, pre-triage)

After an item enters the Question Pool, the human decides per item whether research is needed — either when a feature (new or improved) is being shaped, or when proposed solutions have proved insufficient. On the human's confirm, the Orchestrator dispatches one fresh Researcher per item: one question, one brief, one pass — no loop, no rewrite. Repository read-only; offline by default; no spec/log/ledger writes; no decision; prior-art first (existing reports, decisions, ops, progress are cited before any new probing); new questions opened by findings are recorded in the brief and stop — they become pool items only by Architect or human call. The artifact is exactly **one evidence brief**, cross-linked by item ID. The Orchestrator presents the brief — question, documented facts, uncertainties, options, and trust summary (a procedural statement only: sources present, unverified claims flagged, authorization respected) — to the human **before** any Architect dispatch; that presentation is a read-only delivery, not a dialogue. The human's informed call is recorded; only then does the item proceed to Architect triage, brief attached. The sole decision dialogue with the human remains the Interlocutor's, in the major lane (briefed with the evidence brief and the human's recorded direction). Decision-grade claims in or on an item citing a brief obey the conformance traceability rule (check (c) below). A fact requiring code, cluster, Docker, or network action is not researched: the brief names the experiment and stops; the probe becomes an execution package whose result feeds the same item.

## Major lane

A fresh Interlocutor per decision, briefed with per-decision context (relevant spec slice, related log entries, the question). Discusses with the human until ambiguity is solved; closes only on explicit human confirm. Produces the artifact for architect conformance check. The Architect is fully behind glass: never dialogues with the human directly; reads, triages, rules, integrates, and performs conformance checks. Its thinking reaches the human only as recorded artifacts. Major artifacts arrive pre-converged with the human; architect dissent is recorded in the decision log, the human prevails, integration follows the approval.

## Minor lane (deliberation pair)

Decision Maker + Critic, one shared `deliberation` route, always dispatched together, fresh per item. Input per item: question + context (spec slice, related log entries, constraints). Repo read-only; no human access; no spec/log/ledger writes. Maker: one decision artifact per item (answer, reasoning, foreseeable spec effects); scope-expanding thoughts flagged for promotion, never pursued. Critic: one pass only. Output: artifact + critique + promotion flags, via Orchestrator to architect conformance check. The pair forgets everything after.

## Architect conformance check (3 checks)

Every artifact: (a) consistent with existing specs — at integration coherence across seams a per-item critic cannot see, not a repeat of the critic's spec-conflict pass; (b) correctly laned (no major smuggled through minor); (c) complete enough to integrate. For items citing a research brief, "complete enough to integrate" includes evidence traceability: every decision-grade claim traces to documented fact, reproducible command output, or an authorized external source — never to unlabelled model recall.

Architect role, skills, ownership, and backlog responsibilities are defined once in `.planning/orch/agents/ARCHITECT_AGENT.md`; this workflow defines the decision work.

## Minor-lane conflict

Agree → batch queue. Conflict + architectural → promote to major, architect's recorded opinion attached. Conflict + non-architectural → architect rules with recorded reasoning, onward to batch; human recourse is the batch veto only. Loop bound: one return per item, shared across conformance conflict and batch denial. Architectural items then promote through the major lane; non-architectural rulings then stand into the batch. A batch denial recycles once under the same rule; a repeated architectural conflict reaches the human through the major lane. If the single-return budget is already consumed at batch denial, an architectural item promotes through the major lane, and a denied non-architectural item is terminal (recorded DENIED) unless the human promotes it at their word. A denied item never earns a second return. Re-entry after a terminal denial is only as a new Question Pool item. Exactly one return per item.

## Batch

The architect orders minor items that passed the conformance check by relevance (default cap: the 4 most relevant, adjustable), attaches dependencies (blocks / blocked-by from the spec view). The Orchestrator holds the backlog and presents. The human approves, denies, or exact-text-amends per item. Approved scope integrates per batch: the architect integrates the approved scope in one pass after a coherence re-check over vetoes and orphans. Denial orphaning another item in the batch: the architect re-checks coherence of the approved remainder before integrating; orphaned items drop to the next batch with a ledger note by item ID. An amendment raising a new architectural question promotes that item to major instead. Per item shown: decision, one-line why, decision-log entry link, dependencies. One canonical decision-log entry per decision; process records linked by item ID.

## Artifacts (`.planning/`)

`.planning/specs` — architect, sole writer; living product truth, edited in place. `.planning/decisions` — architect, sole writer; append-only decision log: one canonical entry per decision plus separately typed process records (triage, conformance outcomes, rulings, dissent) keyed by item ID. `.planning/ledger` — orchestrator, sole writer; task and decision-item state (package/state/date/report for execution; item transitions for decisions). One writer each, no exceptions. Approvals authorize; hands write. Cross-link by ID, never copy-paste. The ledger never amends specs or log and vice versa. Supersession: new log entry links the old; the spec section is rewritten; affected packages are re-laned in the ledger. Reports stay out of `.planning/` (existing `/tmp` convention).

## Architect load

The architect is a single writer, triager, integrator, and conformance checker. Queue depth is surfaced; if the architect is unavailable or stalled, all decision-side work stops and the Orchestrator reports to the human. The human may reassign the route (data-only, recorded) or authorize partitioned parallel architect instances — never two writers on one artifact. No other role assumes architect writes or judgments.

## Markers

```text
DECISION_ARTIFACT_READY: <ID> ARTIFACT=<path>
CRITIQUE_APPENDED: <ID> ARTIFACT=<path>
CONFORMANCE_COMPLETE: <ID> RESULT=<pass|fail|dissent> LOG_ENTRY=<id>
BATCH_PRESENTED: <ID> ARTIFACT=<path>
EVIDENCE_BRIEF_READY: <ID> ARTIFACT=<path>
```

## States

Decision-side items track `POOLED, RESEARCHING, TRIAGED, IN_DIALOGUE, IN_DELIBERATION, AWAITING_CONFORMANCE, BATCHED, AWAITING_HUMAN, INTEGRATED, PROMOTED, DENIED`, recorded by the Orchestrator in the ledger by item ID; the architect records outcomes in the decision log.
