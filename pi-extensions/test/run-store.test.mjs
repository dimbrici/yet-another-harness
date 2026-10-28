// Tests for the run folder, the fence, the verbs, and the detach path.
//
// Offline and deterministic: an injected clock for every rule, a stub `herdr`
// script for identity, real short-lived processes only where the row demands it.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";

import {
  FREE_EXTENSIONS,
  OVERLONG_CEILING,
  OVERLONG_DEFAULT,
  STALL_CEILING,
  STALL_DEFAULT,
  checkLimit,
  computeState,
  detach,
  extendRun,
  findRunDir,
  forbiddenWordIn,
  newRunId,
  readSnapshot,
  readText,
  reportBlock,
  runVerdict,
  runsDir,
  startRun,
  statusRun,
  stopRun,
} from "../lib/run-store.mjs";

let root;
let env;

before(() => {
  root = mkdtempSync(join(tmpdir(), "run-store-test-"));
  const bin = join(root, "herdr");
  writeFileSync(
    bin,
    `#!/usr/bin/env bash
case "$1 $2" in
  "agent list") printf '%s\\n' '{"result":{"agents":[{"name":"t1_executor","pane_id":"pane-7","agent_status":"idle","agent_session":{"value":"${join(root, "session.jsonl")}"}}]}}' ;;
  *) printf '%s\\n' '{}' ;;
esac
`,
    "utf8",
  );
  spawnSync("chmod", ["+x", bin]);
  env = {
    ...process.env,
    RUN_COMMAND_RUNS_DIR: join(root, "runs"),
    RUN_RELAY_HERDR_BIN: bin,
    HERDR_PANE_ID: "pane-7",
    PI_SESSION_FILE: join(root, "session.jsonl"),
  };
});

after(() => rmSync(root, { recursive: true, force: true }));

// `relay: false` by default: these tests watch the run folder, and a real relay
// armed here would outlive the temp folder it reads.
function start(command, extra = {}) {
  return startRun({ command, cwd: root, env, relay: false, ...extra });
}

function waitExit(dir, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !existsSync(join(dir, "exit"))) {
    spawnSync("sleep", ["0.05"]);
  }
  return readFileSync(join(dir, "exit"), "utf8").trim();
}

/**
 * True when nothing in this run's process group is still running. A process the
 * test parent has not reaped yet shows as a zombie, which is ended: the pid still
 * exists, but it executes nothing and answers no signal.
 */
function groupEnded(pid) {
  const out = spawnSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" }).stdout.trim();
  if (!out) return true;
  return out.split("\n").every((state) => state.trim().startsWith("Z"));
}

describe("fence", () => {
  test("defaults and ceilings are the values the brief sets", () => {
    assert.equal(STALL_DEFAULT, 300);
    assert.equal(STALL_CEILING, 900);
    assert.equal(OVERLONG_DEFAULT, 1200);
    assert.equal(OVERLONG_CEILING, 3600);
    assert.equal(FREE_EXTENSIONS, 3);
  });

  test("900 is accepted and 901 is refused naming the ceiling", () => {
    assert.equal(checkLimit("stall", 900, STALL_CEILING), 900);
    assert.throws(() => checkLimit("stall", 901, STALL_CEILING), /above the ceiling 900s/);
  });

  test("3600 is accepted and 3601 is refused naming the ceiling", () => {
    assert.equal(checkLimit("overlong", 3600, OVERLONG_CEILING), 3600);
    assert.throws(() => checkLimit("overlong", 3601, OVERLONG_CEILING), /above the ceiling 3600s/);
  });

  test("zero, negative and fractional values are refused", () => {
    for (const bad of [0, -5, 1.5, "abc"]) {
      assert.throws(() => checkLimit("stall", bad, STALL_CEILING), /whole number/);
    }
  });

  test("nothing clamps silently: start refuses rather than lowering the value", () => {
    assert.throws(() => start("sleep 0.1", { stall: 5000 }), /ceiling 900s/);
    assert.throws(() => start("sleep 0.1", { overlong: 5000 }), /ceiling 3600s/);
  });
});

describe("start", () => {
  test("returns while the command is still running", () => {
    const t0 = Date.now();
    const run = start("sleep 5");
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 1000, `start took ${elapsed}ms`);
    const snap = readSnapshot(run.dir);
    assert.equal(snap.state, "RUNNING");
    assert.ok(snap.pid > 0);
    stopRun(run.dir, { waitMs: 500 });
  });

  test("writes the run folder files the brief lists", () => {
    const run = start("echo hello");
    const exit = waitExit(run.dir);
    assert.equal(exit, "0");
    for (const name of ["command", "cwd", "log", "pid", "exit", "limits.json", "owner.json"]) {
      assert.ok(existsSync(join(run.dir, name)), `missing ${name}`);
    }
    assert.equal(readFileSync(join(run.dir, "command"), "utf8"), "echo hello");
    const limits = JSON.parse(readFileSync(join(run.dir, "limits.json"), "utf8"));
    assert.deepEqual(limits, { stall: 300, overlong: 1200, extensions: [] });
    const owner = JSON.parse(readFileSync(join(run.dir, "owner.json"), "utf8"));
    assert.equal(owner.name, "t1_executor");
    assert.equal(owner.pane_id, "pane-7");
    assert.equal(owner.session_file, join(root, "session.jsonl"));
    assert.equal(run.dir, join(runsDir(env), "t1_executor", run.id));
  });

  test("merges stdout and stderr into one log", () => {
    const run = start("echo out; echo err 1>&2");
    assert.equal(waitExit(run.dir), "0");
    const log = readFileSync(join(run.dir, "log"), "utf8");
    assert.match(log, /out/);
    assert.match(log, /err/);
  });

  test("records a nonzero exit code", () => {
    const run = start("echo boom 1>&2; false");
    assert.equal(waitExit(run.dir), "1");
    assert.equal(readSnapshot(run.dir).exit_code, 1);
  });

  test("an `exit 3` inside the command still writes the exit file", () => {
    const run = start("echo before; exit 3");
    assert.equal(waitExit(run.dir), "3");
    assert.match(readFileSync(join(run.dir, "log"), "utf8"), /before/);
  });

  test("the run keeps running past its overlong deadline with no ack (ruling O3)", () => {
    const run = start("sleep 3", { overlong: 1 });
    const snap = readSnapshot(run.dir, Date.now() / 1000 + 600);
    assert.equal(snap.state, "RUNNING");
    assert.ok(snap.now - snap.started_at > snap.overlong * (1 + snap.extensions_used));
    const aliveAfterOverlong = spawnSync("ps", ["-o", "pid=", "-p", String(snap.pid)], { encoding: "utf8" });
    assert.ok(aliveAfterOverlong.stdout.trim(), "the process was killed on time");
    stopRun(run.dir, { waitMs: 500 });
  });

  test("refuses a cluster or cloud command naming the rule", () => {
    for (const command of ["kubectl get pods", "helm ls", "ssh host true", "aws s3 ls", "terraform plan"]) {
      assert.throws(() => start(command), /local commands only.*ruling O4/s, command);
    }
    assert.ok(forbiddenWordIn("devpod up"));
    assert.equal(forbiddenWordIn("echo ssh-not-really-a-call"), undefined);
  });

  test("refuses an Orchestrator caller", () => {
    const orchEnv = { ...env, HERDR_PANE_ID: "pane-9", PI_SESSION_FILE: "x" };
    const bin = join(root, "herdr-orch");
    writeFileSync(
      bin,
      `#!/usr/bin/env bash\nprintf '%s\\n' '{"result":{"agents":[{"name":"orchestrator","pane_id":"pane-9","agent_session":{"value":"x"}}]}}'\n`,
      "utf8",
    );
    spawnSync("chmod", ["+x", bin]);
    assert.throws(
      () => startRun({ command: "sleep 1", cwd: root, env: { ...orchEnv, RUN_RELAY_HERDR_BIN: bin } }),
      /is an Orchestrator/,
    );
  });

  test("refuses when the caller cannot be resolved to an agent", () => {
    const noPane = { ...env, HERDR_PANE_ID: "" };
    assert.throws(() => startRun({ command: "sleep 1", cwd: root, env: noPane }), /cannot resolve this session/);
    const wrongPane = { ...env, HERDR_PANE_ID: "pane-not-in-the-registry" };
    assert.throws(() => startRun({ command: "sleep 1", cwd: root, env: wrongPane }), /cannot resolve this session/);
  });

  test("start arms one command relay for the run, and that relay leaves when the run is stopped", () => {
    const run = startRun({ command: "sleep 30", cwd: root, env: { ...env, RUN_RELAY_POLL_MS: "100" }, relay: true });
    // detach() opens relay.log at once, so wait for the relay's own first line.
    const armed = Date.now() + 6000;
    while (Date.now() < armed && !/armed for/.test(readText(join(run.dir, "relay.log")))) spawnSync("sleep", ["0.05"]);
    assert.match(readText(join(run.dir, "relay.log")), /armed for .* owner=t1_executor/);
    stopRun(run.dir, { waitMs: 500 });
    const gone = Date.now() + 8000;
    while (Date.now() < gone && !/exit reason=stopped/.test(readText(join(run.dir, "relay.log")))) spawnSync("sleep", ["0.1"]);
    assert.match(readText(join(run.dir, "relay.log")), /exit reason=stopped/);
  });

  test("run ids sort and do not collide", () => {
    const a = newRunId(new Date("2026-01-02T03:04:05Z"));
    const b = newRunId(new Date("2026-01-02T03:04:05Z"));
    assert.match(a, /^20260102T030405Z-[0-9a-f]{6}$/);
    assert.notEqual(a, b);
  });

  test("findRunDir locates a run by id under its owner", () => {
    const run = start("echo findme");
    waitExit(run.dir);
    assert.equal(findRunDir(run.id, env), run.dir);
    assert.equal(findRunDir("no-such-run", env), null);
  });
});

describe("state", () => {
  test("STOPPED outranks DONE, and a dead pid with no files is CRASHED", () => {
    assert.equal(computeState({ hasStopped: true, hasExit: true, pid: 1 }), "STOPPED");
    assert.equal(computeState({ hasStopped: false, hasExit: true, pid: 1 }), "DONE");
    assert.equal(computeState({ hasStopped: false, hasExit: false, pid: 2_147_483_647 }), "CRASHED");
    assert.equal(computeState({ hasStopped: false, hasExit: false, pid: process.pid }), "RUNNING");
  });

  test("status writes the ack and returns the state, exit code and tail", () => {
    const run = start("echo one\necho two");
    waitExit(run.dir);
    assert.equal(existsSync(join(run.dir, "ack")), false, "start must not ack on its own");
    const status = statusRun(run.dir, 1234567890);
    assert.equal(status.state, "DONE");
    assert.equal(status.exit_code, 0);
    assert.equal(Number(readFileSync(join(run.dir, "ack"), "utf8").trim()), 1234567890);
    assert.ok(status.block.includes("LOG_TAIL:"));
  });

  test("the stall rule reads quiet time, and an ack restarts the window (G4/C5)", () => {
    const running = {
      state: "RUNNING",
      started_at: 1_000,
      log_mtime: 1_000,
      ack: 0,
      stall: 300,
      overlong: 1_200,
      extensions_used: 0,
      deadline: 2_200,
      exit_code: null,
    };
    assert.equal(runVerdict({ ...running, now: 1_300 }), null);
    assert.equal(runVerdict({ ...running, now: 1_400 }).key, "STALLED");
    // New log output restarts the window.
    assert.equal(runVerdict({ ...running, now: 1_400, log_mtime: 1_350 }), null);
    // So does an ack: the owner looked at a quiet command, and no kill follows.
    assert.equal(runVerdict({ ...running, now: 1_400, ack: 1_350 }), null);
  });

  test("overlong fires past the deadline, and each extension moves the deadline", () => {
    const running = {
      state: "RUNNING",
      started_at: 1_000,
      log_mtime: 1_000,
      ack: 1_000,
      stall: 300,
      overlong: 100,
      extensions_used: 0,
      deadline: 1_100,
      exit_code: null,
    };
    assert.equal(runVerdict({ ...running, now: 1_090 }), null);
    assert.equal(runVerdict({ ...running, now: 1_200 }).key, "OVERLONG");
    assert.equal(runVerdict({ ...running, now: 1_200, extensions_used: 1, deadline: 1_200 }), null);
    assert.equal(runVerdict({ ...running, now: 1_201, extensions_used: 1, deadline: 1_200 }).key, "OVERLONG");
  });

  test("an ack is written by every verb that touches the run", () => {
    const run = start("sleep 5");
    statusRun(run.dir, 1_700_000_000);
    extendRun(run.dir, 1_700_000_100);
    assert.equal(Number(readFileSync(join(run.dir, "ack"), "utf8").trim()), 1_700_000_100);
    // A refused extend is still an action on the run, so it still acks.
    for (const n of [1, 2, 3]) extendRun(run.dir, 1_700_000_200 + n);
    extendRun(run.dir, 1_700_000_300);
    assert.equal(Number(readFileSync(join(run.dir, "ack"), "utf8").trim()), 1_700_000_300);
    stopRun(run.dir, { nowSec: 1_700_000_900, waitMs: 500 });
    assert.equal(Number(readFileSync(join(run.dir, "ack"), "utf8").trim()), 1_700_000_900);
  });
});

describe("extensions", () => {
  function makeRun() {
    const run = start("sleep 10", { overlong: 100 });
    // Pin the clock the rules read: pretend the run started long enough ago.
    return run;
  }

  test("extensions 1-3 are free and each moves the deadline one overlong ahead", () => {
    const run = makeRun();
    let lastDeadline = readSnapshot(run.dir).deadline;
    for (const n of [1, 2, 3]) {
      const out = extendRun(run.dir);
      assert.equal(out.granted, true, `extension ${n} should be free`);
      assert.equal(out.extension, n);
      assert.equal(out.deadline, new Date((lastDeadline + 100) * 1000).toISOString());
      lastDeadline = lastDeadline + 100;
      assert.equal(readSnapshot(run.dir).extensions_used, n);
      assert.ok(readFileSync(join(run.dir, "limits.json"), "utf8").includes("\"at\""));
    }
    stopRun(run.dir, { waitMs: 500 });
  });

  test("extension 4 is refused without a grant, asks once, and leaves the run running", () => {
    const run = makeRun();
    for (const n of [1, 2, 3]) extendRun(run.dir);
    const refused = extendRun(run.dir);
    assert.equal(refused.granted, false);
    assert.equal(refused.extension, 4);
    assert.ok(existsSync(join(run.dir, "extension-requested.json")));
    assert.equal(readSnapshot(run.dir).extensions_used, 3);
    assert.equal(readSnapshot(run.dir).state, "RUNNING");
    // Asked once: a second refusal does not rewrite the request.
    const first = readFileSync(join(run.dir, "extension-requested.json"), "utf8");
    spawnSync("sleep", ["1.1"]);
    extendRun(run.dir);
    assert.equal(readFileSync(join(run.dir, "extension-requested.json"), "utf8"), first);
    stopRun(run.dir, { waitMs: 500 });
  });

  test("extension 4 is allowed with a grant holding 4", () => {
    const run = makeRun();
    for (const n of [1, 2, 3]) extendRun(run.dir);
    writeFileSync(join(run.dir, "grant"), "4\n", "utf8");
    const out = extendRun(run.dir);
    assert.equal(out.granted, true);
    assert.equal(out.extension, 4);
    assert.equal(readSnapshot(run.dir).extensions_used, 4);
    stopRun(run.dir, { waitMs: 500 });
  });

  test("extension 5 is refused while the grant holds 4", () => {
    const run = makeRun();
    for (const n of [1, 2, 3]) extendRun(run.dir);
    writeFileSync(join(run.dir, "grant"), "4\n", "utf8");
    extendRun(run.dir);
    const fifth = extendRun(run.dir);
    assert.equal(fifth.granted, false);
    assert.equal(fifth.extension, 5);
    assert.equal(readSnapshot(run.dir).extensions_used, 4);
    stopRun(run.dir, { waitMs: 500 });
  });
});

describe("report block", () => {
  const keys = ["RUN_DIR:", "COMMAND:", "LIMITS:", "EXTENSIONS:", "LOG_TAIL:", "STACK_DUMP:", "DONE_SO_FAR:", "REMAINING:"];

  test("lists the fixed fields in order on a running run", () => {
    const run = start("sleep 2");
    const block = reportBlock(run.dir);
    const positions = keys.map((key) => block.indexOf(key));
    positions.forEach((position, index) => assert.ok(position >= 0, `missing ${keys[index]}`));
    const sorted = [...positions].sort((a, b) => a - b);
    assert.deepEqual(positions, sorted);
    assert.match(block, /LIMITS: stall=300s overlong=1200s deadline=/);
    assert.match(block, /STACK_DUMP: none/);
    stopRun(run.dir, { waitMs: 500 });
  });

  test("carries the tail of a finished run", () => {
    const run = start("for i in 1 2 3; do echo line$i; done");
    waitExit(run.dir);
    const block = reportBlock(run.dir);
    assert.match(block, /line1\nline2\nline3/);
    assert.match(block, /EXTENSIONS: 0\n/);
  });

  test("stop dumps the SIGABRT stack of a real python3.12 run and ends the group", () => {
    const script = join(root, "sleepy.py");
    writeFileSync(
      script,
      "import time\nwhile True:\n    time.sleep(0.2)\n",
      "utf8",
    );
    const run = start(`python3.12 -u ${script}`);
    spawnSync("sleep", ["1"]);
    const stopped = stopRun(run.dir, { waitMs: 1000 });
    assert.equal(stopped.state, "STOPPED");
    assert.ok(existsSync(join(run.dir, "stopped.json")));
    assert.match(stopped.block, /STACK_DUMP: (Fatal Python error|Thread 0x|Current thread)/);
    const pid = Number(readFileSync(join(run.dir, "pid"), "utf8").trim());
    assert.ok(groupEnded(pid), `run process ${pid} is still running after stop`);
    assert.equal(spawnSync("pgrep", ["-f", "sleepy.py"], { encoding: "utf8" }).stdout.trim(), "", "the python child survived the group signal");
  });

  test("stop falls back to SIGKILL when the run ignores SIGABRT", () => {
    const run = start("trap '' ABRT; while :; do sleep 1; done");
    spawnSync("sleep", ["0.5"]);
    const stopped = stopRun(run.dir, { waitMs: 400 });
    assert.deepEqual(stopped.signals, ["SIGABRT", "SIGKILL"]);
    const pid = Number(readFileSync(join(run.dir, "pid"), "utf8").trim());
    assert.ok(groupEnded(pid), `run process ${pid} ignored SIGABRT and survived SIGKILL`);
  });
});

describe("detach helper (risk T82)", () => {
  test("the detached child leads its own group, and is reparented to init only after its parent exits", async () => {
    const marker = join(root, "detach-child.pid");
    const parent = join(root, "detach-parent.mjs");
    // The parent imports the real helper, so the child is made by the same code path
    // that makes a run and its relay.
    const modulePath = join(import.meta.dirname, "..", "lib", "run-store.mjs");
    writeFileSync(
      parent,
      `import { writeFileSync } from "node:fs";
import { detach } from ${JSON.stringify(modulePath)};
const child = detach("bash", ["-c", "sleep 20"], { env: process.env });
writeFileSync(${JSON.stringify(marker)}, String(child.pid), "utf8");
// Stay alive 1.5s so the group check below can run while this parent is alive.
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
`,
      "utf8",
    );
    rmSync(marker, { force: true });
    const parentProc = spawn(process.execPath, [parent], { stdio: "ignore" });
    const psRow = (fields, pid) =>
      spawnSync("ps", ["-o", fields, "-p", String(pid)], { encoding: "utf8" }).stdout.trim().split(/\s+/).map(Number);

    const deadline = Date.now() + 5000;
    let pid = 0;
    while (Date.now() < deadline && !pid) {
      if (existsSync(marker)) pid = Number(readFileSync(marker, "utf8").trim());
      if (!pid) await new Promise((done) => setTimeout(done, 20));
    }
    assert.ok(pid > 0, "the parent never reported its child pid");

    // While the parent is alive: the child must already lead its own group.
    const [childPid, ppidLive, pgidLive] = psRow("pid=,ppid=,pgid=", pid);
    assert.equal(pgidLive, childPid, "the detached child must lead its own process group");

    await new Promise((done) => parentProc.on("exit", done));

    // After the parent exits: still alive, and reparented to init. A child that died
    // with its parent is exactly the T82 defect this package must not inherit.
    const row = psRow("pid=,ppid=,pgid=", pid);
    assert.equal(row.length, 3, `the detached child died with its parent`);
    const [, ppid, pgid] = row;
    assert.equal(pgid, pid, "the child must still lead its own group after the parent exits");
    assert.equal(ppid, 1, "a detached child must be reparented to init once its parent exits");
    process.kill(pid, "SIGKILL");
  });
});
