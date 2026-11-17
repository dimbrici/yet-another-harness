---
name: feature-exploration
description: Advisory exploration for a vague or consequential feature request before the Question Pool. Use when the desired outcome, current behavior, assumptions, or feasible directions need investigation and human discussion; skip full exploration for settled requirements, trivial changes, and routine fixes.
metadata:
  read-only: true # Repository read-only; only the assigned external report is writable.
---

# Feature Exploration

Turn an initial request into a human-confirmed direction and unresolved decision candidates, not an implementation plan or canonical decision. This skill describes a method; it does not activate a conversation route.

## Entry and loading

Read the assignment and available evidence first. Check the desired outcome, novelty, ambiguity, architectural impact, risk, evidence, user feedback, and alternative complexity. Choose the smallest useful pass:

- **Light:** understand → inspect → recommend, for a small, well-grounded request; its recommendation stays pending unless the human explicitly confirms it. Skip exploration entirely if nothing relevant remains open.
- **Moderate:** understand → inspect → compare alternatives → confirm, when a few meaningful choices remain.
- **Complex:** understand → investigate → Altitude/Depth/Range as useful → develop alternatives → gather further evidence → confirm, for consequential uncertainty.

These are paths through available activities, not mandatory rounds. Revisit only what new evidence or feedback makes relevant.

Explicitly load [the exploration method](references/exploration-method.md) when exploration is needed. Load [the ambition reference](references/ambition-framework.md) when challenging the framing, selecting deeper or adjacent methods, or checking source limits. Load [the feature brief template](templates/feature-brief.md) before writing a pending report or confirmed-direction handoff. These relative paths work in both the source and installed skill layouts.

For a nontrivial proposed direction, explicitly load the read-only [anti-overengineering gate](../anti-overengineering/SKILL.md). Use its assessment only, not its implementation handoff. Assess current needs for extensibility, modularity, readability, composability, and design correctness. A present boundary can justify structure; a hypothetical future cannot.

## Authority and safety

[G01] Never silently redefine the human's objectives or expand the authorized scope.

[G02] Only explicit human confirmation confirms a direction; silence is not approval.

[G03] Exploration artifacts are not canonical; never write specifications, decisions, or ledger state through this skill.

[G04] Hand unresolved decision candidates to the Orchestrator for the Question Pool; never bypass the pool, assign formal major/minor triage, or approve architectural decisions.

[G05] Human confirmation of an exploration direction does not authorize implementation or replace the settled-specification execution process.

[G06] Never fetch, install, or execute anything without explicit authorization for that action.

[G07] Who may run this pre-pool conversation remains open under QP-010; this skill grants no role new authority.

[G08] Preserve the existing human-gated Researcher lane, major-lane dialogue, decision separation, Architect ownership, and independent review.

[G09] Do not reopen settled decisions; if a full record is missing, report the input gap instead of inventing a new decision.

[G10] Stop investigating when more evidence is unlikely to change the relevant decisions; surface an unresolved high-impact assumption as a question or proposed experiment.

[G11] Ambitious exploration does not require ambitious implementation; recommend the simplest approach that meets the actual objectives and constraints.

[G12] The assignment must restrict repository access to read-only tools or equivalent enforced limits, with only the assigned external report writable.

[G13] The Orchestrator remains the sole control plane; this skill does not delegate work, control agents, or change task state.

[G14] Do not claim improvement without comparative evidence; a worker cannot validate its own conversation quality by assertion.

## Assignment prerequisites and output

Before starting, require an authorized read set, the full relevant settled-decision records, an external report path, and action-specific limits. Instructions alone do not enforce read-only access. The assigning system must supply tool restrictions or equivalent enforcement; this skill implements no tool controls. If enforcement or required inputs are absent, report the gap to the Orchestrator and stop affected work.

Repository reads and search must stay within the assigned set. Report writes require the assigned path. Network access, experiments, Git actions, secrets, and live actions each remain subject to separate explicit authorization and assignment limits. A source's tool recommendation grants no permission. No spike, automatic planning-skill invocation, or implementation follows exploration.

Keep a pending working brief only at the assignment-authorized report path, normally `/tmp/orch/<repo>/reports/`. Mark its direction pending, even if a recommendation seems clear. Finalize the confirmed-direction handoff only after explicit human confirmation. Record deferred and unanswered questions without canonical closure. Link existing records instead of copying their authoritative content.

Existing ownership and processes remain in [the Orchestrator definition](../../agents/ORCHESTRATOR_AGENT.md), [the Architect definition](../../agents/ARCHITECT_AGENT.md), [the Decision Workflow](../../workflows/DECISION_WORKFLOW.md), and [the Execution Workflow](../../workflows/EXECUTION_WORKFLOW.md). Consult them for authority, not this skill for a substitute policy.

## Conditional assignment shape

This example is inert until QP-010 supplies an authorized role and the required permission and enforcement exist. It assigns no existing role the pre-pool conversation.

```text
Role: <AUTHORIZED_ROLE_PENDING_QP-010>
Load explicitly: .planning/orch/skills/feature-exploration/SKILL.md
Feature request: Explore a feature that lets taskctl users define custom workflows.
Authorized read set: <exact repository paths and supplied evidence reports>
Settled inputs: <full relevant decision records and specification slices;
                 identify missing records as input gaps>
External output: /tmp/orch/<repo>/reports/<assignment>-feature-brief.md
Enforcement: <read-only repository tools or equivalent enforced limits;
              only the external output path writable>
Actions: reads/search only within the set; no network, installation, execution,
         experiments, Git mutation, secrets, live action, delegation, or state writes.
Conversation: <explicit permission and contact route authorized after QP-010>
Return: pending brief if confirmation is absent; otherwise the confirmed direction,
        confirmation evidence and scope, and grouped unresolved candidates.
```

Intended flow: feature request → exploration → confirmed direction → candidates → existing Question Pool/Decision Workflow → settled specification → Execution Workflow. The Orchestrator handles the handoff within existing authority. Policy activation and propagation are deferred; creating these source files enables neither.
