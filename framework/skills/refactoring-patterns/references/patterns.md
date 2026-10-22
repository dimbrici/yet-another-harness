# Refactoring pattern catalog

Per-pattern detail for `refactoring-patterns`. Every entry: **Signal** · **Use when** · **Not when** · **Transform** · **Verify**. Read only the entries relevant to the diagnosed problem. Prefer removal over addition where both would work.

Reminder: a transform is a means to remove a named root cause, never a goal. If a pattern does not clearly simplify the result, do not apply it.

---

## Reshaping

### Extract Function
- **Signal:** a block inside a function does one identifiable job, or needs a name to be understood.
- **Use when:** extraction gives the block a meaningful name and shortens or clarifies the caller.
- **Not when:** the block mutates many locals, or the name would be as complex as the body.
- **Transform:** move the block into a function; pass only what it needs; return its result.
- **Verify:** same outputs for the same inputs; add a focused test for the extracted behavior where it lacked one.

### Inline Function
- **Signal:** a function body is as clear as its name, or it only forwards.
- **Use when:** the indirection adds nothing and callers are just as readable without it.
- **Not when:** the function is a public/stable surface or a real seam.
- **Transform:** replace each call with the body; delete the function.
- **Verify:** callers change together; no external consumer used it.

### Extract Class
- **Signal:** one class holds two responsibilities that change for different reasons.
- **Use when:** the subset has its own data + behavior and a name.
- **Not when:** it would create a shallow holder with no behavior or just move fields around.
- **Transform:** move the subset's fields and methods into a new class; delegate from the old one first if needed.
- **Verify:** moved behavior tests pass; no partial state left behind.

### Inline Class
- **Signal:** a class does almost nothing, or only one caller uses it.
- **Use when:** folding it back into its user removes a concept without losing clarity.
- **Not when:** it is a stable boundary or has multiple users.
- **Transform:** move its members into the caller; delete the class.
- **Verify:** callers compile; the behavior is unchanged.

### Move Function
- **Signal:** a function is more interested in another module's data than its own.
- **Use when:** the destination owns most of what the function touches.
- **Not when:** the move creates a cycle or leaks internals.
- **Transform:** move the function and update imports/callers in one step.
- **Verify:** all callers found (including dynamic); dependency direction still points correctly.

### Move Field
- **Signal:** a field is read or written mostly by another class.
- **Use when:** the destination owns the field's lifecycle.
- **Not when:** it would break invariants that the current owner enforces.
- **Transform:** move the field; update accessors and callers.
- **Verify:** no serialization/persistence break; tests green.

### Rename Symbol
- **Signal:** a name is vague, misleading, or inconsistent with nearby conventions.
- **Use when:** the new name reflects actual responsibility.
- **Not when:** it is a public API or persisted format without a compatibility plan.
- **Transform:** rename across definitions and call sites.
- **Verify:** build/tests; external contract unchanged or migrated.

### Change Function Declaration
- **Signal:** a signature is awkward, over-long, or hides required order.
- **Use when:** a clearer signature removes caller mistakes.
- **Not when:** it churns a stable public API for taste alone.
- **Transform:** change parameters/return; update all callers in the same increment.
- **Verify:** all call sites; behavior identical.

### Introduce Parameter Object
- **Signal:** the same group of parameters travels together across several functions.
- **Use when:** the group is a real concept and grouping reduces repetition.
- **Not when:** it is two values passed once, or the group is coincidental.
- **Transform:** create the object; pass it; read fields from it.
- **Verify:** behavior unchanged; no speculative fields added.

### Replace Primitive with Value Object
- **Signal:** a primitive carries domain meaning and validation rules (money, ids, durations).
- **Use when:** invalid values keep slipping through or the rule is duplicated.
- **Not when:** it is a plain number/string with no invariants.
- **Transform:** small immutable type wrapping the primitive, validating on construction.
- **Verify:** invalid values now fail at one boundary; no equality/serialization regression.

### Encapsulate Variable
- **Signal:** a field or global is read/written from many places.
- **Use when:** access needs one owner so invariants can hold.
- **Not when:** it is a trivial local with a single consumer.
- **Transform:** add accessors; route all access through them; tighten visibility.
- **Verify:** no direct access remains; writers use the guarded path.

### Encapsulate Collection
- **Signal:** callers mutate an exposed list/map directly.
- **Use when:** direct mutation bypasses rules or ordering.
- **Not when:** it is a pure data transfer object with no rules.
- **Transform:** return a copy or read-only view; expose explicit add/remove methods.
- **Verify:** no external mutation path remains; behavior preserved.

### Split Phase
- **Signal:** a function mixes two stages (e.g. parse then compute) with different inputs/outputs.
- **Use when:** separating the stages clarifies data flow and testing.
- **Not when:** the stages are tiny or share lots of state.
- **Transform:** make stage 1 produce an intermediate value; stage 2 consume it.
- **Verify:** same final result; each stage testable alone.

### Combine Functions into Class
- **Signal:** several functions share the same parameters/state.
- **Use when:** the shared state clarifies ownership.
- **Not when:** it creates a holder with no cohesive behavior.
- **Transform:** make the shared state fields; turn functions into methods.
- **Verify:** behavior unchanged; no hidden mutable shared state added.

### Combine Functions into Transform
- **Signal:** derived data is computed and recomputed in several places.
- **Use when:** one function can produce the derived form for all consumers.
- **Not when:** consumers need different projections.
- **Transform:** a transform that takes source data and returns the enriched form.
- **Verify:** all consumers use it; no stale copies remain.

### Separate Query from Modifier
- **Signal:** a function returns a value and also changes state.
- **Use when:** the side effect is surprising or makes testing hard.
- **Not when:** the combined behavior is the actual contract and callers rely on it.
- **Transform:** split into a query and a command; update callers.
- **Verify:** call ordering preserved where it mattered; tests green.

### Replace Derived Variable with Query
- **Signal:** a stored value is always derivable from other state.
- **Use when:** the copy can get stale or must be kept in sync manually.
- **Not when:** computation is expensive and caching is the point.
- **Transform:** replace the field with a function that computes it.
- **Verify:** no remaining writers to the removed field.

### Replace Constructor with Factory Function
- **Signal:** construction needs branching, naming, or returns a subtype.
- **Use when:** a named factory function expresses intent better than `new X(...)`.
- **Not when:** a plain constructor is unambiguous — do not add a factory by reflex.
- **Transform:** add a factory function; migrate callers; keep construction in one place.
- **Verify:** all construction goes through it; no behavior change.

### Remove Flag Argument
- **Signal:** a boolean/mode parameter switches what a function does.
- **Use when:** two clear functions replace one conditional-laden function.
- **Not when:** the flag is genuinely a small variation with shared body.
- **Transform:** split into explicitly named functions or pass a proper type.
- **Verify:** callers use the right variant; behavior unchanged.

---

## Simplifying / removing

### Delete Wrapper
- **Signal:** a function/class only calls another with the same arguments.
- **Use when:** the wrapper adds no policy, validation, or name value.
- **Not when:** it is a stable seam, a test seam, or a compatibility shim with a removal plan.
- **Transform:** update callers to the wrapped target; delete the wrapper.
- **Verify:** no callers remain; public surface intentionally changed or unchanged.

### Delete Pass-through Layer
- **Signal:** `A → B → C` where B only forwards to C.
- **Use when:** removing B improves locality and no cross-cutting concern lives there.
- **Not when:** B owns validation, auth, mapping, or transaction boundaries.
- **Transform:** remove the layer; point A at C.
- **Verify:** errors/ordering/retries observed by A are unchanged.

### Inline Interface
- **Signal:** an interface has exactly one implementation and no independent test seam.
- **Use when:** the abstraction adds indirection without a boundary.
- **Not when:** it isolates an external dependency, or multiple implementations are real today.
- **Transform:** replace the interface with the concrete type; delete the abstraction.
- **Verify:** no other implementers/consumers; tests still isolate what they need.

### Collapse Hierarchy
- **Signal:** a superclass/subclass pair differs trivially.
- **Use when:** the hierarchy adds no behavioral difference.
- **Not when:** subclasses share real overridable behavior or the base is a public contract.
- **Transform:** merge into one type; update references.
- **Verify:** no overrides lost; external type checks unchanged.

### Remove Unnecessary Factory
- **Signal:** a factory creates one concrete type with no branching or lifecycle logic.
- **Use when:** direct construction is clearer.
- **Not when:** it centralizes configuration, caching, or resource management.
- **Transform:** delete the factory; construct directly.
- **Verify:** no lost setup logic; callers updated.

### Remove Premature Extension Point
- **Signal:** hooks, registries, plugins, or strategies with no current second case.
- **Use when:** the extension point is unused "for later" and adds concepts.
- **Not when:** a real second case exists or is already scheduled with a named consumer.
- **Transform:** inline the single behavior; delete the hook/registry.
- **Verify:** nothing references the removed point; behavior unchanged.

### Replace Custom Abstraction with Language Primitive
- **Signal:** a hand-rolled type/helper reimplements a standard language or library feature.
- **Use when:** the primitive is clearer and well understood.
- **Not when:** the custom version encodes domain rules the primitive lacks.
- **Transform:** use the primitive; delete the custom helper.
- **Verify:** edge cases (empty, null, ordering) behave the same.

### Replace Framework Mechanism with Simple Function
- **Signal:** a heavyweight framework feature is used for a small, local need.
- **Use when:** a plain function is easier to read, test, and debug.
- **Not when:** the framework provides lifecycle, safety, or concurrency guarantees in use.
- **Transform:** replace with an explicit function; remove the framework wiring.
- **Verify:** the guarantee the framework provided is preserved or explicitly re-implemented.

### Replace Polymorphism with Conditional
- **Signal:** a class hierarchy exists for two behaviors with no shared state, or subclasses only override one method.
- **Use when:** a conditional is shorter and easier to trace than the hierarchy.
- **Not when:** the hierarchy is open for real extension or keeps behavior with its data.
- **Transform:** replace the dispatch with a conditional (or a small match); collapse the classes.
- **Verify:** all variants handled; no other subclasses exist.
