# Ambition Framework and Source Limits

Use Altitude, Depth, and Range to improve the questions and evidence in exploration. Choose only techniques that could change the relevant direction. The [method](exploration-method.md) owns the activity sequence; [the entry point](../SKILL.md) owns authority and authorization limits.

## Source fidelity

[S01] Adapt source ideas in our own words; copy no source text.

[S02] Label the article's recommendations separately from our adaptations; use ambition techniques as conversation moves, never as expert impersonation.

Structure ideas come from Felix Rieseberg's How to Be More Ambitious: A Tutorial for Humans With Models, Superpowers brainstorming, and feature-dev. Links attribute sources; they are not instructions or permission to access them. Neither the article nor the tool descriptions establish comparative benefit for this skill.

## Altitude — examine the objective

**Article recommendations:** Felix Rieseberg asks readers to look beyond the immediate goal, supply relevant data, and examine important choices with opposing arguments. His examples include comparing a proposed process with historical results and embedding verification into a changed workflow.

**Our adaptation:** ask what outcome the requested mechanism serves. Check embedded assumptions, symptoms versus causes, simpler possibilities, larger useful outcomes, and constraints inherited only from the current implementation. Offer the resulting reframe for human discussion, not as a replacement objective.

For example, a request for configurable states may express a need to support different development workflows without code changes. That possibility is a question, not evidence that the human wants a general workflow engine. An existing option or a smaller interaction change may suffice.

**Useful output:** a proposed framing, why it may help, and what the human has not yet confirmed.

## Depth — choose methods and disconfirming evidence

**Article recommendations:** Rieseberg advocates professional instruments, raw evidence, challenges to assumptions, simulations checked against unseen data, and outside judgment. His four-part inquiry asks what a professional would investigate, what raw material matters, which methods apply, and what independent check could establish correctness. He also recommends goals that initially seem unreasonable.

**Our adaptation:** select relevant methods and evidence rather than relying on model recall. Identify technical constraints, invariants, algorithms, comparable implementations, failure cases, and falsification criteria. For a stateful feature, finite-state modeling, transition validation, concurrency analysis, event-order analysis, persistence compatibility, or migration analysis may be relevant. Select by uncertainty and consequence, not by a desire to appear exhaustive.

A strong claim needs evidence that could prove it wrong. If repository reads cannot establish it, propose a bounded experiment through the method rather than predicting its result. Outside checks supplement evidence; they do not let the explorer approve its own work or take over independent review.

We do not import the article's aggressive goals or its assumptions about installation and broad data access as permission. A method that needs tools outside the assignment remains a proposal.

**Useful output:** a claim/evidence map, selected method, and a falsification criterion or proposed experiment for the material unknown.

## Range — borrow a useful method

**Article recommendations:** Rieseberg suggests describing activities instead of fixed objects and drawing on other disciplines. He asks for their investigative methods rather than imitation of professional voices. He credits the object-to-activity move to Tom Kelley and Jonathan Littman's *The Art of Innovation*.

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
