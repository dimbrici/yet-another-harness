# Ambition Framework

Use Altitude, Depth, and Range to improve the questions and evidence in exploration. Choose only techniques that could change the relevant direction. The [method](exploration-method.md) owns the activity sequence; [the entry point](../SKILL.md) owns authority and authorization limits.

## Concept and adaptation limits

[S01] Adapt source ideas in our own words; copy no source text.

[S02] Present adapted ideas in our own words and distinguish established ideas from our adaptation; use ambition techniques as conversation moves, never as expert impersonation.

The techniques and conversation structure adapt existing ideas in our own words. No measured benefit has been established for this workflow.

## Altitude — examine the objective

**Concept:** look beyond the immediate goal, supply relevant data, and examine important choices with opposing arguments. Examples include comparing a proposed process with historical results and embedding verification into a changed workflow.

**Our adaptation:** ask what outcome the requested mechanism serves. Check embedded assumptions, symptoms versus causes, simpler possibilities, larger useful outcomes, and constraints inherited only from the current implementation. Offer the resulting reframe for human discussion, not as a replacement objective.

For example, a request for configurable states may express a need to support different development workflows without code changes. That possibility is a question, not evidence that the human wants a general workflow engine. An existing option or a smaller interaction change may suffice.

**Useful output:** a proposed framing, why it may help, and what the human has not yet confirmed.

## Depth — choose methods and disconfirming evidence

**Concept:** use professional instruments, raw evidence, challenges to assumptions, simulations checked against unseen data, and outside judgment. Ask what a professional would investigate, what raw material matters, which methods apply, and what independent check could establish correctness. Consider goals that initially seem unreasonable without treating them as requirements.

**Our adaptation:** select relevant methods and evidence rather than relying on model recall. Identify technical constraints, invariants, algorithms, comparable implementations, failure cases, and falsification criteria. For a stateful feature, finite-state modeling, transition validation, concurrency analysis, event-order analysis, persistence compatibility, or migration analysis may be relevant. Select by uncertainty and consequence, not by a desire to appear exhaustive.

A strong claim needs evidence that could prove it wrong. If repository reads cannot establish it, propose a bounded experiment through the method rather than predicting its result. Outside checks supplement evidence; they do not let the explorer approve its own work or take over independent review.

Aggressive goals and assumptions about installation or broad data access grant no permission. A method that needs tools outside the assignment remains a proposal.

**Useful output:** a claim/evidence map, selected method, and a falsification criterion or proposed experiment for the material unknown.

## Range — borrow a useful method

**Concept:** describe activities instead of fixed objects and borrow investigative methods from other disciplines. Use those methods rather than imitate professional voices. An object-to-activity shift can reveal a more useful question.

**Our adaptation:** name an applicable adjacent discipline, its specific method, and the reason it can resolve this feature's uncertainty. Examples are options, not a checklist:

| Discipline | Possible method | Use when the uncertainty concerns |
| --- | --- | --- |
| Distributed systems | Ordering and idempotency analysis | Repeated or concurrent events across boundaries |
| Formal methods | State-transition invariants or small model analysis | Invalid states or transitions |
| Databases | Transaction and schema-evolution analysis | Atomic updates and persistent compatibility |
| HCI | Task analysis and error-recovery walkthrough | User intent, discoverability, and recoverable mistakes |
| Information theory | Signal/noise analysis | Whether an alert or status actually conveys useful distinctions |
| Reliability | Failure-mode analysis | Consequences, detection, and recovery |
| Security | Threat modeling and trust-boundary analysis | Untrusted input, privilege, or information exposure |

Use the selected method on evidence. Reject irrelevant breadth and imaginary panels of experts. Merely naming a field adds no insight. Any executable model, walkthrough with real users, or external access still needs its own authorization.

**Useful output:** one relevant insight, hypothesis, or proposed check, with its source and limits.
