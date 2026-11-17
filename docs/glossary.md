# Glossary

See the [README](../README.md) and [procedures](how-it-works.md). Linked framework sources retain policy ownership.

### Harness
Coordination around coding agents. The framework supplies policy rules; roles divide responsibilities; skills are methods; helpers are scripts.

### Orchestrator
Control plane: classifies, assigns, verifies, and reports; never performs delegated implementation.

### Worker
An agent with bounded assigned work; it cannot delegate or approve its own work.

### Planner
Advisory contract writer for settled requirements, not a designer, controller, or judge.

### Executor
The only code writer; it follows its brief within owned paths in an isolated branch and worktree.

### Independent Reviewer
Read-only judge of committed work; reports findings and a verdict, never repairs.

### Architect
Owner of specifications, decisions, triage, conformance, and maintainability assessment; neither code writer nor dispatcher. Its backlog lists debt needing attention.

### Interlocutor
The major-decision discussion role; it closes only on explicit human confirmation.

### Decision Maker and Critic
The minor-decision pair: one proposal, one appended critique; shared deliberation assignment, no continuing debate.

### Researcher
The human-requested, read-only evidence role: one question, one brief, no decisions or experiments.

### Decision Workflow
Turns unresolved questions into approved specifications and recorded decisions.

### Execution Workflow
Settled work: brief, authorized implementation, independent review, bounded corrections, acceptance, authorized integration.

### Refactoring Workflow
The standalone structural-change procedure without new behavior; feature-driven refactoring stays in the feature package.

### Feature exploration
Advisory investigation of feature directions and unresolved candidates; it neither decides nor implements.
No published role or workflow invokes it; its pre-pool conversation role remains unresolved.

### Question Pool
Unresolved decision items awaiting Architect triage; exploration candidates are not formal decisions.

### Major and minor lanes
Architect-chosen decision paths: major uses human dialogue; minor uses deliberation and human batch approval. Triage selects the lane.

### Conformance check
Architect checks specification consistency, lane, integration detail, and research traceability. Coherence means approved items still fit after denials.

### Batch
Relevance-ordered minor items awaiting per-item human approval, denial, or exact amendment before integration.

### Return budget
One minor-item return, shared across conformance conflict and batch denial; never a second retry.

### Orphan
An item whose dependency was denied; the Architect rechecks coherence, and the orphan moves to a later batch.

### Canonical record
Authoritative specifications and decisions. An artifact is a work product; noncanonical artifacts cannot amend canonical truth.

### Specification and supersession
Specifications state current requirements; supersession links replacement decisions and rewrites affected specifications. Append-only logs add entries without rewriting old decisions.

### Ledger
Orchestrator-owned work state, distinct from specification and decision truth. Process records separately describe triage, conformance, rulings, and dissent.

### Brief and contract
Assignment terms: objective, scope, acceptance evidence, prohibitions, risk, delivery. Evidence is traceable support, not assurance; risk concerns consequences.

### Acceptance package
Independently useful, testable, reviewable work slice; may include multiple checkpoints and its first consumer.

### Checkpoint and baseline
Checkpoints record progress; baselines record starting revisions and state for comparison.

### Scope and ownership
Scope names permitted work; owned paths permit writes, while protected paths do not.

### Authorization and gate
Explicit human permission for stated actions and scope; a gate checks prerequisites before proceeding.

### Standing authorization
Narrow ledger and Architect bookkeeping permission plus exactly approved batch integration, not general edit permission.

### Shadow mode
Initial correction posture: Orchestrator records evidence and proposes; the human authorizes dispatch.

### Revision cycle
Fresh implementation then independent review for recorded blocking findings; maximum three cycles per package.

### Finding and reproduction
Findings name defects or opportunities; reproductions supply concrete evidence for actionable blocking findings.

### Invariant
A required condition; weakening it is not a correction.

### Acceptance and integration
Acceptance meets the bar; integration or merge-back brings accepted worktree changes into the shipping tree with Git authorization.

### auto and pending
Integration modes: auto records scoped permission beforehand; pending requires approval after acceptance and is the default.

### State and verdict
State records progress. PASS and FAIL are review judgments; REVIEW_INSUFFICIENT means judgment is unavailable.
Idle or done means no active agent turn; blocked needs attention; unknown lacks verified state. Settled requirements have no unresolved decisions.

### Routing and assignment
Replaceable model-service selection; it does not change role authority or risk policy.

### Model family and fresh context
Related models form a family; fresh context means a separate agent context. Session model identifies the model observed in that session.

### Provider and fallback
Providers supply models; fallback substitutes assignments. Dispatch stops rather than silently substituting.

### Dispatch
Starting assigned work; orch_dispatch checks availability and reports the session model and turn state.

### Relay
A watch-only worker observer. Generated relays require reports newer than their arm stamp, the recorded dispatch time. Settlement is not verified completion.

### Callback
An active decision-side prompt to the registered Orchestrator carrying a handoff marker, submitted without waiting for a response.

### Marker
Outcome string triggering full artifact, permission, scope, baseline, and worker-state verification.

### Outcome markers
TASK_CONTRACT_READY signals planning; IMPLEMENTATION_READY_FOR_REVIEW, IMPLEMENTATION_BLOCKED, and BRIEF_REJECTED signal implementation outcomes; REVIEW_COMPLETE and REVIEW_INSUFFICIENT signal review outcomes.
REFACTOR_BASELINE_CAPTURED signals baseline capture; HANDOFF_FAILED signals terminal safe inability. REPORT and ID in examples identify the report location and assignment.
DECISION_ARTIFACT_READY, CRITIQUE_APPENDED, CONFORMANCE_COMPLETE, BATCH_PRESENTED, and EVIDENCE_BRIEF_READY signal decision, critique, conformance, batch presentation, and research handoffs.

### RELAY_EVENT
A relay notification requesting Orchestrator verification, not acceptance or proof of completion; idle or done alone cannot replace report checks.

### Inbox
Runtime event-file storage. Events are claimed before live delivery, so a crash can leave retained evidence without a delivered notification.

### Command watcher and watchdog
Observers of detached commands and open tool calls respectively; time alerts report without corrective action.

### run_command
Long-local-command tool returning a run folder; the owner inspects status and chooses whether to extend or stop.

### orch_status and orch_stop
Control-plane tools for reading live worker evidence and retiring workers respectively; retirement checks disappearance before closing a pane.

### Pi and extension
Pi hosts coding-agent sessions. Extensions add tools or respond to events; libraries hold shared code.

### Herdr
The terminal session manager used to start agents and inspect their live state; a pane holds a session's terminal view.

### Bash
The command interpreter for helpers. Installed `start-agent.sh` launches roles; installed `relay-lib.sh` and `relay-template.sh` support watchers.

### Python 3 and PyYAML
The interpreter and separately required YAML reader; installed `routing_lookup.py` reads assignments for both launch paths.

### YAML
Structured text in installed `orchestrator-routing.yaml`, read as an assignment mapping.

### Node.js
Runs extensions and the detached command watcher.

### tsk
Orchestrator-controlled local task board; optional dispatch association does not establish a supported board-free mode.

### SearXNG
Optional web-search service; neither an offline orchestration prerequisite nor network permission.

### Git
The version-control tool used for branches, commits, worktrees, and integration; mutations require explicit permission for their scope. Push copies commits to another repository.

### Branch, commit, and worktree
Branches name work; commits record revisions; worktrees are separate checkouts sharing history. Staging selects commit changes. Clean: no uncommitted changes.

### Source, installed, and consumer
Repositories hold versioned files. Source is editable material; installed copies are separately placed runtime material. Consumers own their records.

### Runtime payload and runtime state
Payload is installed framework material, excluding supporting docs. Runtime state holds relay, inbox, command, and report files outside source; ORCH_HOME relocates it.

### README and Markdown
README owns the entry point and placement map; Markdown is the rules' text-document format.

### Glob and home prefix
Paths locate files; directories group files; roots are base directories. Globs match paths; home prefix ~ denotes the user's home directory.

### Loader and synchronization
Loaders import extensions; synchronization places copies; source edits update neither. An installer automates placement; none is supplied for this layout.

### Golden output and validation battery
Tests check expected behavior; golden output records reference behavior. A validation battery collects checks comparing baseline and changed behavior.

### Dependency and first consumer
Dependencies are prerequisites. A first consumer is a helper's known first use, included in its package when boundaries permit.

### Maintainability and refactoring
Architecture concerns system structure; diagnosis identifies problems. Maintainability keeps code changeable; refactoring preserves behavior while changing structure. Standalone acceptance requires measurable simplification.

### Secret, deployment, and live action
Secrets include credentials; deployment puts changes into use; live actions affect running systems. Clusters group computers. Network contacts other systems. Each needs authorization.

### Security sandbox and offline proof
A sandbox enforces execution limits; policy alone does not. Offline proof checks exact artifacts without live access before authorized deployment. Configuration means system settings.

### Traceability and trust summary
Traceability links claims to sources. A research trust summary states source presence, flagged uncertainty, and respected authorization, not guaranteed correctness.

### Probe and model recall
Probes investigate questions; disposable copies isolate experiments. Model recall is unverified remembered context. Offline work uses local evidence without network access.

### License and evaluation
Licenses state reuse terms; evaluations contain skill-check inputs, not passing-check evidence.

### Container
A packaged program execution environment.

### Veto
Human denial of an item.

### Foreground watchdog
Watches active tool calls; reports silence or excessive duration without corrective action.

### Live-cluster
A running group of computers.
