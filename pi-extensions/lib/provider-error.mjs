// The provider-error hook's logic, kept free of the pi runtime so it can be
// tested with a fake `pi`.
//
// WHY THIS EXISTS. `herdr agent get` reports `idle` for a finished step, a wait on
// a long run, and a provider or connection failure that left pi open. They look
// identical from outside, so the Orchestrator cannot tell "idle by choice" from
// "stopped by a failed request". Turning the failure into a `blocked` state makes
// that visible without touching herdr's own extension.

/** The longest label worth pushing through the status channel. */
export const LABEL_MAX = 200;

/** The last assistant message of a run, or null when the run had none. */
export function lastAssistant(messages) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "assistant") return messages[i];
  }
  return null;
}

/**
 * Label this settled run for herdr, or null when it is not a provider error.
 *
 * Only `stopReason === "error"` counts. `"aborted"` is the user stopping, `"stop"`
 * and `"toolUse"` are normal endings, and no assistant message means nothing to
 * judge. An error with no message still counts, on its stopReason alone.
 */
export function providerErrorLabel(messages) {
  const message = lastAssistant(messages);
  if (!message || message.stopReason !== "error") return null;
  const detail = typeof message.errorMessage === "string" ? message.errorMessage : "stopReason error";
  return `provider_error: ${oneLine(detail)}`.slice(0, LABEL_MAX);
}

function oneLine(text) {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * The event sequence, as data. `herdr-agent-state.ts` keeps a counter: it adds one
 * per active event and removes one per inactive event, so an unbalanced emit would
 * stick the agent as blocked forever. One active per error run, and one inactive to
 * clear it, is the whole contract.
 */
export function createState() {
  return { pendingMessages: [], active: false };
}

export function onAgentStart(state) {
  state.pendingMessages = [];
  if (!state.active) return null;
  state.active = false;
  return { active: false };
}

export function onAgentEnd(state, messages) {
  state.pendingMessages = Array.isArray(messages) ? messages : [];
}

/** Emit at most one active event per run: a second settle must not stack counters. */
export function onAgentSettled(state) {
  if (state.active) return null;
  const label = providerErrorLabel(state.pendingMessages);
  if (!label) return null;
  state.active = true;
  return { active: true, label };
}

/** A finished session holds no pending run: forget it, so a stray settle cannot emit. */
export function onShutdown(state) {
  state.pendingMessages = [];
  if (!state.active) return null;
  state.active = false;
  return { active: false };
}
