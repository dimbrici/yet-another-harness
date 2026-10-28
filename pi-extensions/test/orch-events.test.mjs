// Tests for the shared event machinery: the emitter's atomicity and schema, the scan
// rules, the reader, the flat line, and the appended bash helper's contract.
//
// Everything runs against a per-test temp dir. The production inbox under
// /tmp/trino-scenario-decisions/relay-inbox is never written by this suite.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";

import {
  EVENT_KEYS,
  actionForStatus,
  drainInbox,
  emitEvent,
  inboxPaths,
  inboxRoot,
  isEventName,
  parseEvent,
  readEventFile,
  renderFlatLine,
} from "../lib/orch-events.mjs";
import { findRelayLib as relayLib } from "./orch-test-home.mjs";
import { orchHome } from "../lib/orch-home.mjs";

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "orch-events-test-"));
});
afterEach(() => {
  chmodSync(dir, 0o755);
  for (const sub of ["pending", "processed"]) {
    try {
      chmodSync(join(dir, sub), 0o755);
    } catch {}
  }
  rmSync(dir, { recursive: true, force: true });
});

const base = {
  task: "T9-IMPL",
  agent: "t9_executor",
  status: "settled",
  wait_get: "done",
  artifact_or_report: "/tmp/report.md",
  tsk_id: "T9",
  relay_log: "/tmp/relay.log",
  extra: "",
};

/** A clock the test owns: `emitEvent` must not be reading the real wall clock here. */
const AT = new Date("2026-10-08T13:31:23.456Z");

function pending(dir2 = dir) {
  try {
    return readdirSync(join(dir2, "pending"));
  } catch {
    return [];
  }
}

describe("emitEvent", () => {
  test("files one event with the twelve keys in order and the pinned name shape", () => {
    const out = emitEvent(base, { inboxDir: dir, now: AT });
    assert.equal(out.ok, true);
    assert.equal(pending().length, 1);
    const name = pending()[0];
    assert.match(name, /^20261008T133123Z-[0-9a-f]{4}-T9-IMPL-settled\.json$/);
    const event = JSON.parse(readFileSync(join(dir, "pending", name), "utf8"));
    assert.deepEqual(Object.keys(event), EVENT_KEYS);
    assert.equal(event.kind, "relay");
    assert.equal(event.task, "T9-IMPL");
    assert.equal(event.orchestrator_action, "update-tsk-board");
    // E2 target: the emitter fills the two keys a sender is not obliged to provide.
    assert.match(event.id, /^T9-IMPL-settled-20261008T133123Z-[0-9a-f]{4}$/);
    assert.equal(event.ts, "2026-10-08T13:31:23Z");
  });

  test("a sender's own id and ts are kept, not overwritten", () => {
    const out = emitEvent({ ...base, id: "given-id", ts: "2020-01-01T00:00:00Z" }, { inboxDir: dir, now: AT });
    const event = JSON.parse(readFileSync(out.file, "utf8"));
    assert.equal(event.id, "given-id");
    assert.equal(event.ts, "2020-01-01T00:00:00Z");
  });

  test("orchestrator_action is derived from the status, never taken from the input", () => {
    for (const [status, action] of [
      ["settled", "update-tsk-board"],
      ["gone", "inspect-agent"],
      ["provider_error", "inspect-agent"],
      ["agent_unresponsive", "inspect-agent"],
      ["extension_request", "inspect-agent"],
      ["tool_hung", "inspect-agent"],
    ]) {
      assert.equal(actionForStatus(status), action);
      const out = emitEvent({ ...base, status, orchestrator_action: "reboot-the-agent" }, { inboxDir: dir, now: AT });
      assert.equal(JSON.parse(readFileSync(out.file, "utf8")).orchestrator_action, action, status);
    }
  });

  test("unknown keys ride through, so a watchdog's tool detail is not lost", () => {
    const tool = { toolCallId: "call-1", toolName: "bash", argsPreview: "sleep 999", silentSeconds: 601, totalSeconds: 900 };
    const out = emitEvent({ ...base, status: "tool_hung", task: "tool_hung", tool }, { inboxDir: dir, now: AT });
    const event = JSON.parse(readFileSync(out.file, "utf8"));
    assert.deepEqual(event.tool, tool);
    assert.deepEqual(Object.keys(event).slice(0, 12), EVENT_KEYS);
  });

  test("E1: the write goes to a temp name and only the rename lands it in pending/", () => {
    // A spy fs, so the ORDER is observed rather than trusted: if the emitter wrote
    // the target directly, a reader could see a partial file. The mutant that drops
    // temp-plus-rename has to fail here.
    const seen = [];
    const paths = inboxPaths(dir);
    mkdirSync(paths.pending, { recursive: true });
    const fs = {
      mkdirSync: (p) => {
        try {
          mkdirSync(p, { recursive: true });
        } catch {}
      },
      writeFileSync: (path, text) => {
        seen.push(["write", path, readdirSync(paths.pending).filter(isEventName)]);
        writeFileSync(path, text, "utf8");
      },
      renameSync: (from, to) => {
        seen.push(["rename", from, to]);
        renameSync(from, to);
      },
    };
    const out = emitEvent(base, { inboxDir: dir, now: AT, fs });
    assert.equal(out.ok, true);
    const write = seen.find((entry) => entry[0] === "write");
    const rename = seen.find((entry) => entry[0] === "rename");
    assert.ok(write, "no write was observed");
    assert.ok(rename, "no rename was observed");
    assert.match(write[1], /\.json\.tmp-[0-9a-f]{4}$/, "the first write must go to a temp name");
    assert.deepEqual(write[2], [], "pending/ already held an event file at write time");
    assert.ok(!rename[1].endsWith(".json") && rename[2].endsWith(".json"));
    // And afterwards only the final name is there: no temp leftover.
    assert.equal(readdirSync(paths.pending).length, 1);
    assert.ok(!readdirSync(paths.pending)[0].includes(".tmp-"), "a temp file was left in pending/");
  });

  test("the final name is lexicographically chronological", () => {
    const older = new Date("2026-01-01T00:00:00Z");
    const newer = new Date("2026-06-01T00:00:00Z");
    emitEvent({ ...base, task: "zz" }, { inboxDir: dir, now: older });
    emitEvent({ ...base, task: "aa" }, { inboxDir: dir, now: newer });
    assert.deepEqual(pending().sort(), [pending()[1], pending()[0]].sort());
    const sorted = pending().sort();
    assert.match(sorted[0], /^20260101/);
    assert.match(sorted[1], /^20260601/);
  });

  test("a name or path separator in a task cannot escape the pending directory", () => {
    const out = emitEvent({ ...base, task: "../../etc/passwd" }, { inboxDir: dir, now: AT });
    assert.equal(out.ok, true);
    const name = pending()[0];
    // The property that matters: one path component, and it landed where we said.
    assert.ok(!name.includes("/") && !name.includes("\\"), name);
    assert.equal(name.split("/").length, 1);
    assert.equal(pending().length, 1);
    assert.equal(out.file, join(dir, "pending", name));
    assert.ok(existsSync(out.file));
    assert.equal(existsSync("/tmp/etc/passwd"), false, "the event was written outside the inbox");
    // The id keeps the task text as it was given: the name is sanitised, the payload is not.
    assert.equal(JSON.parse(readFileSync(out.file, "utf8")).task, "../../etc/passwd");
  });

  test("any failure is {ok:false} and is never thrown", () => {
    assert.deepEqual(emitEvent(null, { inboxDir: dir, now: AT }), { ok: false });
    assert.deepEqual(emitEvent("a string", { inboxDir: dir, now: AT }), { ok: false });
    assert.deepEqual(emitEvent({ agent: "x", status: "gone" }, { inboxDir: dir, now: AT }), { ok: false }, "no task");
    assert.deepEqual(emitEvent({ ...base, task: "" }, { inboxDir: dir, now: AT }), { ok: false });
    assert.deepEqual(emitEvent(base, { inboxDir: dir, now: "not a date" }), { ok: false });
    const boom = {
      mkdirSync: () => {
        throw new Error("no");
      },
      writeFileSync: () => {},
      renameSync: () => {},
    };
    assert.deepEqual(emitEvent(base, { inboxDir: dir, now: AT, fs: boom }), { ok: false });
  });

  test("an unwritable pending directory yields ok:false, which is what triggers a fallback", () => {
    const blocked = mkdtempSync(join(tmpdir(), "orch-events-blocked-"));
    const pendingDir = join(blocked, "pending");
    mkdirSync(pendingDir, { recursive: true });
    chmodSync(pendingDir, 0o500);
    try {
      assert.equal(emitEvent(base, { inboxDir: blocked, now: AT }).ok, false);
    } finally {
      chmodSync(pendingDir, 0o755);
      rmSync(blocked, { recursive: true, force: true });
    }
  });

  test("the directories are created on demand and an absent root is not an error", () => {
    const deep = join(dir, "not", "made", "yet");
    const out = emitEvent(base, { inboxDir: deep, now: AT });
    assert.equal(out.ok, true);
    assert.ok(existsSync(join(deep, "pending")));
    assert.ok(existsSync(join(deep, "processed")));
  });

  test("ORCH_EVENTS_DIR names the root and the code adds the two subdirs", () => {
    assert.equal(inboxRoot({ ORCH_EVENTS_DIR: "/tmp/elsewhere" }), "/tmp/elsewhere");
    // With no override the root comes from the repo's lane state (orch-home.mjs),
    // not from one project's hardcoded /tmp path: the default follows the cwd.
    const repo = mkdtempSync(join(tmpdir(), "orch-events-default-"));
    const savedCwd = process.cwd();
    try {
      process.chdir(repo);
      // The default is derived, not hardcoded: it is the repo's orch-home inbox.
      assert.equal(inboxRoot({}), join(orchHome(repo, {}), "relay-inbox"));
      assert.match(inboxRoot({}), /^\/tmp\/orch\//);
      assert.equal(inboxRoot({ ORCH_HOME: "/tmp/named-lane" }), "/tmp/named-lane/relay-inbox");
    } finally {
      process.chdir(savedCwd);
      rmSync(repo, { recursive: true, force: true });
    }
    const paths = inboxPaths("/tmp/elsewhere");
    assert.equal(paths.pending, "/tmp/elsewhere/pending");
    assert.equal(paths.processed, "/tmp/elsewhere/processed");
  });

  test("only .json non-dot names are events", () => {
    assert.equal(isEventName("20260101T000000Z-abcd-t-s.json"), true);
    for (const name of [
      "20260101T000000Z-abcd-t-s.json.tmp-abcd",
      ".hidden.json",
      "armed.stamp",
      "relay.log",
      "",
      null,
      undefined,
    ]) {
      assert.equal(isEventName(name), false, String(name));
    }
  });
});

describe("parseEvent and renderFlatLine", () => {
  test("a valid event round-trips with its unknown keys", () => {
    const out = emitEvent({ ...base, status: "tool_hung", tool: { toolName: "bash" } }, { inboxDir: dir, now: AT });
    const read = readEventFile(out.file);
    assert.equal(read.ok, true);
    assert.equal(read.event.tool.toolName, "bash");
    assert.equal(read.event.status, "tool_hung");
  });

  test("required keys are enforced, and the reason says which one", () => {
    for (const key of ["id", "kind", "task", "agent", "status", "ts"]) {
      const event = { ...base, id: "i", kind: "relay", ts: "2026-01-01T00:00:00Z", orchestrator_action: "inspect-agent" };
      delete event[key];
      assert.throws(() => parseEvent(JSON.stringify(event)), new RegExp(`missing ${key}`));
    }
    assert.throws(() => parseEvent(JSON.stringify({ ...base, id: "i", kind: "not-relay", ts: "t" })), /unknown kind/);
    assert.throws(() => parseEvent("{ not json"), /not json/);
    assert.throws(() => parseEvent("[1,2]"), /not an object/);
    // A file that is not there, or not readable, comes back as a value a caller logs.
    const absent = readEventFile(join(dir, "missing.json"));
    assert.equal(absent.ok, false);
    assert.match(absent.error, /ENOENT|no such file/i);
  });

  test("the flat line carries the R1 key names in the R1 order", () => {
    const line = renderFlatLine(parseEvent(JSON.stringify({ ...base, id: "i", kind: "relay", ts: "t" })));
    assert.equal(
      line,
      "RELAY_EVENT: TASK=T9-IMPL AGENT=t9_executor STATUS=settled WAIT_GET=done ARTIFACT_OR_REPORT=/tmp/report.md TSK_ID=T9 ORCHESTRATOR_ACTION=update-tsk-board RELAY_LOG=/tmp/relay.log",
    );
  });

  test("extra text is appended verbatim and blank extra adds nothing", () => {
    const event = parseEvent(JSON.stringify({ ...base, id: "i", kind: "relay", ts: "t", extra: "GONE_READS=3" }));
    assert.match(renderFlatLine(event), /RELAY_LOG=\/tmp\/relay\.log GONE_READS=3$/);
  });
});

describe("the R1 helper bodies are pinned (row R2.7)", () => {
  const LIB = relayLib();
  const PINNED = {
    relay_log: "c36d1479e56334c6",
    relay_state: "22cd52fff1ab2d31",
    relay_fire: "0525fbe890c4e3d8",
    relay_settle: "c88f8384ea77caee",
    // P3b merged herdr's stderr answer into relay_is_gone (`2>/dev/null` -> `2>&1`),
    // because herdr 0.9.1 writes a missing-agent answer to stderr only: without the
    // merge no read ever confirmed a removed agent and watchers lingered. That edit
    // crossed the R1 freeze, so the digest was re-pinned by human decision on
    // 2026-10-13 (GLOBAL-TESTS port); the previous value was e0ccb91c91eada14.
    relay_is_gone: "946ecd2682a02c68",
    relay_blocked_label: "444b58f8ced8aafc",
    relay_fire_status: "0323849b47de227d",
  };

  function body(source, name) {
    const lines = source.split("\n");
    const start = lines.findIndex((line) => line.startsWith(`${name}() {`));
    assert.notEqual(start, -1, `${name} is gone from relay-lib.sh`);
    if (lines[start].trimEnd().endsWith("}")) return lines[start];
    const rest = lines.slice(start + 1).findIndex((line) => line === "}");
    assert.notEqual(rest, -1, `${name} has no closing brace`);
    return lines.slice(start, start + 1 + rest + 1).join("\n");
  }

  test("every R1 helper body is byte-for-byte unchanged", () => {
    assert.ok(LIB, "no relay-lib.sh found: set ORCH_RELAY_LIB to a repo's .planning/orch/relay-lib.sh");
    const source = readFileSync(LIB, "utf8");
    for (const [name, digest] of Object.entries(PINNED)) {
      assert.equal(
        createHash("sha256").update(body(source, name)).digest("hex").slice(0, 16),
        digest,
        `${name} was edited: every body above is pinned, so a change needs a recorded decision and a new digest`,
      );
    }
  });

  test("relay_emit_event exists, and the library still parses as bash", () => {
    const source = readFileSync(LIB, "utf8");
    assert.match(source, /^relay_emit_event\(\) \{/m);
    assert.equal(spawnSync("/bin/bash", ["-n", LIB]).status, 0);
  });
});

describe("relay_emit_event (the bash emitter)", () => {
  const LIB = relayLib();

  function run(args, { env = {}, inbox = dir } = {}) {
    return spawnSync("/bin/bash", ["-c", `source '${LIB}'; relay_emit_event ${args.join(" ")}`], {
      encoding: "utf8",
      env: { ...process.env, ORCH_EVENTS_DIR: inbox, ...env },
    });
  }

  test("it produces the same schema as the node emitter, key for key", () => {
    const out = run(["'T9-IMPL'", "'t9_executor'", "'gone'", "'unknown'", "'/tmp/r.md'", "'GONE_READS=3'"], {
      env: { TSK_ID: "T9", RELAY_LOG: "/tmp/relay.log" },
    });
    assert.equal(out.status, 0, out.stderr);
    const name = pending()[0];
    assert.match(name, /^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{4}-T9-IMPL-gone\.json$/);
    const bash = JSON.parse(readFileSync(join(dir, "pending", name), "utf8"));
    const node = JSON.parse(readFileSync(emitEvent({ ...base, status: "gone", extra: "GONE_READS=3" }, { inboxDir: dir, now: AT }).file, "utf8"));
    assert.deepEqual(Object.keys(bash), Object.keys(node));
    assert.equal(bash.kind, "relay");
    assert.equal(bash.tsk_id, "T9");
    assert.equal(bash.relay_log, "/tmp/relay.log");
    assert.equal(bash.orchestrator_action, "inspect-agent");
    assert.equal(bash.extra, "GONE_READS=3");
    // T5 target: the status word survives the trip intact.
    assert.equal(bash.status, "gone");
    assert.equal(renderFlatLine(bash).split(" ")[3], "STATUS=gone");
  });

  test("a settled event earns the board update, anything else asks only to be looked at", () => {
    run(["'T'", "'a'", "'settled'", "'done'", "'/tmp/r'"]);
    run(["'T'", "'a'", "'tool_hung'", "'unknown'", "'none'"]);
    const events = pending().map((name) => JSON.parse(readFileSync(join(dir, "pending", name), "utf8")));
    const byStatus = Object.fromEntries(events.map((event) => [event.status, event.orchestrator_action]));
    assert.deepEqual(byStatus, { settled: "update-tsk-board", tool_hung: "inspect-agent" });
  });

  test("it returns non-zero when the inbox cannot be written, so the caller falls back", () => {
    const blocked = mkdtempSync(join(tmpdir(), "emit-blocked-"));
    const pendingDir = join(blocked, "pending");
    mkdirSync(pendingDir, { recursive: true });
    chmodSync(pendingDir, 0o500);
    try {
      const out = run(["'T'", "'a'", "'settled'", "'done'", "'/tmp/r'"], { inbox: blocked });
      assert.notEqual(out.status, 0, "a failed emit must not report success");
    } finally {
      chmodSync(pendingDir, 0o755);
      rmSync(blocked, { recursive: true, force: true });
    }
  });

  test("the sourced library still defines every R1 helper", () => {
    const helpers = ["relay_log", "relay_state", "relay_fire", "relay_settle", "relay_is_gone", "relay_blocked_label", "relay_fire_status"];
    const out = spawnSync("/bin/bash", ["-c", `source '${LIB}'; for f in ${helpers.join(" ")}; do declare -F "$f" || exit 1; done; echo ALL_PRESENT`], {
      encoding: "utf8",
      env: { ...process.env, RELAY_LOG: join(dir, "l.log") },
    });
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /ALL_PRESENT/);
  });
});
