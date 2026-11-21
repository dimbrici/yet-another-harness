# Orchestrator workflow source

This repository contains the editable sources for a coding-agent coordination harness: role instructions, three workflows, skills, helpers, and Pi extensions.
It is for people who already use coding agents and want to understand how several agents share work and evidence.
The Orchestrator assigns work and checks its outcome; workers implement, investigate, or review within stated boundaries.
The rules separate proposing, editing, reviewing, and approving so that no agent approves its own work.
They define permission boundaries and evidence duties, not a guarantee of correct or safe results.

Read [how it works](docs/how-it-works.md) for procedures and the [glossary](docs/glossary.md) for terms.
The [workflow overview](docs/workflows-overview.svg) provides a high-level picture; the detailed workflow sources define the rules.

## A one-minute example

Suppose a person requests a small change to an error message, with the intended wording already settled.
The Orchestrator checks scope, permissions, and whether planning is required.
For clear, bounded work without a Planner trigger, it may write the task and review briefs directly.
An authorized Executor edits only the named files in its own Git branch and worktree, then supplies a commit and evidence report.
A fresh Independent Reviewer checks the committed work without repairing it.
The Orchestrator verifies the report and worker state before accepting, blocking, or escalating the package.
Acceptance does not merge the change: integration requires its own recorded Git authorization and an assigned worker.
An unsettled wording or product question instead enters the Decision Workflow.

## Requirements and present limits

The described automated execution path needs separately configured Pi, Herdr, an available assigned model service, and installed framework documents, helpers, and extensions.
Its helpers and extensions need Bash, Python 3 with PyYAML, and the Node.js runtime used by Pi.
Git supports the required isolated branches, worktrees, and commits.
Extension entry files must stay beside their library files when installed.

The Orchestrator owns the local `tsk` task board as well as the ledger.
Dispatch accepts an optional board-task association; this does not establish a separately supported board-free operating mode.
The optional web-search extension needs a local SearXNG service; it is not required for offline coordination.
Network use still needs separate authorization.

You can inspect the roles, workflow rules, helper sources, and extension mechanisms in this checkout.
This layout does not install, activate, deploy, or synchronize itself.
No installer for this source layout is provided, and automated extension deployment is not available here.
Existing sync tooling expects the deployed global layout, not this source layout.
Some extension checks depend on a local Pi loader; their presence does not establish portable validation or runtime readiness.
Source files, installed copies, and already loaded extensions can differ.

The tree also includes an advisory [feature exploration skill](framework/skills/feature-exploration/SKILL.md).
No published role or workflow currently invokes that separate skill, and its pre-pool conversation role remains unresolved.
Its publication does not activate a fourth workflow or grant implementation authority.

## Repository tour and ownership

- Source `.pre-commit-config.yaml` defines every repository check, and pre-commit is the only runner. See [docs/contributing-checks.md](docs/contributing-checks.md) for the hooks, the Makefile targets and the deliberate exceptions.

Before you commit, run `make checks`; the same hooks run in CI on every pull request, and
they need no installed packages and no network. The Makefile wraps them: `make checks`
runs every hook on every file, `make checks-full` adds the pre-push stage and its test
suite, `make fix` is the same hooks with the autofix hooks doing the repairs, `make test`
runs the suite alone, and `make hooks` installs the git hooks once.

- Source `framework/agents/` contains role instructions and replaceable routing assignments.
- Source `framework/workflows/` contains the three workflow rules, current templates, and a historical template.
- Source `framework/skills/` contains skills with supporting references, evaluations, and license material.
- Source `framework/helpers/` contains four helper sources with installed-layout assumptions, not a source-layout launch command.
- Source `pi-extensions/` contains versioned extensions; source `pi-extensions/lib/` contains their supporting library files. Installed copies are deployment output, not the source of truth.
- Source `docs/` contains supporting documentation, including the overview diagram's source and rendering.
- Source `README.md` is this entry point and the owner of the placement map below.

This source project owns `framework/`, `pi-extensions/`, `docs/`, and `README.md`. The framework source does not sit inside a consumer planning directory.
The existing consumer `.planning/` directory belongs to that consuming repository, not to the portable source payload.
Each consumer owns its workflow records; the Architect owns specifications and decisions, while the Orchestrator owns ledger and board control.
Records are created when needed, not as empty specification or decision placeholders.

## Source-to-installed map

The intended installed framework root is `~/.pi/agent/orch/framework/`.
Unless shown with a home prefix, installed destinations below are relative to that root, not to this checkout.
Extensions have a separate intended installed root, `~/.pi/agent/extensions/**`.
This table describes intended placement, not an installer or a copy, cleanup, release, or sync action.

| Editable source or consumer location | Intended installed path or status |
| --- | --- |
| `framework/agents/**` | `.planning/orch/agents/**` |
| `framework/workflows/*.md` | `.planning/orch/workflows/*.md` |
| `framework/workflows/templates/**` | `.planning/orch/workflows/templates/**` |
| `framework/workflows/legacy/REVIEWER-BRIEF-template.md` | Historical `.planning/workflow/REVIEWER-BRIEF-template.md`; legacy only |
| `framework/skills/**` | `.planning/orch/skills/**` |
| `framework/helpers/start-agent.sh` | `.planning/orch/agents/start-agent.sh` |
| `framework/helpers/routing_lookup.py` | `.planning/orch/agents/routing_lookup.py` |
| `framework/helpers/relay-lib.sh` | `.planning/orch/relay-lib.sh` |
| `framework/helpers/relay-template.sh` | `.planning/orch/relay-template.sh` |
| `pi-extensions/**` | `~/.pi/agent/extensions/**` |
| `docs/**` | Excluded from runtime payload; existing installed `.planning/docs/**` stays unchanged |
| `README.md` | Excluded from runtime payload |
| Consumer `.planning/**` | Excluded from this source project's runtime payload; consumer-owned |

The legacy reviewer template does not replace the [current review template](framework/workflows/templates/REVIEW-BRIEF-template.md).
Excluding these supporting docs does not remove existing installed documentation or other legacy paths.
Installed `start-agent.sh` expects `orchestrator-routing.yaml` and `routing_lookup.py` beside itself in installed `.planning/orch/agents/`.
The relay helpers expect the installed framework's planning layout.
Their source locations are for editing and preservation, not direct execution.

## Consumer records and maintenance

The intended consumer organization uses `.planning/orch/`, `.planning/specs/`, `.planning/decisions/`, and `.planning/ledger/`.
These consumer paths hold framework documents, specifications, decisions, and work records, respectively.
This layout description does not migrate a consumer or create its records.
Existing consumer `.planning/docs/` and legacy paths remain untouched without separate authorization.
Existing sync tooling reads installed `<framework-home>/.planning/` and enumerates its files; it does not consume source `framework/` directly.

Keep imported framework material lossless unless a separate change authorizes content edits.
Any change to layout, ownership, or placement must update this README in the same change.
Deployment, sync changes, and consumer migrations need their own authorization.
For the operating procedures and record ownership details, continue to [how it works](docs/how-it-works.md).
