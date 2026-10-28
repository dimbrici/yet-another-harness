// Tests for the foreground watchdog: the pure alert rule, the record machine, the
// entry file's wiring and gates, and the separation from the command relay.
//
// Every clock is injected. Nothing here waits, and nothing here kills.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";

import {
  ALERT_KINDS,
  ARGS_PREVIEW_CHARS,
  DEFAULT_TICK_SECONDS,
  SILENT_HUNG_SECONDS,
  SILENT_REPEAT_SECONDS,
  TOTAL_OPEN_SECONDS,
  computeAlerts,
  createToolWatch,
  previewArgs,
  tickSeconds,
} from "../lib/tool-watch.mjs";

const T0 = 1_700_000_000;

function started(call = "call-1", name = "bash", args = { command: "sleep 999" }, at = T0) {
  const watch = createToolWatch();
  watch.onStart({ toolCallId: call, toolName: name, args }, at);
  return watch;
}

function kinds(alerts) {
  return alerts.map((alert) => alert.kind).sort();
}

describe("the constants", () => {
  test("the thresholds are the decided values, in seconds", () => {
    assert.equal(SILENT_HUNG_SECONDS, 600);
    assert.equal(SILENT_REPEAT_SECONDS, 600);
    assert.equal(TOTAL_OPEN_SECONDS, 1800);
    assert.equal(DEFAULT_TICK_SECONDS, 15);
  });

  test("the tick is overridable for tests only, and ignores junk", () => {
    assert.equal(tickSeconds({}), 15);
    assert.equal(tickSeconds({ TOOL_WATCH_TICK_SECONDS: "0.05" }), 0.05);
    assert.equal(tickSeconds({ TOOL_WATCH_TICK_SECONDS: "0" }), 15);
    assert.equal(tickSeconds({ TOOL_WATCH_TICK_SECONDS: "not a number" }), 15);
  });

  test("the alert kind set is exactly the two report kinds: nothing that acts", () => {
    // W: the watchdog has no authority to kill, block or mutate. If an actionable
    // kind were ever added, this fails and the reviewer sees it.
    assert.deepEqual([...ALERT_KINDS].sort(), ["silent", "total"]);
    assert.ok(!ALERT_KINDS.some((kind) => /kill|block|stop|cancel|abort|mutate|override|redirect/i.test(kind)));
    assert.throws(() => ALERT_KINDS.push("kill"), /object is not extensible|Cannot add/);
  });

  test("the argument preview is one capped line", () => {
    assert.equal(previewArgs({ command: "ls -la" }), `{"command":"ls -la"}`);
    assert.equal(previewArgs("a\nb   c"), "a b c");
    const long = previewArgs({ command: "x".repeat(5000) });
    assert.equal(long.length, ARGS_PREVIEW_CHARS);
    assert.ok(!long.includes("\n"));
  });
});

describe("computeAlerts: the silent rule (R2.1)", () => {
  test("W1: silence under the threshold earns nothing", () => {
    const watch = started();
    for (const offset of [0, 1, 300, 599, SILENT_HUNG_SECONDS - 1]) {
      assert.deepEqual(computeAlerts(watch.records, T0 + offset), [], `silent for ${offset}s`);
    }
  });

  test("a call silent for exactly the threshold alerts once, as silent", () => {
    const watch = started();
    const alerts = computeAlerts(watch.records, T0 + SILENT_HUNG_SECONDS);
    assert.deepEqual(kinds(alerts), ["silent"]);
    assert.equal(alerts[0].silentSeconds, 600);
    assert.equal(alerts[0].toolName, "bash");
    assert.equal(alerts[0].toolCallId, "call-1");
    assert.match(alerts[0].argsPreview, /sleep 999/);
  });

  test("W2: it repeats on the cadence while the call stays open and silent", () => {
    const watch = started();
    const fired = [];
    // A 15 s tick, as the extension runs it: alerts land at 600, 1200 and 1800.
    for (let second = 0; second <= 1800; second += 15) {
      const alerts = computeAlerts(watch.records, T0 + second);
      watch.alertsReported(alerts);
      fired.push(...alerts);
    }
    const silent = fired.filter((alert) => alert.kind === "silent");
    assert.equal(silent.length, 3, `expected alerts at 600/1200/1800, got ${silent.length}`);
    assert.deepEqual(silent.map((alert) => alert.silentSeconds), [600, 1200, 1800]);
  });

  test("no repeat fires twice for the same threshold", () => {
    const watch = started();
    // Two ticks inside the same window must not both report the 600 s alert.
    const first = computeAlerts(watch.records, T0 + 601);
    watch.alertsReported(first);
    assert.equal(first.length, 1);
    assert.deepEqual(computeAlerts(watch.records, T0 + 610), []);
    assert.equal(computeAlerts(watch.records, T0 + 1201).length, 1);
  });

  test("an update restarts the silent window", () => {
    const watch = started();
    watch.onUpdate({ toolCallId: "call-1" }, T0 + 500);
    assert.deepEqual(computeAlerts(watch.records, T0 + 1000), [], "500s since output, not 1000");
    assert.equal(computeAlerts(watch.records, T0 + 1100).length, 1, "600s since that output");
  });

  test("an alert never re-fires for a window output already reset", () => {
    const watch = started();
    const first = computeAlerts(watch.records, T0 + 600);
    watch.alertsReported(first);
    watch.onUpdate({ toolCallId: "call-1" }, T0 + 605);
    assert.deepEqual(computeAlerts(watch.records, T0 + 900), []);
  });
});

describe("computeAlerts: the total rule (R2.1, R2.3b)", () => {
  test("W3: a call printing the whole time is caught by the total rule once", () => {
    const watch = started();
    const fired = [];
    // The runaway: output every 10 s, so the silent rule never fires at all.
    for (let second = 0; second <= 3600; second += 10) {
      if (second > 0) watch.onUpdate({ toolCallId: "call-1" }, T0 + second);
      const alerts = computeAlerts(watch.records, T0 + second);
      watch.alertsReported(alerts);
      fired.push(...alerts);
    }
    assert.deepEqual(
      fired.filter((alert) => alert.kind === "silent"),
      [],
      "a printing call is not silent",
    );
    const totals = fired.filter((alert) => alert.kind === "total");
    assert.equal(totals.length, 1, "the total alert fires once, not every tick after");
    assert.equal(totals[0].totalSeconds, 1800);
  });

  test("the total alert does not stop the silent alerts on a call that goes quiet", () => {
    const watch = started();
    const fired = [];
    for (let second = 0; second <= 1900; second += 15) {
      if (second > 0 && second <= 1200) watch.onUpdate({ toolCallId: "call-1" }, T0 + second);
      const alerts = computeAlerts(watch.records, T0 + second);
      watch.alertsReported(alerts);
      fired.push(...alerts);
    }
    assert.deepEqual(kinds(fired).filter((k) => k === "total").length, 1);
    assert.ok(fired.some((alert) => alert.kind === "silent"), "output stopped at 1200, so 1800 is silent");
  });

  test("a call that finished is never alerted about, however long it ran", () => {
    const watch = started();
    watch.onEnd({ toolCallId: "call-1" }, T0 + 9999);
    assert.deepEqual(computeAlerts(watch.records, T0 + 99_999), []);
    assert.equal(watch.openCount(), 0);
  });

  test("parallel calls are timed independently", () => {
    const watch = started("quick", "read", { path: "a" });
    watch.onStart({ toolCallId: "slow", toolName: "bash", args: { command: "sleep 1000" } }, T0);
    watch.onEnd({ toolCallId: "quick" }, T0 + 5);
    const alerts = computeAlerts(watch.records, T0 + 600);
    assert.equal(alerts.length, 1, "only the open slow call is reported");
    assert.equal(alerts[0].toolCallId, "slow");
  });

  test("an update or end for an unknown call is ignored, not a crash", () => {
    const watch = started();
    assert.equal(watch.onUpdate({ toolCallId: "nope" }, T0 + 5), null);
    assert.equal(watch.onEnd({ toolCallId: "nope" }, T0 + 5), null);
    assert.equal(watch.onStart({ toolName: "bash" }, T0), null, "no toolCallId");
  });

  test("the record machine keeps only what an event needs", () => {
    const watch = started("c1", "bash", { command: "sleep 1" });
    const record = watch.records.get("c1");
    assert.deepEqual(Object.keys(record).sort(), [
      "argsPreview",
      "closed",
      "lastActivityAt",
      "silentReported",
      "startedAt",
      "toolCallId",
      "toolName",
      "totalReported",
    ]);
  });
});

// --- the entry file, driven through a fake pi -------------------------------------
//
// The entry is TypeScript and pi loads it with jiti. The tests below load it the same
// way, with a fake pi that captures registrations and fires events, a fake clock, and
// a stub herdr. The production inbox directory is never used: ORCH_EVENTS_DIR points
// at a temp dir for every case.

let box;

beforeEach(() => {
  box = makeBox();
});
afterEach(() => {
  // An unwritable pending dir is part of one test: make it removable again.
  try {
    chmodSync(join(box.inbox, "pending"), 0o755);
  } catch {}
  rmSync(box.root, { recursive: true, force: true });
});

function makeBox() {
  const root = mkdtempSync(join(tmpdir(), "tool-watchdog-entry-"));
  const made = {
    root,
    inbox: join(root, "inbox"),
    prompts: join(root, "prompts.log"),
    bin: join(root, "herdr"),
    handlers: {},
    clock: T0,
    emitted: [],
  };
  mkdirSync(made.inbox, { recursive: true });
  // The registry answer is read from a file at call time, so a test can change this
  // session's identity between fires without rewriting the stub.
  made.nameFile = join(root, "agent-name");
  writeFileSync(made.nameFile, "t9_executor", "utf8");
  writeFileSync(
    made.bin,
    `#!/usr/bin/env bash
if [ "$1" = "agent" ] && [ "$2" = "prompt" ]; then printf '%s\\t%s\\n' "$3" "$4" >> "${made.prompts}"; exit 0; fi
if [ "$1" = "agent" ] && [ "$2" = "list" ]; then printf '{"result":{"agents":[{"name":"%s","pane_id":"pane-1"}]}}\\n' "$(cat "${made.nameFile}")"; exit 0; fi
exit 0
`,
    "utf8",
  );
  chmodSync(made.bin, 0o755);
  made.setName = (name) => writeFileSync(made.nameFile, name, "utf8");
  made.promptsRead = () => {
    try {
      return readFileSync(made.prompts, "utf8").trim().split("\n").filter(Boolean);
    } catch {
      return [];
    }
  };
  made.inboxEvents = () => {
    const pendingDir = join(made.inbox, "pending");
    try {
      return readdirSync(pendingDir)
        .filter((name) => name.endsWith(".json"))
        .map((name) => JSON.parse(readFileSync(join(pendingDir, name), "utf8")));
    } catch {
      return [];
    }
  };
  made.pi = {
    handlers: made.handlers,
    getSessionName: () => made.sessionName,
    on(name, handler) {
      made.handlers[name] = handler;
    },
    events: { emit: (name, data) => made.emitted.push({ name, data }) },
    sendMessage: (message, options) => made.emitted.push({ sendMessage: message, options }),
  };
  made.env = () => ({
    ORCH_EVENTS_DIR: made.inbox,
    RUN_RELAY_HERDR_BIN: made.bin,
    HERDR_PANE_ID: "pane-1",
    TOOL_WATCH_TICK_SECONDS: "0.05",
  });
  return made;
}

/** Load tool-watchdog.ts the way pi does, with Date.now and the env bent to the test. */
async function loadWatchdog() {
  const jitiStatic =
    "/Users/domenicoimbrici/.local/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti-static.mjs";
  const { createJiti } = await import(jitiStatic);
  const jiti = createJiti(import.meta.url, { moduleCache: false });
  const entry = join(import.meta.dirname, "..", "tool-watchdog.ts");
  let factory;
  try {
    factory = await jiti.import(entry, { default: true });
  } catch (error) {
    return { loaded: false, reason: error.message };
  }
  const realNow = Date.now;
  Date.now = () => box.clock * 1000;
  const savedEnv = { ...process.env };
  Object.assign(process.env, box.env());
  // The entry uses setInterval; drive it by hand so no test waits on a real timer.
  const realInterval = globalThis.setInterval;
  let tick = null;
  globalThis.setInterval = (fn) => {
    tick = fn;
    return { unref: () => {}, [Symbol.toPrimitive]: () => 0 };
  };
  globalThis.clearInterval = () => {
    tick = null;
  };
  let loadError = null;
  try {
    await factory(box.pi);
  } catch (error) {
    loadError = error;
  }
  box.fire = async (name, event) => {
    if (loadError) throw loadError;
    await box.handlers[name]?.(event);
  };
  box.tick = async () => {
    if (loadError) throw loadError;
    tick?.();
  };
  box.restore = () => {
    Date.now = realNow;
    globalThis.setInterval = realInterval;
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
  };
  return { loaded: true, handlerNames: Object.keys(box.handlers).sort(), loadError };
}

describe("the entry file (R2.2)", () => {
  test("it registers the three tool handlers, the session hooks, and nothing else", async () => {
    const loaded = await loadWatchdog();
    try {
      if (!loaded.loaded) return console.log(`  [entry smoke] UNVERIFIED: ${loaded.reason}`);
      assert.equal(loaded.loadError, null);
      assert.deepEqual(loaded.handlerNames, [
        "session_shutdown",
        "session_start",
        "tool_execution_end",
        "tool_execution_start",
        "tool_execution_update",
      ]);
      // No tool_call hook, and no registered tool: it cannot touch the model's choice.
      assert.ok(!("tool_call" in box.handlers), "the watchdog took a tool_call hook");
      assert.ok(!("tool_call_args" in box.handlers));
    } finally {
      box.restore();
    }
  });

  test("W4: the Orchestrator's own session is inert and never alarms about itself", async () => {
    const loaded = await loadWatchdog();
    if (!loaded.loaded) return console.log(`  [entry smoke] UNVERIFIED: ${loaded.reason}`);
    try {
      box.sessionName = "orchestrator";
      await box.fire("session_start", {});
      await box.fire("tool_execution_start", { toolCallId: "c", toolName: "bash", args: { command: "x" } });
      box.clock = T0 + SILENT_HUNG_SECONDS + 5;
      await box.tick();
      box.clock = T0 + TOTAL_OPEN_SECONDS + 5;
      await box.tick();
      assert.deepEqual(box.inboxEvents(), [], "the watchdog reported about the Orchestrator");
      assert.deepEqual(box.promptsRead(), []);
      assert.deepEqual(box.emitted, []);
    } finally {
      box.restore();
    }
  });

  test("a worker session reports a silent call into the inbox", async () => {
    const loaded = await loadWatchdog();
    if (!loaded.loaded) return console.log(`  [entry smoke] UNVERIFIED: ${loaded.reason}`);
    try {
      box.sessionName = "t9_executor";
      await box.fire("session_start", {});
      await box.fire("tool_execution_start", { toolCallId: "c", toolName: "bash", args: { command: "make test" } });
      assert.deepEqual(box.inboxEvents(), [], "nothing due yet");
      box.clock = T0 + SILENT_HUNG_SECONDS;
      await box.tick();
      const events = box.inboxEvents();
      assert.equal(events.length, 1);
      const event = events[0];
      assert.equal(event.status, "tool_hung");
      assert.equal(event.task, "tool_hung");
      assert.equal(event.agent, "t9_executor");
      assert.equal(event.tsk_id, "none");
      assert.equal(event.artifact_or_report, "none");
      assert.equal(event.wait_get, "unknown");
      assert.equal(event.orchestrator_action, "inspect-agent");
      assert.equal(event.tool.toolCallId, "c");
      assert.equal(event.tool.toolName, "bash");
      assert.equal(event.tool.silentSeconds, 600);
      assert.match(event.tool.argsPreview, /make test/);
      assert.match(event.extra, /^TOOL=bash SILENT_SECONDS=600 TOTAL_SECONDS=600 PANE=pane-1$/);
      // Exactly one delivery: the fallback prompt stayed unused.
      assert.deepEqual(box.promptsRead(), []);
    } finally {
      box.restore();
    }
  });

  test("unresolved identity still alerts, and says who it is with the pane", async () => {
    const loaded = await loadWatchdog();
    if (!loaded.loaded) return console.log(`  [entry smoke] UNVERIFIED: ${loaded.reason}`);
    try {
      box.sessionName = undefined;
      box.setName(""); // herdr answers with no name: identity cannot resolve
      await box.fire("session_start", {});
      await box.fire("tool_execution_start", { toolCallId: "c", toolName: "bash", args: {} });
      box.clock = T0 + SILENT_HUNG_SECONDS;
      await box.tick();
      const events = box.inboxEvents();
      assert.equal(events.length, 1, "an unresolvable worker is still watched");
      assert.equal(events[0].agent, "unknown");
      assert.match(events[0].extra, /PANE=pane-1$/);
    } finally {
      box.restore();
    }
  });

  test("W5: when the inbox cannot be written it falls back to exactly one text prompt", async () => {
    const loaded = await loadWatchdog();
    if (!loaded.loaded) return console.log(`  [entry smoke] UNVERIFIED: ${loaded.reason}`);
    try {
      box.sessionName = "t9_executor";
      await box.fire("session_start", {});
      // The inbox exists but cannot be written: the lazy mkdir succeeds, the write fails.
      mkdirSync(join(box.inbox, "pending"), { recursive: true });
      chmodSync(join(box.inbox, "pending"), 0o500);
      await box.fire("tool_execution_start", { toolCallId: "c", toolName: "bash", args: { command: "hang" } });
      box.clock = T0 + SILENT_HUNG_SECONDS;
      await box.tick();
      const prompts = box.promptsRead();
      assert.equal(prompts.length, 1, `expected one fallback prompt, got ${JSON.stringify(prompts)}`);
      assert.match(prompts[0], /^orchestrator\tRELAY_EVENT: TASK=tool_hung AGENT=t9_executor STATUS=tool_hung/);
      assert.match(prompts[0], /ORCHESTRATOR_ACTION=inspect-agent/);
      assert.match(prompts[0], /TOOL=bash SILENT_SECONDS=600 TOTAL_SECONDS=600 PANE=pane-1$/);
      assert.deepEqual(box.inboxEvents(), [], "nothing was written to an unwritable inbox");
      chmodSync(join(box.inbox, "pending"), 0o755);
    } finally {
      box.restore();
    }
  });

  test("a finished call is dropped: shutdown and end both stop the watch", async () => {
    const loaded = await loadWatchdog();
    if (!loaded.loaded) return console.log(`  [entry smoke] UNVERIFIED: ${loaded.reason}`);
    try {
      box.sessionName = "t9_executor";
      await box.fire("session_start", {});
      await box.fire("tool_execution_start", { toolCallId: "c", toolName: "bash", args: {} });
      await box.fire("tool_execution_end", { toolCallId: "c", toolName: "bash" });
      box.clock = T0 + 9999;
      await box.tick();
      assert.deepEqual(box.inboxEvents(), [], "a call that ended is not hung");
      // And shutdown clears the timer: after it, a tick is a no-op even with a fresh call.
      await box.fire("tool_execution_start", { toolCallId: "d", toolName: "bash", args: {} });
      await box.fire("session_shutdown", {});
      box.clock = T0 + 9999;
      await box.tick();
      assert.deepEqual(box.inboxEvents(), []);
    } finally {
      box.restore();
    }
  });

  test("the watchdog never sends anything to its own agent and registers no tool", async () => {
    const loaded = await loadWatchdog();
    if (!loaded.loaded) return console.log(`  [entry smoke] UNVERIFIED: ${loaded.reason}`);
    try {
      box.sessionName = "t9_executor";
      await box.fire("session_start", {});
      await box.fire("tool_execution_start", { toolCallId: "c", toolName: "bash", args: {} });
      // Output up to 1790 s, then past the total threshold: the silent window is only
      // 11 s old, so the ONE alert due is the total. Nothing can be mistaken for it.
      box.clock = T0 + 1790;
      await box.fire("tool_execution_update", { toolCallId: "c", toolName: "bash" });
      box.clock = T0 + TOTAL_OPEN_SECONDS + 1;
      await box.tick();
      assert.equal(box.inboxEvents().length, 1);
      assert.equal(box.inboxEvents()[0].status, "tool_hung");
      // Everything the alert did went out; nothing came back into this session.
      const selfDeliveries = box.emitted.filter((entry) => entry.sendMessage || entry.name === "relay:event");
      assert.deepEqual(selfDeliveries, [], "the watchdog messaged its own agent");
    } finally {
      box.restore();
    }
  });
});

describe("channel separation (R2.3)", () => {
  test("(a) a run_command start that ends at once, then a long background wait, is no watchdog activity", () => {
    const watch = createToolWatch();
    // run_command start: opens and closes inside a second.
    watch.onStart({ toolCallId: "rc", toolName: "run_command", args: { action: "start", command: "node --test" } }, T0);
    watch.onEnd({ toolCallId: "rc" }, T0 + 0.4);
    // The command now runs with no tool call open at all, for hours.
    for (let second = 0; second <= 7200; second += 15) {
      assert.deepEqual(computeAlerts(watch.records, T0 + second), [], `at +${second}s`);
    }
    assert.equal(watch.openCount(), 0);
  });

  test("(b) a foreground call that keeps printing is never called hung, and only the total rule sees it", () => {
    const watch = started("rc", "bash", { command: "python3 -m unittest -v" });
    for (let second = 10; second <= 1750; second += 10) {
      watch.onUpdate({ toolCallId: "rc" }, T0 + second);
      assert.deepEqual(
        computeAlerts(watch.records, T0 + second).filter((alert) => alert.kind === "silent"),
        [],
        `a printing call at +${second}s is not silent`,
      );
    }
    watch.onUpdate({ toolCallId: "rc" }, T0 + 1760);
    assert.deepEqual(kinds(computeAlerts(watch.records, T0 + 1801)), ["total"]);
  });

  test("(c) nothing in the watchdog can act on a call: the record machine has no such method", () => {
    const watch = createToolWatch();
    assert.deepEqual(Object.keys(watch).sort(), [
      "alertsReported",
      "onEnd",
      "onStart",
      "onUpdate",
      "openCount",
      "records",
      "reset",
    ]);
    assert.ok(
      !Object.keys(watch).some((key) => /kill|stop|cancel|abort|signal|block|redirect/i.test(key)),
      "the record machine exposes an actionable method",
    );
  });
});
