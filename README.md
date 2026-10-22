# Orchestrator workflow source

This repository is the editable source for the portable orchestrator framework. It separates framework source from supporting documentation and from each consuming repository's workflow state. This layout does not deploy or activate the framework.

## Layout and ownership

- `framework/` contains the portable framework source. It has no nested `.planning/` wrapper.
  - `framework/agents/` contains role and routing documents.
  - `framework/workflows/` contains workflows and current templates. The old reviewer brief template is retained under `framework/workflows/legacy/` and is not the current review template.
  - `framework/skills/` contains framework skills and their supporting references, evaluations, and license.
  - `framework/helpers/` contains four helper sources. Their installed-relative assumptions are unchanged; do not expect them to run from this source layout.
- `docs/` contains supporting overview documentation and its diagram source and rendering. It is not framework runtime payload.
- `README.md` documents source ownership and the source-to-installed map. It is not framework runtime payload.
- The repository's existing `.planning/` belongs to this consumer. It is not source-project content and is not deployed from this source project.

The source project owns `framework/`, `docs/`, and this README. A future change to the layout, ownership, or mapping must update this README in the same change. Each consumer owns its workflow records. The Architect owns consumer specifications and decisions. The Orchestrator owns the consumer ledger and task-board control. Create work records only when needed; do not add empty specifications or decisions.

## Source-to-installed map

The intended global deployment destination is `/Users/domenicoimbrici/.pi/agent/orch/framework/`, usually `~/.pi/agent/orch/framework/`. Paths in the table are relative to that destination. This table documents intended placement only. This package does not deploy files, add an installer, or change sync behavior.

| Editable source | Intended installed path or status |
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
| Root `docs/**` | Excluded from this source project's runtime payload. Existing global `.planning/docs/**` stays unchanged. |
| Root `README.md` | Excluded from runtime payload. |
| This consumer's root `.planning/**` | Excluded from this source project's runtime payload; consumer-owned. |

The legacy reviewer template does not replace `framework/workflows/templates/REVIEW-BRIEF-template.md`, which is the current review-brief template. The root `docs/` files preserve supporting documentation; their exclusion above does not remove or change existing global `.planning/docs/` files or other legacy paths.

The installed helper locations preserve their current runtime assumptions. `start-agent.sh` finds `orchestrator-routing.yaml` and `routing_lookup.py` beside itself in `.planning/orch/agents/`. The relay helpers use the installed `.planning/orch/` layout. Their source paths under `framework/helpers/` are for editing and preservation, not direct execution.

## Consumer layout

The agreed consumer target is `.planning/{orch,specs,decisions,ledger}`: framework documents under `orch/`, specifications under `specs/`, decisions under `decisions/`, and work records under `ledger/`. Create records only when work requires them. This target describes an intended consumer organization; this package does not migrate this repository or create consumer work records.

Existing consumers may still have `.planning/docs/` and legacy paths. Leave those existing paths untouched unless a separate authorized change addresses them. Existing tooling still expects the deployed global layout: the current sync script reads `<framework-home>/.planning/` and enumerates files there. It is not changed to consume this repository's `framework/` directory, and this README does not claim that the new source layout is deployable by the current script.

## Maintenance boundary

Keep imported framework payload lossless unless a separate change authorizes content edits. When a future change alters framework layout, ownership, or any source-to-installed mapping, update this README in that same change. Deployment, sync changes, and consumer migrations require their own authorization.
