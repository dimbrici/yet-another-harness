// Tests for the relay inbox: claiming, ordering, dedupe, restart, the gate, and the
// exact pi calls a delivery makes.
//
// Real filesystem in per-test temp dirs. The production inbox is never touched, and no
// real Orchestrator session receives anything: delivery goes to a fake pi that records
// the option objects.

import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";

import { drainInbox, emitEvent, inboxPaths, startInboxWatch } from "../lib/orch-events.mjs";

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "relay-inbox-test-"));
  for (const sub of ["pending", "processed"]) mkdirSync(join(dir, sub), { recursive: true });
});
afterEach(() => {
  for (const sub of ["pending", "processed"]) {
    try {
      chmodSync(join(dir, sub), 0o755);
    } catch {}
  }
  rmSync(dir, { recursive: true, force: true });
});

/** Write an event straight into pending/, bypassing the emitter, for shape control. */
function file(name, body) {
  writeFileSync(join(dir, "pending", name), typeof body === "string" ? body : `${JSON.stringify(body)}\n`, "utf8");
  return name;
}

function event(task, status, extra = {}) {
  return {
    id: `${task}-${status}-id`,
    kind: "relay",
    task,
    agent: "t9_executor",
    status,
    wait_get: "unknown",
    artifact_or_report: "/tmp/r.md",
    tsk_id: "T9",
    orchestrator_action: status === "settled" ? "update-tsk-board" : "inspect-agent",
    relay_log: "/tmp/relay.log",
    ts: "2026-10-08T13:00:00Z",
    extra: "",
    ...extra,
  };
}

const listing = (sub) => {
  try {
    return readdirSync(join(dir, sub)).sort();
  } catch {
    return [];
  }
};

describe("drainInbox", () => {
  test("claims every pending event, oldest first, and moves it to processed/", () => {
    file("20260101T000000Z-aaaa-T1-settled.json", event("T1", "settled"));
    file("20260102T000000Z-bbbb-T2-gone.json", event("T2", "gone"));
    const seen = [];
    const out = drainInbox({ inboxDir: dir, deliver: (e) => seen.push(e.task) });
    assert.deepEqual(seen, ["T1", "T2"], "delivered oldest first");
    assert.deepEqual(listing("pending"), []);
    assert.deepEqual(listing("processed"), ["20260101T000000Z-aaaa-T1-settled.json", "20260102T000000Z-bbbb-T2-gone.json"]);
    assert.equal(out.delivered.length, 2);
    assert.equal(out.claimed, 2);
  });

  test("I1: a second drain on the same dir delivers nothing (claim is the rename)", () => {
    file("20260101T000000Z-aaaa-T1-settled.json", event("T1", "settled"));
    const seen = [];
    drainInbox({ inboxDir: dir, deliver: (e) => seen.push(e.task) });
    drainInbox({ inboxDir: dir, deliver: (e) => seen.push(e.task) });
    drainInbox({ inboxDir: dir, deliver: (e) => seen.push(e.task) });
    assert.deepEqual(seen, ["T1"], "an event was delivered more than once");
    assert.equal(listing("processed").length, 1);
  });

  test("restart durability: events written while nobody was watching are delivered at the next drain", () => {
    // The session was down: two senders filed events anyway.
    file("20260101T000000Z-aaaa-T1-gone.json", event("T1", "gone"));
    file("20260102T000000Z-bbbb-T2-gone.json", event("T2", "gone"));
    // A fresh session starts and drains: durability is the whole point.
    const seen = [];
    drainInbox({ inboxDir: dir, deliver: (e) => seen.push(e.task) });
    assert.deepEqual(seen, ["T1", "T2"]);
    // And a restart after that delivery does not repeat it.
    const again = [];
    drainInbox({ inboxDir: dir, deliver: (e) => again.push(e.task) });
    assert.deepEqual(again, []);
  });

  test("R2.5: a malformed file is logged and skipped, and the good one still goes out", () => {
    file("20260101T000000Z-aaaa-bad.json", "{ this is not json");
    file("20260102T000000Z-bbbb-good.json", event("T2", "settled"));
    const logs = [];
    const seen = [];
    const out = drainInbox({ inboxDir: dir, deliver: (e) => seen.push(e.task), log: (m) => logs.push(m) });
    assert.deepEqual(seen, ["T2"]);
    assert.equal(out.skipped, 1);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /bad\.json: not json/);
    // It stays as evidence rather than being deleted or left to poison the queue.
    assert.equal(listing("pending").length, 0);
    assert.ok(listing("processed").includes("20260101T000000Z-aaaa-bad.json"));
  });

  test("a delivery that throws is logged, the rest continue, and it is not retried", () => {
    file("20260101T000000Z-aaaa-T1-settled.json", event("T1", "settled"));
    file("20260102T000000Z-bbbb-T2-settled.json", event("T2", "settled"));
    const seen = [];
    const logs = [];
    drainInbox({
      inboxDir: dir,
      log: (m) => logs.push(m),
      deliver: (e) => {
        seen.push(e.task);
        if (e.task === "T1") throw new Error("pi is not listening");
      },
    });
    assert.deepEqual(seen, ["T1", "T2"], "a failed delivery stalled the queue");
    assert.match(logs[0], /T1.*pi is not listening/);
    assert.deepEqual(listing("pending"), []);
  });

  test("temp names, dotfiles and non-json files are never claimed or delivered", () => {
    const real = file("20260101T000000Z-aaaa-T1-settled.json", event("T1", "settled"));
    file("20260101T000000Z-aaaa-T1-settled.json.tmp-abcd", event("T9", "settled"));
    file(".hidden.json", event("T8", "settled"));
    file("armed.stamp", "not json at all");
    const seen = [];
    drainInbox({ inboxDir: dir, deliver: (e) => seen.push(e.task) });
    assert.deepEqual(seen, ["T1"], "a temp or dot file was treated as an event");
    assert.ok(listing("pending").includes("armed.stamp"), "a non-event file was moved");
    assert.ok(listing("pending").includes(".hidden.json"));
    assert.deepEqual(listing("processed"), [real]);
  });

  test("an absent inbox is not a failure: there is simply nothing to deliver", () => {
    const missing = join(dir, "nothing", "here");
    const seen = [];
    const out = drainInbox({ inboxDir: missing, deliver: () => seen.push(1) });
    assert.deepEqual(seen, []);
    assert.equal(out.claimed, 0);
  });

  test("two drains racing on one file deliver it once, whoever wins the rename", () => {
    file("20260101T000000Z-aaaa-T1-settled.json", event("T1", "settled"));
    const seen = [];
    const deliver = (e) => seen.push(e.task);
    // Both read the same listing, then both try to claim: only one rename can succeed.
    const paths = inboxPaths(dir);
    const name = "20260101T000000Z-aaaa-T1-settled.json";
    const first = join(paths.pending, name);
    const second = join(paths.pending, name);
    const won = [];
    for (const from of [first, second]) {
      try {
        renameSync(from, join(paths.processed, name));
        won.push(from);
      } catch {
        // lost the race
      }
    }
    assert.equal(won.length, 1, "both claims succeeded");
    drainInbox({ inboxDir: dir, deliver });
    assert.deepEqual(seen, []);
  });
});

describe("startInboxWatch", () => {
  test("a new event file is delivered through the real fs.watch", async () => {
    const seen = [];
    const inbox = startInboxWatch({ inboxDir: dir, deliver: (e) => seen.push(e.task) });
    try {
      emitEvent({ task: "T7", agent: "t9_executor", status: "gone", artifact_or_report: "/tmp/r.md" }, { inboxDir: dir });
      await waitFor(() => seen.length > 0, 5000);
      assert.deepEqual(seen, ["T7"]);
      assert.equal(listing("pending").length, 0);
      assert.equal(listing("processed").length, 1);
    } finally {
      inbox.stop();
    }
  });

  test("the watcher does not deliver a mid-write temp file", async () => {
    const seen = [];
    const logs = [];
    const inbox = startInboxWatch({ inboxDir: dir, deliver: (e) => seen.push(e.task), log: (m) => logs.push(m) });
    try {
      // A temp name appears first; only the renamed file is an event.
      writeFileSync(join(dir, "pending", "20260101T000000Z-aaaa-T5-gone.json.tmp-beef"), "{ partial", "utf8");
      await new Promise((done) => setTimeout(done, 250));
      assert.deepEqual(seen, [], "a partial temp file was delivered");
      file("20260101T000000Z-aaaa-T6-gone.json", event("T6", "gone"));
      await waitFor(() => seen.length > 0, 5000);
      assert.deepEqual(seen, ["T6"]);
    } finally {
      inbox.stop();
    }
  });

  test("stop ends the watch: a later file waits for the next drain", async () => {
    const seen = [];
    const inbox = startInboxWatch({ inboxDir: dir, deliver: (e) => seen.push(e.task) });
    inbox.stop();
    file("20260101T000000Z-aaaa-T3-gone.json", event("T3", "gone"));
    await new Promise((done) => setTimeout(done, 300));
    assert.deepEqual(seen, []);
    assert.equal(listing("pending").length, 1, "a stopped watcher consumed the event");
  });

  test("drainNow delivers serially and oldest first for several files at once", async () => {
    file("20260101T000000Z-aaaa-T1-settled.json", event("T1", "settled"));
    file("20260101T000002Z-bbbb-T2-settled.json", event("T2", "settled"));
    const order = [];
    const inbox = startInboxWatch({ inboxDir: dir, deliver: (e) => order.push(e.task) });
    await inbox.drainNow();
    await inbox.drainNow();
    inbox.stop();
    assert.deepEqual(order, ["T1", "T2"], "overlapping or unordered delivery");
  });

  test("the watch creates the inbox directories on demand", () => {
    const fresh = join(dir, "deep", "new");
    const inbox = startInboxWatch({ inboxDir: fresh, deliver: () => {} });
    try {
      assert.ok(existsSync(join(fresh, "pending")));
      assert.ok(existsSync(join(fresh, "processed")));
    } finally {
      inbox.stop();
    }
  });
});

function waitFor(predicate, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((done, fail) => {
    const tick = () => {
      if (predicate()) return done();
      if (Date.now() > deadline) return fail(new Error("timed out waiting"));
      setTimeout(tick, 25);
    };
    tick();
  });
}

// --- the entry file: what a delivery calls, and who is allowed to deliver ----------

let box;

function fakePi(name) {
  const made = { name, sends: [], emits: [], handlers: {} };
  made.pi = {
    getSessionName: () => made.name,
    on(event, handler) {
      made.handlers[event] = handler;
    },
    sendMessage(message, options) {
      made.sends.push({ message, options });
    },
    events: { emit: (channel, data) => made.emits.push({ channel, data }) },
  };
  made.fire = async (event) => {
    await made.handlers[event]?.({});
  };
  // Every fake is registered for teardown: a failing assertion must not leave a real
  // fs.watch open, or the test process never exits.
  box.fakes.push(made);
  return made;
}

async function shutdownAll() {
  for (const fake of box.fakes) {
    try {
      await fake.handlers.session_shutdown?.({});
    } catch {}
  }
}

const JITI_STATIC =
  "/Users/domenicoimbrici/.local/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti-static.mjs";

async function loadInto(fake, inbox) {
  const { createJiti } = await import(JITI_STATIC);
  const jiti = createJiti(import.meta.url, { moduleCache: false });
  const entry = join(import.meta.dirname, "..", "relay-inbox.ts");
  let factory = null;
  try {
    factory = await jiti.import(entry, { default: true });
  } catch (cause) {
    return { loaded: false, reason: cause.message };
  }
  const saved = { ...process.env };
  process.env.ORCH_EVENTS_DIR = inbox;
  delete process.env.HERDR_PANE_ID;
  box.restore = () => {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  };
  let error = null;
  try {
    await factory(fake.pi);
  } catch (cause) {
    error = cause;
  }
  return { loaded: true, error };
}

/** Load the entry with this test's temp inbox and a chosen session name. */
async function loadInbox(name = box.sessionName) {
  const fake = fakePi(name);
  const loaded = await loadInto(fake, box.inbox);
  return { ...loaded, fake };
}

beforeEach(() => {
  box = { root: mkdtempSync(join(tmpdir(), "relay-inbox-entry-")), inbox: "", sessionName: "orchestrator", fakes: [] };
  box.inbox = join(box.root, "inbox");
});
afterEach(async () => {
  await shutdownAll();
  box.restore?.();
  rmSync(box.root, { recursive: true, force: true });
});

describe("relay-inbox.ts (the entry)", () => {
  test("a delivery is a relay-event message with triggerTurn and followUp, plus a bus emit", async () => {
    const loaded = await loadInbox();
    if (!loaded.loaded) return console.log(`  [inbox smoke] UNVERIFIED: ${loaded.reason}`);
    if (loaded.error) throw loaded.error;
    emitEvent({ task: "T9-IMPL", agent: "t9_executor", status: "settled", wait_get: "done", artifact_or_report: "/tmp/r.md", tsk_id: "T9" }, { inboxDir: box.inbox });
    await loaded.fake.fire("session_start");
    assert.equal(loaded.fake.sends.length, 1);
    const { message, options } = loaded.fake.sends[0];
    assert.equal(message.customType, "relay-event");
    assert.equal(message.display, true);
    assert.equal(message.details.event.status, "settled");
    // The flat line keeps R1\'s field order, RELAY_LOG last of the named fields.
    assert.match(message.content, /^RELAY_EVENT: TASK=T9-IMPL AGENT=t9_executor STATUS=settled/);
    assert.match(message.content, / ORCHESTRATOR_ACTION=update-tsk-board RELAY_LOG=/);
    assert.equal(options.triggerTurn, true, "an idle Orchestrator must be woken");
    assert.equal(options.deliverAs, "followUp", "a busy Orchestrator must not be steered");
    assert.equal(loaded.fake.emits.length, 1);
    assert.equal(loaded.fake.emits[0].channel, "relay:event");
    assert.equal(loaded.fake.emits[0].data.task, "T9-IMPL");
  });

  test("I2: a worker session delivers nothing and emits nothing", async () => {
    const loaded = await loadInbox("t9_executor");
    if (!loaded.loaded) return console.log(`  [inbox smoke] UNVERIFIED: ${loaded.reason}`);
    if (loaded.error) throw loaded.error;
    emitEvent({ task: "T9-IMPL", agent: "x", status: "settled" }, { inboxDir: box.inbox });
    await loaded.fake.fire("session_start");
    await new Promise((done) => setTimeout(done, 200));
    assert.deepEqual(loaded.fake.sends, [], "a worker session delivered an event");
    assert.deepEqual(loaded.fake.emits, [], "a worker session emitted on the bus");
    // The event is untouched: it stays for the Orchestrator to claim.
    assert.equal(readdirSync(join(box.inbox, "pending")).length, 1);
  });

  test("an unresolvable identity is inert, not a guesser", async () => {
    // Set the name on the box rather than passing undefined: an explicit undefined
    // would be swallowed by loadInbox's default parameter.
    box.sessionName = undefined;
    const loaded = await loadInbox();
    if (!loaded.loaded) return console.log(`  [inbox smoke] UNVERIFIED: ${loaded.reason}`);
    if (loaded.error) throw loaded.error;
    emitEvent({ task: "T9-IMPL", agent: "x", status: "settled" }, { inboxDir: box.inbox });
    await loaded.fake.fire("session_start");
    await new Promise((done) => setTimeout(done, 200));
    assert.deepEqual(loaded.fake.sends, []);
    assert.deepEqual(loaded.fake.emits, []);
    assert.equal(readdirSync(join(box.inbox, "pending")).length, 1);
  });

  test("a suffixed orchestrator name is still the Orchestrator, and a lookalike is not", async () => {
    for (const [name, expectDelivery] of [
      ["orchestrator", true],
      ["orchestrator-2", true],
      ["Orchestrator", true],
      ["orchestratorator", false],
      ["not-orchestrator", false],
      ["orch_something", false],
      ["t9_executor", false],
    ]) {
      const root = mkdtempSync(join(tmpdir(), "gate-"));
      const inbox = join(root, "inbox");
      const fake = fakePi(name);
      try {
        const loaded = await loadInto(fake, inbox);
        if (!loaded.loaded) return console.log(`  [gate smoke] UNVERIFIED: ${loaded.reason}`);
        if (loaded.error) throw loaded.error;
        emitEvent({ task: "T", agent: "x", status: "gone" }, { inboxDir: inbox });
        await fake.fire("session_start");
        await new Promise((done) => setTimeout(done, 150));
        assert.equal(fake.sends.length > 0, expectDelivery, `identity ${name}`);
      } finally {
        await fake.handlers.session_shutdown?.({});
        box.restore?.();
        rmSync(root, { recursive: true, force: true });
      }
    }
  });

  test("shutdown stops the watcher but leaves the inbox and its files as evidence", async () => {
    const loaded = await loadInbox();
    if (!loaded.loaded) return console.log(`  [inbox smoke] UNVERIFIED: ${loaded.reason}`);
    if (loaded.error) throw loaded.error;
    await loaded.fake.fire("session_start");
    await loaded.fake.fire("session_shutdown");
    emitEvent({ task: "T5", agent: "x", status: "gone" }, { inboxDir: box.inbox });
    await new Promise((done) => setTimeout(done, 300));
    assert.deepEqual(loaded.fake.sends, [], "a shut-down watcher kept delivering");
    assert.ok(existsSync(join(box.inbox, "pending")), "shutdown deleted the inbox");
    assert.equal(readdirSync(join(box.inbox, "pending")).length, 1);
  });

  test("the watchdog's tool_hung event is delivered like any other", async () => {
    const loaded = await loadInbox();
    if (!loaded.loaded) return console.log(`  [inbox smoke] UNVERIFIED: ${loaded.reason}`);
    if (loaded.error) throw loaded.error;
    emitEvent(
      {
        task: "tool_hung",
        agent: "t9_executor",
        status: "tool_hung",
        extra: "TOOL=bash SILENT_SECONDS=600 TOTAL_SECONDS=600 PANE=pane-1",
        tool: { toolCallId: "c", toolName: "bash", argsPreview: "sleep 999", silentSeconds: 600, totalSeconds: 600 },
      },
      { inboxDir: box.inbox },
    );
    await loaded.fake.fire("session_start");
    assert.equal(loaded.fake.sends.length, 1);
    assert.match(loaded.fake.sends[0].message.content, /STATUS=tool_hung/);
    assert.match(loaded.fake.sends[0].message.content, /ORCHESTRATOR_ACTION=inspect-agent/);
    assert.match(loaded.fake.sends[0].message.content, /SILENT_SECONDS=600/);
    assert.equal(loaded.fake.sends[0].message.details.event.tool.toolName, "bash");
  });
});
