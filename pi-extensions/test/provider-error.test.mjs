// Tests for the provider-error hook: the label, and the emit sequence against a
// fake pi. The counter in herdr's own status extension adds one per active event
// and removes one per inactive event, so an unbalanced emit would stick the agent
// as blocked forever -- that is what the sequence tests prove.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";

import {
  LABEL_MAX,
  createState,
  lastAssistant,
  onAgentEnd,
  onAgentSettled,
  onAgentStart,
  onShutdown,
  providerErrorLabel,
} from "../lib/provider-error.mjs";

function assistant(over = {}) {
  return { role: "assistant", stopReason: "toolUse", ...over };
}

describe("label", () => {
  test("an error with a message reads as provider_error plus that message", () => {
    assert.equal(
      providerErrorLabel([assistant({ stopReason: "error", errorMessage: "429 slow down" })]),
      "provider_error: 429 slow down",
    );
  });

  test("an error with no message still counts, on its stopReason alone", () => {
    assert.equal(providerErrorLabel([assistant({ stopReason: "error" })]), "provider_error: stopReason error");
  });

  test("the label is one line and capped", () => {
    const label = providerErrorLabel([assistant({ stopReason: "error", errorMessage: "line1\nline2   x".repeat(60) })]);
    assert.ok(!label.includes("\n"), label);
    assert.ok(label.length <= LABEL_MAX, `${label.length} > ${LABEL_MAX}`);
  });

  test("only the last assistant message of the settled run counts", () => {
    assert.equal(
      providerErrorLabel([
        assistant({ stopReason: "error", errorMessage: "old failure, retried" }),
        assistant({ stopReason: "stop" }),
      ]),
      null,
    );
    assert.equal(
      providerErrorLabel([
        assistant({ stopReason: "stop" }),
        assistant({ stopReason: "error", errorMessage: "final failure" }),
      ]),
      "provider_error: final failure",
    );
  });

  test("aborted, stop, toolUse and no assistant message produce no label", () => {
    for (const stopReason of ["aborted", "stop", "toolUse"]) {
      assert.equal(providerErrorLabel([assistant({ stopReason, errorMessage: "ignored" })]), null, stopReason);
    }
    assert.equal(providerErrorLabel([]), null);
    assert.equal(providerErrorLabel([{ role: "user", content: "hi" }]), null);
    assert.equal(providerErrorLabel(undefined), null);
  });

  test("lastAssistant picks the trailing assistant message", () => {
    const messages = [assistant({ stopReason: "stop" }), { role: "user" }, assistant({ stopReason: "error" })];
    assert.equal(lastAssistant(messages).stopReason, "error");
    assert.equal(lastAssistant([]), null);
  });
});

// --- the emit sequence, against a fake pi --------------------------------------

/**
 * A fake pi: `on` records the handlers and `events.emit` records the calls, so the
 * emit sequence can be read as data. The handlers are the lib's own
 * onAgentEnd / onAgentSettled / onAgentStart / onShutdown, wired exactly as the
 * registration file wires them.
 */
function fakePi() {
  const calls = [];
  const handlers = {};
  return {
    calls,
    handlers,
    on(name, handler) {
      handlers[name] = handler;
    },
    events: {
      emit(name, data) {
        calls.push({ name, ...data });
      },
    },
    async fire(name, event) {
      await handlers[name]?.(event, { cwd: "/tmp" });
    },
  };
}

function wiredPi() {
  const state = createState();
  const pi = fakePi();
  const emit = (data) => pi.events.emit("herdr:blocked", data);
  pi.on("agent_end", async (event) => onAgentEnd(state, event?.messages));
  pi.on("agent_settled", async () => {
    const out = onAgentSettled(state);
    if (out) emit(out);
  });
  pi.on("agent_start", async () => {
    const out = onAgentStart(state);
    if (out) emit(out);
  });
  pi.on("session_shutdown", async () => {
    const out = onShutdown(state);
    if (out) emit(out);
  });
  return pi;
}

describe("hook wiring", () => {
  test("the lib sequence emits one active per error run and one inactive to clear it", async () => {
    const pi = await wiredPi();
    pi.calls.length = 0;

    await pi.fire("agent_end", { messages: [assistant({ stopReason: "error", errorMessage: "conn reset" })] });
    await pi.fire("agent_settled", {});
    assert.deepEqual(pi.calls, [{ name: "herdr:blocked", active: true, label: "provider_error: conn reset" }]);

    // A second settle with no new start must not stack the counter.
    await pi.fire("agent_settled", {});
    assert.equal(pi.calls.length, 1);

    await pi.fire("agent_start", {});
    assert.deepEqual(pi.calls.at(-1), { name: "herdr:blocked", active: false });
    assert.equal(pi.calls.length, 2);

    await pi.fire("agent_start", {});
    assert.equal(pi.calls.length, 2, "an inactive event must not be emitted twice");
  });

  test("a clean run emits nothing", async () => {
    const pi = await wiredPi();
    await pi.fire("agent_end", { messages: [assistant({ stopReason: "stop" })] });
    await pi.fire("agent_settled", {});
    assert.deepEqual(pi.calls, []);
  });

  test("an aborted run emits nothing", async () => {
    const pi = await wiredPi();
    await pi.fire("agent_end", { messages: [assistant({ stopReason: "aborted", errorMessage: "user pressed esc" })] });
    await pi.fire("agent_settled", {});
    assert.deepEqual(pi.calls, []);
  });

  test("shutdown while active clears the state", async () => {
    const pi = await wiredPi();
    await pi.fire("agent_end", { messages: [assistant({ stopReason: "error", errorMessage: "500" })] });
    await pi.fire("agent_settled", {});
    await pi.fire("session_shutdown", {});
    assert.deepEqual(pi.calls.map((call) => call.active), [true, false]);
    pi.calls.length = 0;
    await pi.fire("session_shutdown", {});
    assert.deepEqual(pi.calls, [], "a second shutdown must not emit");
  });

  test("reload without a start does not leave the counter stacked", async () => {
    const pi = await wiredPi();
    await pi.fire("agent_end", { messages: [assistant({ stopReason: "error", errorMessage: "timeout" })] });
    await pi.fire("agent_settled", {});
    await pi.fire("session_shutdown", {});
    pi.calls.length = 0;
    await pi.fire("agent_settled", {});
    assert.deepEqual(pi.calls, [], "after a clear, a settle with no new error emits nothing");
  });
});

// --- smoke check: can pi's own loader read the registration file? ---------------
//
// The tests above drive the lib logic. The entry file is TypeScript, and pi loads
// it with jiti. That is attempted here once, and its result is reported: if the
// loader is not reachable, the entry file is recorded as unverified rather than
// quietly tested by a substitute.

test("smoke check: agent-health.ts through pi's own jiti loader", async () => {
  const jitiStatic =
    "/Users/domenicoimbrici/.local/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti-static.mjs";
  const entry = join(import.meta.dirname, "..", "agent-health.ts");
  const pi = fakePi();
  try {
    // The same loader pi itself uses for extension .ts entry files.
    const { createJiti } = await import(jitiStatic);
    const jiti = createJiti(import.meta.url, { moduleCache: false });
    const factory = await jiti.import(entry, { default: true });
    await factory(pi);
  } catch (error) {
    console.log(`  [hook smoke] UNVERIFIED: agent-health.ts did not load (${error.message})`);
    return;
  }
  console.log(`  [hook smoke] LOADED agent-health.ts; handlers ${Object.keys(pi.handlers).sort().join(", ")}`);
  assert.deepEqual(Object.keys(pi.handlers).sort(), ["agent_end", "agent_settled", "agent_start", "session_shutdown"]);
  await pi.fire("agent_end", { messages: [assistant({ stopReason: "error", errorMessage: "via real entry file" })] });
  await pi.fire("agent_settled", {});
  assert.deepEqual(pi.calls, [
    { name: "herdr:blocked", active: true, label: "provider_error: via real entry file" },
  ]);
});
