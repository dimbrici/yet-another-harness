// Tests for the generated dispatch relay script.
//
// The script is rendered, written to a temp dir, and run under real `bash` with a
// stub `herdr` first on PATH. The stub answers `agent get` from a file the test
// rewrites between polls, and records every `agent prompt` call, so the test counts
// events instead of trusting the log.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";

import { relayScript, shellQuote, briefMismatch } from "../lib/relay-script.mjs";
import { findRelayLib as relayLib, RELAY_LIB_HINT } from "./orch-test-home.mjs";

const RELAY_LIB_SOURCE = relayLib();

let box;

beforeEach(() => {
  box = makeBox();
});

afterEach(() => {
  if (box.relay?.exitCode === null) box.relay.kill("SIGKILL");
  // The inbox starts unwritable on purpose: make it removable again before teardown.
  for (const sub of ["pending", "processed"]) {
    try {
      chmodSync(join(box.inbox, sub), 0o755);
    } catch {}
  }
  rmSync(box.root, { recursive: true, force: true });
});

function makeBox() {
  const root = mkdtempSync(join(tmpdir(), "relay-script-test-"));
  const box = {
    root,
    binDir: join(root, "bin"),
    stateFile: join(root, "state.json"),
    promptsFile: join(root, "prompts.log"),
    report: join(root, "report.md"),
    stamp: join(root, "armed.stamp"),
    log: join(root, "relay.log"),
    lib: join(root, "relay-lib.sh"),
    inbox: join(root, "inbox"),
  };
  mkdirSync(box.binDir);
  // Every test owns its inbox: without this a relay would write into the production
  // directory. It starts unwritable, so the generated relay falls back to the text
  // prompt and the assertions below keep proving that transport. box.openInbox()
  // switches the same relay onto the inbox path.
  mkdirSync(join(box.inbox, "pending"), { recursive: true });
  mkdirSync(join(box.inbox, "processed"), { recursive: true });
  chmodSync(join(box.inbox, "pending"), 0o500);
  chmodSync(join(box.inbox, "processed"), 0o500);
  box.openInbox = () => {
    chmodSync(join(box.inbox, "pending"), 0o755);
    chmodSync(join(box.inbox, "processed"), 0o755);
  };
  box.inboxEvents = () => {
    const directory = join(box.inbox, "pending");
    if (!existsSync(directory)) return [];
    return readdirSync(directory)
      .filter((name) => name.endsWith(".json"))
      .map((name) => JSON.parse(readFileSync(join(directory, name), "utf8")));
  };
  // The library under test is copied unchanged, so the test proves the real helpers.
  assert.ok(RELAY_LIB_SOURCE, `no relay-lib.sh found: ${RELAY_LIB_HINT}`);
  copyFileSync(RELAY_LIB_SOURCE, box.lib);
  // `herdr` must answer `agent get` with the file the test rewrites, and `agent list`
  // with a registry. Prompts are recorded, never delivered.
  writeFileSync(
    join(box.binDir, "herdr"),
    `#!/usr/bin/env bash
if [ "$1$2" = "agentget" ] || [ "$2" = "get" ]; then
  cat "${box.stateFile}"
  exit 0
fi
if [ "$2" = "list" ]; then
  printf '{"result":{"agents":[]}}\\n'
  exit 0
fi
if [ "$2" = "prompt" ]; then
  printf '%s\\t%s\\n' "$3" "$4" >> "${box.promptsFile}"
  exit 0
fi
exit 0
`,
    "utf8",
  );
  chmodSync(join(box.binDir, "herdr"), 0o755);
  writeFileSync(box.stateFile, JSON.stringify({ result: { agent: { agent_status: "working" } } }), "utf8");
  writeFileSync(box.stamp, "", "utf8");
  box.prompts = () =>
    existsPrompts(box) ? readFileSync(box.promptsFile, "utf8").trim().split("\n").filter(Boolean) : [];
  box.state = (agent) => {
    writeFileSync(box.stateFile, JSON.stringify({ result: { agent } }), "utf8");
  };
  box.gone = () =>
    writeFileSync(box.stateFile, JSON.stringify({ error: { code: "agent_not_found", message: "no such agent" } }), "utf8");
  box.unparseable = () => writeFileSync(box.stateFile, "this is not json at all", "utf8");
  box.withReport = (marker) => {
    writeFileSync(box.report, `body\n${marker}\n`, "utf8");
    spawnSync("touch", ["-t", "203001010000.00", box.report]);
  };
  box.relay = startRelay(box);
  // Attached at once, so a relay that exits before the test looks is still awaited.
  box.relayExit = new Promise((done) => box.relay.on("exit", done));
  return box;
}

function relayLog(box) {
  try {
    return readFileSync(box.log, "utf8");
  } catch {
    return "";
  }
}

function existsPrompts(box) {
  try {
    return readFileSync(box.promptsFile, "utf8").length > 0;
  } catch {
    return false;
  }
}

function startRelay(box, extraEnv = {}) {
  const script = join(box.root, "watch.sh");
  writeFileSync(
    script,
    relayScript({
      agent: "t9_executor",
      task: "T9-IMPL",
      report: box.report,
      marker: "READY: T9",
      tskId: "T9",
      relayLib: box.lib,
      stamp: box.stamp,
      log: box.log,
    }),
    "utf8",
  );
  chmodSync(script, 0o755);
  const relay = spawn("/bin/bash", [script], {
    env: {
      ...process.env,
      PATH: `${box.binDir}:${process.env.PATH}`,
      RELAY_POLL_SECONDS: "0.1",
      ORCH_EVENTS_DIR: box.inbox,
      ...extraEnv,
    },
    stdio: "ignore",
  });
  return relay;
}

// Replace the box's already-started relay with one carrying extra env (a short
// IDLE_GRACE_SECONDS for the idle-without-delivery tests). The old relay is killed
// first so only one watcher ever writes to the box's log and prompt record.
function restartRelay(box, extraEnv) {
  box.relay.kill("SIGKILL");
  box.relay = startRelay(box, extraEnv);
  box.relayExit = new Promise((done) => box.relay.on("exit", done));
}

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

const settled = (prompts) => prompts.filter((line) => line.includes("STATUS=settled"));
const goneEvents = (prompts) => prompts.filter((line) => line.includes("STATUS=gone"));
const providerEvents = (prompts) => prompts.filter((line) => line.includes("STATUS=provider_error"));
const idleMissedEvents = (prompts) => prompts.filter((line) => line.includes("STATUS=idle_no_delivery"));

describe("generated script shape", () => {
  test("the KEY='value' lines still parse with the index regex", () => {
    const text = relayScript({
      agent: "t9_executor",
      task: "T9-IMPL",
      report: "/tmp/r.md",
      marker: "READY: T9",
      tskId: "T9",
      relayLib: "/tmp/relay-lib.sh",
      stamp: "/tmp/armed",
      log: "/tmp/relay.log",
    });
    const field = (key) => new RegExp(`(?:^|[;\\s])${key}='([^']*)'`, "m").exec(text)?.[1];
    assert.equal(field("AGENT"), "t9_executor");
    assert.equal(field("TASK"), "T9-IMPL");
    assert.equal(field("REPORT"), "/tmp/r.md");
    assert.equal(field("MARKER"), "READY: T9");
    assert.equal(field("TSK_ID"), "T9");
  });

  test("shellQuote survives a single quote in a value", () => {
    assert.equal(shellQuote("it's"), `'it'\\''s'`);
    const out = spawnSync("/bin/bash", ["-c", `printf '%s' ${shellQuote("a'b")}`], { encoding: "utf8" });
    assert.equal(out.stdout, "a'b");
  });

  test("orch-dispatch.ts imports the lib and no longer defines the script locally", () => {
    const text = readFileSync(join(import.meta.dirname, "..", "orch-dispatch.ts"), "utf8");
    assert.match(text, /import \{ relayScript \} from "\.\/lib\/relay-script\.mjs";/);
    assert.ok(!/^function relayScript/m.test(text), "relayScript is still defined here");
    assert.ok(!/^function shellQuote/m.test(text), "shellQuote is still defined here");
  });

  test("the poll interval is overridable and defaults to 20", () => {
    const text = relayScript({ agent: "a", task: "t", report: "r", marker: "m", tskId: "", relayLib: "l", stamp: "s", log: "g" });
    assert.match(text, /sleep "\$\{RELAY_POLL_SECONDS:-20\}"/);
    assert.ok(!/sleep 20/.test(text));
  });
});

describe("settle branch (unchanged behaviour)", () => {
  test("a fresh report with the marker settles and exits", async () => {
    box.state({ agent_status: "idle" });
    box.withReport("READY: T9");
    await box.relayExit;
    assert.deepEqual(goneEvents(box.prompts()), []);
    assert.equal(settled(box.prompts()).length, 1);
    assert.match(settled(box.prompts())[0], /^orchestrator\tRELAY_EVENT: TASK=T9-IMPL AGENT=t9_executor STATUS=settled WAIT_GET=done /);
    assert.match(settled(box.prompts())[0], /TSK_ID=T9 ORCHESTRATOR_ACTION=update-tsk-board/);
  });

  test("a working agent with the report does not settle", async () => {
    box.withReport("READY: T9");
    box.state({ agent_status: "working" });
    await new Promise((done) => setTimeout(done, 400));
    assert.deepEqual(box.prompts(), []);
    assert.equal(box.relay.exitCode, null);
  });

  test("an old report without the marker settles nothing", async () => {
    writeFileSync(box.report, "no marker here\n", "utf8");
    box.state({ agent_status: "idle" });
    await new Promise((done) => setTimeout(done, 400));
    assert.deepEqual(box.prompts(), []);
  });
});

describe("gone branch", () => {
  test("three confirmed-gone reads fire once and exit", async () => {
    box.gone();
    await waitFor(() => goneEvents(box.prompts()).length >= 1);
    await new Promise((done) => setTimeout(done, 300));
    assert.equal(goneEvents(box.prompts()).length, 1);
    await box.relayExit;
    assert.match(goneEvents(box.prompts())[0], /STATUS=gone WAIT_GET=unknown .*GONE_READS=3/);
    assert.match(goneEvents(box.prompts())[0], /ORCHESTRATOR_ACTION=inspect-agent/);
    assert.ok(!/run|RUN_DIR|pid=/i.test(goneEvents(box.prompts())[0]), "the gone event must not list runs");
  });

  test("two gone reads then a normal read fire nothing", async () => {
    box.gone();
    await waitFor(() => relayLog(box).includes("confirmed_reads=2"));
    box.state({ agent_status: "working" });
    await new Promise((done) => setTimeout(done, 600));
    assert.deepEqual(goneEvents(box.prompts()), []);
    assert.equal(box.relay.exitCode, null);
  });

  test("a transient failure (bad JSON) is unknown, never gone", async () => {
    box.unparseable();
    // Wait for four polls that each proved the read was unknown, so the clock cannot
    // decide the outcome: a relay that treated the failure as gone is long gone itself.
    await waitFor(() => (relayLog(box).match(/confirmed_reads=0/g) || []).length >= 4);
    assert.deepEqual(goneEvents(box.prompts()), []);
    assert.equal(box.relay.exitCode, null);
  });
});

describe("blocked branch", () => {
  test("blocked fires provider_error once with the label, and keeps watching", async () => {
    box.state({ agent_status: "blocked", message: "provider_error: 429 slow down" });
    await waitFor(() => providerEvents(box.prompts()).length >= 1);
    await new Promise((done) => setTimeout(done, 500));
    assert.equal(providerEvents(box.prompts()).length, 1);
    assert.match(providerEvents(box.prompts())[0], /LABEL=provider_error: 429 slow down/);
    assert.match(providerEvents(box.prompts())[0], /STATUS=provider_error WAIT_GET=blocked/);
    assert.equal(box.relay.exitCode, null, "blocked must not end the watch");
  });

  test("blocked fires again after the agent worked and blocked once more", async () => {
    box.state({ agent_status: "blocked", message: "provider_error: first" });
    await waitFor(() => providerEvents(box.prompts()).length === 1);
    box.state({ agent_status: "working" });
    await new Promise((done) => setTimeout(done, 300));
    box.state({ agent_status: "blocked", message: "provider_error: second" });
    await waitFor(() => providerEvents(box.prompts()).length === 2);
    assert.equal(providerEvents(box.prompts()).length, 2);
    assert.match(providerEvents(box.prompts())[1], /LABEL=provider_error: second/);
  });

  test("a blocked label herdr does not report is said as unreported", async () => {
    box.state({ agent_status: "blocked" });
    await waitFor(() => providerEvents(box.prompts()).length === 1);
    assert.match(providerEvents(box.prompts())[0], /LABEL=unreported/);
  });

  test("blocked with a fresh report settles rather than escalating twice", async () => {
    box.state({ agent_status: "blocked", message: "provider_error: late" });
    await waitFor(() => providerEvents(box.prompts()).length === 1);
    box.withReport("READY: T9");
    await box.relayExit;
    assert.equal(settled(box.prompts()).length, 1);
    assert.equal(providerEvents(box.prompts()).length, 1);
  });
});

describe("idle branch", () => {
  test("plain idle with no report fires nothing", async () => {
    box.state({ agent_status: "idle" });
    await new Promise((done) => setTimeout(done, 800));
    assert.deepEqual(box.prompts(), []);
    assert.equal(box.relay.exitCode, null);
  });

  test("idle past the grace fires ONE idle_no_delivery; only a working turn rearms", async () => {
    restartRelay(box, { IDLE_GRACE_SECONDS: "0" });
    box.state({ agent_status: "idle" });
    await waitFor(() => idleMissedEvents(box.prompts()).length >= 1);
    await new Promise((done) => setTimeout(done, 600));
    assert.equal(idleMissedEvents(box.prompts()).length, 1, "one-shot: no repeat during the same gap");
    const event = idleMissedEvents(box.prompts())[0];
    assert.match(event, /STATUS=idle_no_delivery WAIT_GET=idle /);
    assert.match(event, /ORCHESTRATOR_ACTION=inspect-agent/);
    assert.match(event, /MISSING=report-missing/);
    assert.equal(box.relay.exitCode, null, "idle_no_delivery must not end the watch");
    // A working turn rearms; the next idle gap earns its own single event.
    box.state({ agent_status: "working" });
    await new Promise((done) => setTimeout(done, 400));
    assert.equal(idleMissedEvents(box.prompts()).length, 1, "nothing fires while working");
    box.state({ agent_status: "idle" });
    await waitFor(() => idleMissedEvents(box.prompts()).length === 2);
    await new Promise((done) => setTimeout(done, 400));
    assert.equal(idleMissedEvents(box.prompts()).length, 2, "one event per gap");
  });

  test("a fresh report WITHOUT the marker says marker-missing and lists newer TASK files", async () => {
    writeFileSync(box.report, "a body with no marker\n", "utf8");
    spawnSync("touch", ["-t", "203001010000.00", box.report]);
    const sibling = join(box.root, "T9-IMPL-stray.md");
    writeFileSync(sibling, "the worker wrote here instead\n", "utf8");
    spawnSync("touch", ["-t", "203001010000.00", sibling]);
    restartRelay(box, { IDLE_GRACE_SECONDS: "0" });
    box.state({ agent_status: "idle" });
    await waitFor(() => idleMissedEvents(box.prompts()).length >= 1);
    const event = idleMissedEvents(box.prompts())[0];
    assert.match(event, /MISSING=marker-missing/);
    assert.ok(event.includes(sibling), `MATCHES must list ${sibling}: ${event}`);
  });

  test("a fresh report WITH the marker settles normally even while idle", async () => {
    box.withReport("READY: T9");
    box.state({ agent_status: "idle" });
    await box.relayExit;
    assert.equal(settled(box.prompts()).length, 1);
    assert.deepEqual(idleMissedEvents(box.prompts()), [], "no idle alarm when the gate tripped");
  });

  test("the idle_no_delivery event reaches the inbox as a file", async () => {
    box.openInbox();
    restartRelay(box, { IDLE_GRACE_SECONDS: "0" });
    box.state({ agent_status: "done" });
    await waitFor(() => box.inboxEvents().some((event) => event.status === "idle_no_delivery"));
    const events = box.inboxEvents().filter((event) => event.status === "idle_no_delivery");
    assert.equal(events.length, 1, JSON.stringify(box.inboxEvents()));
    assert.equal(events[0].wait_get, "done");
    assert.equal(events[0].orchestrator_action, "inspect-agent");
    assert.match(events[0].extra, /^MISSING=report-missing MATCHES=/);
    assert.deepEqual(box.prompts(), []);
  });
});

// --- R2: the inbox is the primary transport, the text prompt is the fallback --------

describe("emit-first transport (Release 2)", () => {
  test("with a writable inbox the settled event is a file, and no prompt is sent", async () => {
    box.openInbox();
    box.state({ agent_status: "idle" });
    box.withReport("READY: T9");
    await box.relayExit;
    const events = box.inboxEvents();
    assert.equal(events.length, 1, JSON.stringify(events));
    const event = events[0];
    assert.equal(event.kind, "relay");
    assert.equal(event.task, "T9-IMPL");
    assert.equal(event.agent, "t9_executor");
    assert.equal(event.status, "settled");
    assert.equal(event.wait_get, "done");
    assert.equal(event.artifact_or_report, box.report);
    assert.equal(event.tsk_id, "T9");
    assert.equal(event.orchestrator_action, "update-tsk-board");
    assert.equal(event.relay_log, box.log);
    assert.match(event.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    // Exactly one delivery: the fallback prompt must not also have fired.
    assert.deepEqual(box.prompts(), []);
  });

  test("a gone event carries its extra and asks only to be looked at", async () => {
    box.openInbox();
    box.gone();
    await box.relayExit;
    const events = box.inboxEvents();
    assert.equal(events.length, 1, JSON.stringify(events));
    assert.equal(events[0].status, "gone");
    assert.equal(events[0].wait_get, "unknown");
    assert.equal(events[0].orchestrator_action, "inspect-agent");
    assert.equal(events[0].extra, "GONE_READS=3");
    assert.deepEqual(box.prompts(), []);
  });

  test("when the inbox cannot be written the relay still delivers the R1 text prompt", async () => {
    // The box default is an unwritable inbox: same relay, other channel taken away.
    box.state({ agent_status: "idle" });
    box.withReport("READY: T9");
    await box.relayExit;
    assert.equal(settled(box.prompts()).length, 1);
    assert.match(box.prompts()[0], /^orchestrator\tRELAY_EVENT: TASK=T9-IMPL .*STATUS=settled/);
    assert.deepEqual(box.inboxEvents(), []);
  });

  test("a provider_error that reaches the inbox keeps the blocked label in its extra", async () => {
    box.openInbox();
    box.state({ agent_status: "blocked", message: "provider_error: 429 slow down" });
    await waitFor(() => box.inboxEvents().length >= 1);
    const events = box.inboxEvents().filter((event) => event.status === "provider_error");
    assert.equal(events.length, 1, JSON.stringify(box.inboxEvents()));
    assert.equal(events[0].wait_get, "blocked");
    assert.match(events[0].extra, /^LABEL=provider_error: 429 slow down$/);
    assert.deepEqual(box.prompts(), []);
  });
});

// --- R2.8: follow-through on review finding F1 ---------------------------------------
//
// These two pin behaviour stock `main` already had, so they read as R1 outcomes rather
// than R2 changes. They were run green against a pristine copy of main at 08cc3e0
// first; see the implementation report.

test("relay_is_gone treats only agent_not_found as gone (F1 follow-through)", () => {
  const lib = relayLib();
  const stubDir = join(box.root, "is-gone-bin");
  mkdirSync(stubDir, { recursive: true });
  const stub = join(stubDir, "herdr");
  const state = join(box.root, "is-gone-state.json");
  writeFileSync(stub, `#!/usr/bin/env bash\ncat "${state}"\nexit 0\n`, "utf8");
  chmodSync(stub, 0o755);
  const env = { ...process.env, PATH: `${stubDir}:${process.env.PATH}` };
  const status = (body) => {
    writeFileSync(state, body, "utf8");
    return spawnSync("/bin/bash", ["-c", `source '${lib}'; relay_is_gone an_agent`], { env }).status;
  };
  assert.equal(status(JSON.stringify({ error: { code: "agent_busy" } })), 1, "agent_busy is not gone");
  assert.equal(status("{}"), 1, "an empty answer is not gone");
  assert.equal(status(JSON.stringify({ error: { code: "agent_not_found" } })), 0, "agent_not_found is gone");
});

// P3b: herdr 0.9.1 answers a missing agent with EMPTY stdout, the error JSON on
// STDERR, exit 0 (verified live 2026-10-09). relay_is_gone must read that body;
// before the fix it discarded stderr with 2>/dev/null, so removed agents never
// confirmed as gone and their watchers lingered as zombies.
test("relay_is_gone reads agent_not_found from stderr, the shape real herdr writes", () => {
  const lib = relayLib();
  const stubDir = join(box.root, "is-gone-stderr-bin");
  mkdirSync(stubDir, { recursive: true });
  const errState = join(box.root, "is-gone-stderr-body.txt");
  writeFileSync(join(stubDir, "herdr"), `#!/usr/bin/env bash\ncat "${errState}" >&2\nexit 0\n`, "utf8");
  chmodSync(join(stubDir, "herdr"), 0o755);
  const env = { ...process.env, PATH: `${stubDir}:${process.env.PATH}` };
  const status = (body) => {
    writeFileSync(errState, body, "utf8");
    return spawnSync("/bin/bash", ["-c", `source '${lib}'; relay_is_gone an_agent`], { env }).status;
  };
  assert.equal(
    status(JSON.stringify({ error: { code: "agent_not_found", message: "no such agent" }, id: "cli:agent:get" })),
    0,
    "stderr-carried agent_not_found is gone",
  );
  assert.equal(status(JSON.stringify({ error: { code: "agent_busy" } })), 1, "stderr agent_busy is not gone");
  assert.equal(status("plain error text, not json"), 1, "an unreadable stderr body stays unknown");
  assert.equal(status(""), 1, "no body at all stays unknown");
});

// --- P1: the dispatch-time single-sourcing check ---------------------------------

describe("briefMismatch (orch_dispatch pre-submit cross-check)", () => {
  const REPORT_ABS = "/tmp/scen/reports/LANE-run.md";
  test("passes when the brief literally carries the path and the marker", () => {
    const brief = `Report: write to ${REPORT_ABS}. Final line exactly:\nDONE: LANE`;
    assert.deepEqual(briefMismatch(brief, REPORT_ABS, REPORT_ABS, "DONE: LANE"), []);
  });

  test("a brief may author the path relatively: the as-given string counts", () => {
    const brief = "Write reports/LANE-run.md ending DONE: LANE";
    assert.deepEqual(briefMismatch(brief, "reports/LANE-run.md", REPORT_ABS, "DONE: LANE"), []);
  });

  test("names reportPath when neither form appears (habit A: bare path dispatched)", () => {
    const brief = "Write reports/LANE-run.md ending DONE: LANE";
    assert.deepEqual(briefMismatch(brief, "reports/LANE.md", "/tmp/scen/reports/LANE.md", "DONE: LANE"), [
      "reportPath",
    ]);
  });

  test("names marker when the marker is absent", () => {
    const brief = `Write ${REPORT_ABS} and finish when done.`;
    assert.deepEqual(briefMismatch(brief, REPORT_ABS, REPORT_ABS, "READY_FOR_REVIEW: LANE"), ["marker"]);
  });

  test("names both failures together", () => {
    assert.deepEqual(briefMismatch("nothing here", "x.md", "/tmp/x.md", "NOPE"), ["reportPath", "marker"]);
  });

  test("orch-dispatch.ts runs the check before any herdr work, flag-gated", () => {
    const text = readFileSync(join(import.meta.dirname, "..", "orch-dispatch.ts"), "utf8");
    const guard = text.indexOf("if (!params.allowUnmatchedBrief)");
    const check = text.indexOf("briefMismatch(brief,");
    const firstHerdrWork = text.indexOf("let pane = params.pane");
    assert.ok(guard !== -1 && check > guard, "check must sit behind the allowUnmatchedBrief guard");
    assert.ok(firstHerdrWork > check, "cross-check must precede the first herdr tab/agent call");
    assert.match(text, /allowUnmatchedBrief: Type\.Optional\(\s*Type\.Boolean/);
  });

  test("orch-dispatch.ts refuses a relayTask whose watcher is still alive", () => {
    const text = readFileSync(join(import.meta.dirname, "..", "orch-dispatch.ts"), "utf8");
    const refusal = text.indexOf("relayTask ${params.relayTask} still has a live watcher");
    const firstHerdrWork = text.indexOf("let pane = params.pane");
    assert.ok(refusal !== -1, "the duplicate-relayTask refusal is missing");
    assert.ok(text.indexOf("existsSync(liveWatch) && (await relayAlive(pi, liveWatch))") < firstHerdrWork);
    assert.ok(refusal < firstHerdrWork, "refusal must precede the first herdr tab/agent call");
  });
});
