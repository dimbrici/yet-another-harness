// Tests for the command relay: the pure decision, then one real end-to-end loop
// against a stub herdr so the knocks, the ack, the escalation and the exits are
// proven as behaviour, not as intent.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";

import { decide } from "../lib/run-relay.mjs";
import { ownerMatch } from "../lib/run-identity.mjs";
import { renderFlatLine } from "../lib/orch-events.mjs";
import { KNOCK_GRACE_SECONDS, quietSince, readKnocks, readSnapshot, writeAck } from "../lib/run-store.mjs";

const T0 = 1_700_000_000;
const GRACE = { grace_seconds: 600 };

function snap(over = {}) {
  return {
    run_dir: "/runs/abc",
    state: "RUNNING",
    pid: 4242,
    exit_code: null,
    started_at: T0,
    log_mtime: T0,
    ack: 0,
    stall: 300,
    overlong: 1200,
    extensions: [],
    extensions_used: 0,
    deadline: T0 + 1200,
    extension_requested: false,
    escalated: false,
    ...over,
  };
}

function knock(key, at, window = 0, extra = {}) {
  return { key, at, window, ...extra };
}

function kinds(actions) {
  return actions.map((entry) => entry.action);
}

describe("decide", () => {
  test("a healthy running run gets nothing", () => {
    assert.deepEqual(decide(snap(), T0 + 10, GRACE, []), []);
  });

  test("DONE knocks once with the exit code, and never again", () => {
    const done = snap({ state: "DONE", exit_code: 0 });
    const actions = decide(done, T0 + 50, GRACE, []);
    assert.deepEqual(kinds(actions), ["knock"]);
    assert.equal(actions[0].state, "DONE");
    assert.equal(actions[0].window, done.log_mtime);
    const told = [knock("DONE", T0 + 50, done.log_mtime)];
    assert.deepEqual(decide(done, T0 + 60, GRACE, told), []);
  });

  test("CRASHED knocks once, with no exit code", () => {
    const crashed = snap({ state: "CRASHED", pid: 2_147_483_647, exit_code: null });
    const actions = decide(crashed, T0 + 50, GRACE, []);
    assert.deepEqual(kinds(actions), ["knock"]);
    assert.equal(actions[0].state, "CRASHED");
    assert.equal(actions[0].exit, "none");
    assert.deepEqual(decide(crashed, T0 + 60, GRACE, [knock("CRASHED", T0 + 50, crashed.log_mtime)]), []);
  });

  test("STALLED knocks once per quiet window, and a new window knocks again", () => {
    const stalled = snap({ log_mtime: T0, ack: 0 });
    const window = quietSince(stalled);
    const first = decide(stalled, T0 + 400, GRACE, []);
    assert.deepEqual(kinds(first), ["knock"]);
    assert.equal(first[0].state, "STALLED");
    assert.equal(first[0].window, window);
    // The same window, still unanswered but inside the grace: no repeat.
    assert.deepEqual(decide(stalled, T0 + 500, GRACE, [knock("STALLED", T0 + 400, window)]), []);
    // New log output opens a new window, so a later stall is a fresh knock.
    const newer = { ...stalled, log_mtime: T0 + 600 };
    assert.notEqual(quietSince(newer), window);
    const again = decide(newer, T0 + 1000, GRACE, [knock("STALLED", T0 + 400, window)]);
    assert.deepEqual(kinds(again), ["knock"]);
    assert.equal(again[0].window, quietSince(newer));
  });

  test("OVERLONG knocks once per deadline, and an extension moves the deadline", () => {
    // A fresh log line keeps the stall rule out of the way, so this tests overlong.
    const over = snap({ started_at: T0, overlong: 100, deadline: T0 + 100, log_mtime: T0 + 95, ack: T0 + 95 });
    const past = decide(over, T0 + 150, GRACE, []);
    assert.deepEqual(kinds(past), ["knock"]);
    assert.equal(past[0].state, "OVERLONG");
    assert.equal(past[0].window, over.deadline);
    // Same deadline, owner not yet past the grace: no repeat.
    assert.deepEqual(kinds(decide(over, T0 + 160, GRACE, [knock("OVERLONG", T0 + 150, over.deadline)])), []);
    // One extension moves the deadline a further overlong value ahead: not due yet.
    const extended = { ...over, extensions_used: 1, deadline: T0 + 200 };
    assert.deepEqual(kinds(decide(extended, T0 + 150, GRACE, [knock("OVERLONG", T0 + 150, over.deadline)])), []);
    const again = decide(extended, T0 + 250, GRACE, [knock("OVERLONG", T0 + 150, over.deadline)]);
    assert.deepEqual(kinds(again), ["knock"]);
    assert.equal(again[0].window, extended.deadline);
  });

  test("no action of this relay ever stops or kills a run (ruling O3)", () => {
    const running = snap({ started_at: T0, log_mtime: T0, overlong: 100, deadline: T0 + 100 });
    const actions = decide(running, T0 + 400_000, GRACE, [knock("OVERLONG", T0 + 399_900, T0 + 100)]);
    assert.ok(!actions.some((entry) => entry.action === "stop" || entry.action === "kill"));
    assert.ok(actions.every((entry) => ["knock", "request", "escalate", "exit"].includes(entry.action)));
  });

  test("a knock answered in time never escalates", () => {
    const answered = snap({ ack: T0 + 500, log_mtime: T0 + 500 });
    assert.deepEqual(kinds(decide(answered, T0 + 700, GRACE, [knock("STALLED", T0 + 400, T0)])), []);
  });

  test("a knock unanswered past the grace escalates once, then exits", () => {
    const actions = decide(snap(), T0 + 400 + GRACE.grace_seconds + 1, GRACE, [knock("STALLED", T0 + 400, T0)]);
    assert.deepEqual(kinds(actions), ["escalate", "exit"]);
    assert.equal(actions[0].state, "STALLED");
    assert.equal(actions[0].unanswered_seconds, 601);
    // Already escalated: never again, and the watch is over.
    assert.deepEqual(decide(snap({ escalated: true }), T0 + 5000, GRACE, [knock("STALLED", T0 + 400, T0)]), [
      { action: "exit", reason: "already_escalated" },
    ]);
  });

  test("STOPPED ends the watch with no knock", () => {
    assert.deepEqual(decide(snap({ state: "STOPPED" }), T0 + 100, GRACE, []), [{ action: "exit", reason: "stopped" }]);
  });

  test("DONE and CRASHED exit once the owner has acked the terminal knock", () => {
    for (const state of ["DONE", "CRASHED"]) {
      const terminal = snap({ state, exit_code: state === "DONE" ? 0 : null });
      const knocks = [knock(state, T0 + 100, terminal.log_mtime)];
      assert.deepEqual(kinds(decide({ ...terminal, ack: T0 + 200 }, T0 + 300, GRACE, knocks)), ["exit"]);
    }
  });

  test("an extension request is sent once, and does not stop the watch", () => {
    const requested = snap({ extension_requested: true, extensions_used: 3 });
    assert.deepEqual(kinds(decide(requested, T0 + 100, GRACE, [])), ["request"]);
    assert.deepEqual(
      kinds(decide(requested, T0 + 100, GRACE, [knock("OVERLONG", T0 + 50, 0, { event: "grant_request" })])),
      [],
    );
  });
});

// --- the real loop, against a stub herdr ---------------------------------------
//
// Each test gets its own temp root: one stub herdr, one registry file, one prompts
// log, and its own relay child. Nothing is shared between tests, so a slow child
// from one case cannot write into another case's evidence.

let box;
let made_root;

const root_of = () => made_root;

beforeEach(() => {
  box = makeBox();
});

afterEach(() => {
  // lockInbox() leaves a read-only directory; make it removable.
  try {
    chmodSync(join(box.root, "inbox"), 0o755);
  } catch {}
  for (const child of box.children) child.kill("SIGKILL");
  rmSync(box.root, { recursive: true, force: true });
});

function makeBox() {
  const root = mkdtempSync(join(tmpdir(), "run-relay-test-"));
  const made = { root, bin: join(root, "herdr"), prompts: join(root, "prompts.log"), children: [] };
  made.registry = (agents) =>
    writeFileSync(join(root, "registry.json"), JSON.stringify({ result: { agents } }), "utf8");
  made.registry([boxAgent]);
  made.stub = (listBody) => {
    writeFileSync(
      made.bin,
      `#!/usr/bin/env bash
if [ "$1" = "agent" ] && [ "$2" = "list" ]; then ${listBody}; fi
if [ "$1" = "agent" ] && [ "$2" = "prompt" ]; then printf '%s\t%s\t%s\n' "$3" "$4" "$5" >> "${made.prompts}"; fi
exit 0
`,
      "utf8",
    );
    spawnSync("chmod", ["+x", made.bin]);
  };
  made.stub(`cat "${root}/registry.json"`);
  made.log = [];
  made.read = () => (existsSync(made.prompts) ? readFileSync(made.prompts, "utf8").trim().split("\n").filter(Boolean) : []);
  // Events the relay wrote to this test's own inbox, as objects.
  made.events = () => {
    const found = [];
    for (const sub of ["pending", "processed"]) {
      const directory = join(root, "inbox", sub);
      if (!existsSync(directory)) continue;
      for (const name of readdirSync(directory)) {
        if (!name.endsWith(".json")) continue;
        found.push(JSON.parse(readFileSync(join(directory, name), "utf8")));
      }
    }
    return found;
  };
  made.waitForEvents = (count, timeoutMs = 4000) =>
    waitFor(() => made.events().length >= count, timeoutMs);
  made.run = (name, files = {}) => {
    const dir = join(root, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "owner.json"), JSON.stringify({ name: "t9_executor", pane_id: "pane-1", session_file: "s1" }), "utf8");
    writeFileSync(join(dir, "limits.json"), JSON.stringify({ stall: 2, overlong: 5, extensions: [] }), "utf8");
    // The test process itself is the stand-in for a live run's pid: always alive.
    writeFileSync(join(dir, "pid"), `${process.pid}\n`, "utf8");
    writeFileSync(join(dir, "command"), files.command ?? "true", "utf8");
    writeFileSync(join(dir, "log"), files.log ?? "", "utf8");
    for (const [key, value] of Object.entries(files.write ?? {})) writeFileSync(join(dir, key), value, "utf8");
    return dir;
  };
  // Locking the inbox before a relay starts is how the fallback path is proven: the
  // sender must then deliver by the older text prompt instead of losing the event.
  made.lockInbox = () => {
    const inbox = join(root, "inbox");
    mkdirSync(inbox, { recursive: true });
    chmodSync(inbox, 0o500);
    return inbox;
  };
  made.watch = (dir, { graceSeconds = 600, pollMs = 40 } = {}) => {
    const script = join(root, "watch-loop.mjs");
    writeFileSync(
      script,
      `import { watch } from ${JSON.stringify(join(import.meta.dirname, "..", "lib", "run-relay.mjs"))};
const outcome = watch(${JSON.stringify(dir)}, { pollMs: ${pollMs}, graceSeconds: ${graceSeconds} });
console.log("OUTCOME " + JSON.stringify(outcome));
`,
      "utf8",
    );
    const child = spawn(process.execPath, [script], {
      env: {
        ...process.env,
        RUN_RELAY_HERDR_BIN: made.bin,
        // Every test gets its own inbox: without this the relay would write events to
        // the production directory, and emit-first would swallow the fallback prompt
        // the assertions below are about.
        ORCH_EVENTS_DIR: join(root, "inbox"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => made.log.push(String(chunk)));
    child.stderr.on("data", (chunk) => made.log.push(String(chunk)));
    // Attached at once, so a relay that exits before the test looks is still seen.
    made.exited = new Promise((done) => child.on("exit", (code) => done(code)));
    made.children.push(child);
    return child;
  };
  return made;
}

const boxAgent = { name: "t9_executor", pane_id: "pane-1", agent_status: "idle", agent_session: { value: "s1" } };

function waitFor(predicate, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((done, fail) => {
    const tick = () => {
      if (predicate()) return done();
      if (Date.now() > deadline) return fail(new Error("timed out waiting"));
      setTimeout(tick, 20);
    };
    tick();
  });
}

/**
 * Await the relay's exit, but not forever: a relay that cannot see the run is
 * still running, and that is the finding, not a hang.
 */
function awaitExit(box, ms = 4000) {
  return Promise.race([
    box.exited,
    new Promise((_, fail) => setTimeout(() => fail(new Error("the relay is still watching after " + ms + "ms")), ms)),
  ]);
}

describe("watch loop", () => {
  test("a finished run knocks the owner with the RUN_EVENT line", async () => {
    const dir = box.run("knock-done", { write: { exit: "0\n" } });
    box.watch(dir);
    await waitFor(() => box.read().some((line) => line.includes("STATE=DONE")));
    const line = box.read().find((entry) => entry.includes("STATE=DONE"));
    assert.equal(line, `t9_executor\tRUN_EVENT: RUN=knock-done STATE=DONE EXIT=0 RUN_DIR=${dir} NEXT=run_command status`);
  });

  test("a knock acked in time is never escalated", async () => {
    const dir = box.run("acked", { write: { exit: "0\n" } });
    box.watch(dir);
    await waitFor(() => box.read().length > 0);
    writeAck(dir, Date.now() / 1000);
    await new Promise((done) => setTimeout(done, 500));
    assert.deepEqual(box.read().filter((line) => line.includes("RELAY_EVENT")), []);
    assert.equal(existsSync(join(dir, "escalated")), false);
  });

  test("a knock with no ack escalates exactly once, then the relay exits", async () => {
    const dir = box.run("unanswered", { write: { exit: "0\n" } });
    const child = box.watch(dir, { graceSeconds: 0.2 });
    await awaitExit(box);
    // R2 transport: the escalation is an inbox event, and the text prompt is only the
    // fallback. The knock that preceded it still went to the owner as a prompt.
    const escalations = box.events().filter((event) => event.status === "agent_unresponsive");
    assert.equal(escalations.length, 1, JSON.stringify(box.events()));
    const event = escalations[0];
    assert.equal(event.task, "unanswered");
    assert.equal(event.agent, "t9_executor");
    assert.equal(event.status, "agent_unresponsive");
    assert.equal(event.wait_get, "unknown");
    assert.equal(event.artifact_or_report, dir);
    assert.equal(event.tsk_id, "none");
    assert.equal(event.orchestrator_action, "inspect-agent");
    assert.match(event.extra, /^KNOCK=DONE UNANSWERED_SECONDS=\d+$/);
    assert.ok(!JSON.stringify(event).includes("hung"), "the event must not claim a hang it cannot prove");
    // Exactly one delivery: with the inbox writable, no prompt was used for the escalation.
    assert.deepEqual(box.read().filter((line) => line.includes("agent_unresponsive")), []);
    assert.ok(existsSync(join(dir, "escalated")));
    assert.equal(child.killed, false);
  });

  test("an escalation already sent is never sent again after a relay restart", async () => {
    const dir = box.run("restart", { write: { exit: "0\n" } });
    box.watch(dir, { graceSeconds: 0.2 });
    await awaitExit(box);
    assert.equal(box.events().filter((event) => event.status === "agent_unresponsive").length, 1);
    // A second relay on the same run sees the marker and stays silent.
    box.watch(dir, { graceSeconds: 0.2 });
    await awaitExit(box);
    assert.equal(box.events().filter((event) => event.status === "agent_unresponsive").length, 1);
    assert.deepEqual(box.read().filter((line) => line.includes("agent_unresponsive")), []);
  });

  test("an owner replaced in the registry ends the watch with no knock", async () => {
    const dir = box.run("replaced", { write: { exit: "0\n" } });
    box.registry([]);
    box.watch(dir);
    await awaitExit(box);
    assert.deepEqual(box.read(), []);
    assert.match(readFileSync(join(dir, "relay.log"), "utf8"), /exit reason=owner_gone/);
  });

  test("failed registry reads do not exit the watch and do not knock an unverified name", async () => {
    const dir = box.run("bad-registry", { write: { exit: "0\n" } });
    const child = box.watch(dir);
    box.stub("exit 1");
    await new Promise((done) => setTimeout(done, 500));
    assert.equal(child.exitCode, null, "the relay exited on an unreadable registry");
    assert.deepEqual(box.read(), []);
    // The registry comes back: the same relay then does its one job.
    box.stub(`cat "${box.root}/registry.json"`);
    box.registry([boxAgent]);
    await waitFor(() => box.read().some((line) => line.includes("STATE=DONE")));
  });

  test("a stalled quiet run knocks the owner once per window", async () => {
    const dir = box.run("stalled", { log: "first\n" });
    box.watch(dir);
    await waitFor(() => box.read().some((line) => line.includes("STATE=STALLED")));
    await new Promise((done) => setTimeout(done, 400));
    assert.equal(box.read().filter((line) => line.includes("STATE=STALLED")).length, 1);
    assert.match(box.read().find((line) => line.includes("STALLED")), /NEXT=run_command status\|extend\|stop/);
  });

  test("a stopped run ends the watch quietly", async () => {
    const dir = box.run("stopped-run", { write: { "stopped.json": "{}" } });
    assert.equal(readSnapshot(dir).state, "STOPPED", "stopped.json must decide the state");
    box.watch(dir);
    await awaitExit(box);
    assert.deepEqual(box.read(), []);
    assert.match(readFileSync(join(dir, "relay.log"), "utf8"), /exit reason=stopped/);
  });

  test("a run folder that disappears ends the watch", async () => {
    const dir = box.run("reaped", { write: { exit: "0\n" } });
    const { child, exited } = (() => { const c = box.watch(dir); return { child: c, exited: box.exited }; })();
    rmSync(dir, { recursive: true, force: true });
    await new Promise((done) => setTimeout(done, 500));
    assert.equal(child.exitCode !== null, true, "the relay kept watching a folder that no longer exists");
  });

  test("the relay records its knocks in the run folder", async () => {
    const dir = box.run("knockfile", { write: { exit: "3\n" } });
    box.watch(dir);
    await waitFor(() => readKnocks(dir).length > 0);
    assert.equal(readKnocks(dir)[0].key, "DONE");
    assert.ok(readKnocks(dir)[0].at > 0);
    assert.equal(readSnapshot(dir).state, "DONE");
  });

  test("an unwritable inbox does not lose the escalation: it goes as a prompt", async () => {
    // The whole point of emit-then-fallback: the event must arrive by one channel or
    // the other, never by neither and never by both.
    box.lockInbox();
    const dir = box.run("fallback-esc", { write: { exit: "0\n" } });
    box.watch(dir, { graceSeconds: 0.2 });
    await awaitExit(box);
    const escalations = box.read().filter((line) => line.includes("agent_unresponsive"));
    assert.equal(escalations.length, 1, escalations.join("\n"));
    assert.match(
      escalations[0],
      /^orchestrator\tRELAY_EVENT: TASK=fallback-esc AGENT=t9_executor STATUS=agent_unresponsive WAIT_GET=unknown /,
    );
    assert.match(escalations[0], /KNOCK=DONE UNANSWERED_SECONDS=\d+/);
    assert.ok(existsSync(join(dir, "escalated")), "the marker must still be written on the fallback path");
  });

  test("an unwritable inbox does not lose the grant request either", async () => {
    box.lockInbox();
    const dir = box.run("fallback-ask", { write: { exit: "0\n" } });
    box.watch(dir, { graceSeconds: 30 });
    await waitFor(() => box.read().some((line) => line.includes("STATE=DONE")));
    writeFileSync(join(dir, "extension-requested.json"), "{}", "utf8");
    await waitFor(() => box.read().some((line) => line.includes("STATUS=extension_request")));
    const requests = box.read().filter((line) => line.includes("STATUS=extension_request"));
    assert.equal(requests.length, 1, requests.join("\n"));
    assert.match(requests[0], /STATUS=extension_request .*EXTENSIONS_USED=\d+ GRANT_FILE=.+\/grant/);
  });

  test("a recorded knock never becomes an inbox event (owner knock path untouched)", async () => {
    // The knock belongs to the pane, not to the inbox. R2 must not have redirected it.
    const dir = box.run("knock-channel", { write: { exit: "0\n" } });
    box.watch(dir, { graceSeconds: 30 });
    await waitFor(() => box.read().some((line) => line.includes("STATE=DONE")));
    await new Promise((done) => setTimeout(done, 300));
    assert.match(box.read().find((line) => line.includes("STATE=DONE")), /^t9_executor\tRUN_EVENT: RUN=knock-channel/);
    assert.deepEqual(box.events(), [], "a knock was written to the relay inbox");
  });

  test("an extension grant request reaches the Orchestrator once", async () => {
    const dir = box.run("grant-ask", { write: { exit: "0\n" } });
    box.watch(dir, { graceSeconds: 30 });
    await waitFor(() => box.read().some((line) => line.includes("STATE=DONE")));
    writeFileSync(join(dir, "extension-requested.json"), "{}", "utf8");
    // The request is an inbox event now; the owner knock before it is still a prompt.
    await box.waitForEvents(1);
    const requests = box.events().filter((event) => event.status === "extension_request");
    assert.equal(requests.length, 1, JSON.stringify(box.events()));
    assert.equal(requests[0].task, "grant-ask");
    assert.equal(requests[0].orchestrator_action, "inspect-agent");
    assert.match(requests[0].extra, /^EXTENSIONS_USED=\d+ GRANT_FILE=.+\/grant$/);
    assert.deepEqual(box.read().filter((line) => line.includes("STATUS=extension_request")), []);
    // The knock that preceded it is untouched: still one prompt to the owner.
    assert.equal(box.read().filter((line) => line.includes("STATE=DONE")).length, 1);
  });
});

// --- R2.8: follow-through on review finding F1 ---------------------------------------
//
// Both pin behaviour stock `main` already had, so they read as R1 outcomes and not as
// R2 changes. They were run green against a pristine copy of main at 08cc3e0 first;
// see the implementation report.

describe("contracted facts the R1 suite left unpinned (F1 follow-through)", () => {
  // F1 gap one: the owner binding is the pane and the session, never the name alone.
  // A reused name at a different pane is critique C3's stale-knock case.
  test("ownerMatch is false for the same name at a different pane", () => {
    const owner = { name: "t42_executor", pane_id: "pane-1", session_file: "s1" };
    const agents = [{ name: "t42_executor", pane_id: "pane-2", agent_session: { value: "s1" } }];
    assert.equal(ownerMatch(agents, owner), false, "a same-name agent in another pane is not our owner");
    // The same agent at the right pane does match, so the refusal above is the pane check.
    assert.equal(ownerMatch([{ name: owner.name, pane_id: "pane-1", agent_session: { value: "s1" } }], owner), true);
  });

  // F1 gap three: the production grace default, which every R1 test overrode.
  test("the knock grace default is 600 seconds", () => {
    assert.equal(KNOCK_GRACE_SECONDS, 600);
  });
});

// --- F2: the transport interaction Release 2 changes and Release 2 does not fix ------
//
// Review finding F2: a 4th+ extension request is recorded as an unanswered knock, so
// decide() can later label the owner agent_unresponsive with KNOCK=OVERLONG even
// though the owner was never asked to act. R2 deliberately implements no fix. These
// tests pin the interaction as it stands, so the next release inherits a fact and not
// a rumour.

describe("F2: a grant request is still counted as a knock (no exclusion in R2)", () => {
  test("decide() still escalates after a grant request the owner never answered", () => {
    // The R1 sequence: an OVERLONG knock is recorded, the run asks for a 4th extension,
    // the request goes out, and the owner never touches the run. `request` does not
    // write `ack`, so the OVERLONG knock keeps ageing.
    const knocks = [knock("OVERLONG", T0 + 1200, 0, { event: "grant_request" })];
    // 601 s after the OVERLONG knock, not after the request: the request is what proves
    // the owner was never asked to act on the run, and it does not write `ack`.
    const actions = decide(snap({ extension_requested: true, extensions_used: 3, ack: 0 }), T0 + 1200 + 601, GRACE, knocks);
    assert.deepEqual(
      kinds(actions),
      ["escalate", "exit"],
      "R2 was expected to change nothing here; a different result means F2 moved on its own",
    );
    assert.equal(actions[0].state, "OVERLONG");
    assert.equal(actions[0].unanswered_seconds, 601);
  });

  test("the F2 escalation is delivered with the same fields, excluding nothing", () => {
    // No field is withheld because the knock came from a grant request: the event still
    // says agent_unresponsive with the knock that aged out, exactly as R1 phrased it.
    const line = renderFlatLine({
      task: "abc",
      agent: "t9_executor",
      status: "agent_unresponsive",
      wait_get: "unknown",
      artifact_or_report: "/runs/abc",
      tsk_id: "none",
      relay_log: "/runs/abc/relay.log",
      extra: "KNOCK=OVERLONG UNANSWERED_SECONDS=601",
    });
    assert.match(line, /STATUS=agent_unresponsive/);
    assert.match(line, /KNOCK=OVERLONG UNANSWERED_SECONDS=601$/);
    assert.ok(!/extension_request/.test(line), "R2 must not relabel the F2 escalation");
  });
});
