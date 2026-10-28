// One run of one long local command, stored as a folder of plain files.
//
// This module owns the run folder: its layout, the fence the Executor sets its
// limits inside, the state computed from those files, and the four verbs. It does
// no watching: the command relay is a separate process with its own module.
// Nothing here ever kills a run because of the clock. Time only produces a knock
// or a check-in; the owner decides.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
// Run folders are per repo (/tmp/orch/<repo>/runs/run-command), never one project's
// hardcoded path; see ./orch-home.mjs for the convention and the pin file.
import { runsDir as resolveRunsDir } from "./orch-home.mjs";

import { shellQuote } from "./relay-script.mjs";
import { whoami } from "./run-identity.mjs";

// --- the fence: defaults, and the ceiling a value may not pass ---------------
// The ceiling guards against a wedged Executor switching its own monitoring off.
// It is never a kill: the worst a limit can do is earn a knock.
export const STALL_DEFAULT = 300;
export const STALL_CEILING = 900;
export const OVERLONG_DEFAULT = 1200;
export const OVERLONG_CEILING = 3600;

/** Extensions 1..3 are the owner's own choice. The 4th needs an Orchestrator grant. */
export const FREE_EXTENSIONS = 3;

/** Seconds a knock may go unanswered before the relay escalates exactly once. */
export const KNOCK_GRACE_SECONDS = 600;

const LOG_TAIL_LINES = 40;
const STACK_DUMP_LINES = 80;
const TAIL_READ_BYTES = 262_144;

/** The control plane is not allowed to detach work: it must stay reachable. */
const ORCHESTRATOR_NAME_RE = /^orchestrator(-[a-z0-9]+)*$/;

/** Local commands only: nothing that reaches a cluster or a cloud may be detached. */
const FORBIDDEN_COMMAND_WORDS = [
  "kubectl",
  "helm",
  "ssh",
  "scp",
  "devpod",
  "gcloud",
  "aws",
  "az",
  "terraform",
];

const RELAY_MODULE = join(import.meta.dirname, "run-relay.mjs");

// --- paths and small file helpers --------------------------------------------

/** Where run folders live: outside the repo, so `git status` stays clean. */
export function runsDir(env = process.env) {
  return env.RUN_COMMAND_RUNS_DIR || resolveRunsDir(process.cwd(), env);
}

function utcStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** `<UTC yyyymmddThhmmssZ>-<6 hex>`: sortable, and it cannot collide within a second. */
export function newRunId(now = new Date()) {
  return `${utcStamp(now)}-${randomBytes(3).toString("hex")}`;
}

function writeAtomic(path, text) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text, "utf8");
  renameSync(tmp, path);
}

/** Read a small run-folder file, or the fallback when it is not there yet. */
export function readText(path, fallback = "") {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return fallback;
  }
}

function mtimeSeconds(path, fallback = 0) {
  try {
    return statSync(path).mtimeMs / 1000;
  } catch {
    return fallback;
  }
}

/** The last bytes of a file that may be far too big to read whole. */
function readTail(path, bytes = TAIL_READ_BYTES) {
  let fd;
  try {
    const size = statSync(path).size;
    const from = Math.max(0, size - bytes);
    fd = openSync(path, "r");
    const buffer = Buffer.alloc(size - from);
    let done = 0;
    while (done < buffer.length) {
      const read = readSync(fd, buffer, done, buffer.length - done, from + done);
      if (read <= 0) break;
      done += read;
    }
    return buffer.subarray(0, done).toString("utf8");
  } catch {
    return "";
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function splitLines(text) {
  const lines = text.split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function tailLines(path, count) {
  return splitLines(readTail(path)).slice(-count);
}

function alive(pid) {
  if (!pid || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

/** True while any process still holds that process group. */
function groupAlive(pgid) {
  if (!pgid || pgid < 1) return false;
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// --- the fence ---------------------------------------------------------------

/**
 * Refuse a limit outside its fence. Nothing clamps silently: a value above the
 * ceiling is a decision the Executor must see that it has to change.
 */
export function checkLimit(name, value, ceiling) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`${name} must be a whole number of seconds of at least 1, got ${value}`);
  }
  if (n > ceiling) {
    throw new Error(`${name}=${n}s is above the ceiling ${ceiling}s, which is fixed in the tool`);
  }
  return n;
}

/** Whole-word match, so a cluster tool is caught even inside a longer command line. */
export function forbiddenWordIn(command) {
  return FORBIDDEN_COMMAND_WORDS.find((word) =>
    new RegExp(`(^|[^A-Za-z0-9_-])${word}([^A-Za-z0-9_-]|$)`).test(command),
  );
}

// --- detaching ----------------------------------------------------------------

/**
 * Start one detached child in its own process group, with its output going to a
 * file, and let the caller go on living without it.
 *
 * `detached: true` plus `unref()` is the whole trick: the child leads a process
 * group, so a run can be signalled as a group, and it survives the short-lived
 * parent that spawned it. Shared by the command and its relay on purpose: one
 * detach path is one thing to get right (risk T82).
 */
export function detach(file, args, { cwd, env, logPath }) {
  const stdin = openSync("/dev/null", "r");
  const out = logPath ? openSync(logPath, "a") : stdin;
  let child;
  try {
    child = spawn(file, args, { cwd, env, detached: true, stdio: [stdin, out, out] });
  } finally {
    closeSync(stdin);
    if (out !== stdin) closeSync(out);
  }
  child.unref();
  return child;
}

// --- the state of a run, read from its own files -------------------------------

/** STOPPED outranks DONE: an owner that stopped the run acted, and said so. */
export function computeState({ hasStopped, hasExit, pid }) {
  if (hasStopped) return "STOPPED";
  if (hasExit) return "DONE";
  if (pid && !alive(pid)) return "CRASHED";
  return "RUNNING";
}

function readLimits(runDir) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(join(runDir, "limits.json"), "utf8"));
  } catch {
    return { stall: STALL_DEFAULT, overlong: OVERLONG_DEFAULT, extensions: [] };
  }
  return {
    stall: Number(parsed.stall) || STALL_DEFAULT,
    overlong: Number(parsed.overlong) || OVERLONG_DEFAULT,
    extensions: Array.isArray(parsed.extensions) ? parsed.extensions : [],
  };
}

/**
 * Everything needed to judge one run, read from inside that run's own folder and
 * nowhere else. `nowSec` is injected so the rules can be tested without waiting.
 */
export function readSnapshot(runDir, nowSec = Date.now() / 1000) {
  const limits = readLimits(runDir);
  const exitRaw = readText(join(runDir, "exit")).trim();
  const pid = Number(readText(join(runDir, "pid")).trim()) || 0;
  const startedAt = mtimeSeconds(join(runDir, "pid"));
  return {
    run_dir: runDir,
    state: computeState({
      hasStopped: existsSync(join(runDir, "stopped.json")),
      hasExit: exitRaw !== "",
      pid,
    }),
    pid,
    exit_code: exitRaw === "" ? null : Number(exitRaw),
    started_at: startedAt,
    log_mtime: mtimeSeconds(join(runDir, "log")),
    ack: Number(readText(join(runDir, "ack")).trim()) || 0,
    stall: limits.stall,
    overlong: limits.overlong,
    extensions: limits.extensions,
    extensions_used: limits.extensions.length,
    deadline: startedAt + limits.overlong * (1 + limits.extensions.length),
    extension_requested: existsSync(join(runDir, "extension-requested.json")),
    escalated: existsSync(join(runDir, "escalated")),
    now: nowSec,
  };
}

/** Record that the owner acted on this run. `status`, `extend` and `stop` all ack. */
export function writeAck(runDir, nowSec = Date.now() / 1000) {
  writeAtomic(join(runDir, "ack"), `${Math.floor(nowSec)}\n`);
}

/** The start of the current quiet window: the last thing that proved progress. */
export function quietSince(snap) {
  return Math.max(snap.log_mtime, snap.started_at, snap.ack);
}

/**
 * Why this run deserves a knock right now, or null. Pure: it writes nothing, so
 * the relay can be driven by an injected clock.
 */
export function runVerdict(snap) {
  if (snap.state === "DONE") return { key: "DONE", exit: snap.exit_code, window: snap.log_mtime };
  if (snap.state === "CRASHED") return { key: "CRASHED", exit: "none", window: snap.log_mtime };
  if (snap.state !== "RUNNING") return null;
  const quiet = quietSince(snap);
  if (snap.now - quiet > snap.stall) {
    return { key: "STALLED", exit: "none", window: quiet };
  }
  if (snap.now - snap.started_at > snap.overlong * (1 + snap.extensions_used)) {
    return { key: "OVERLONG", exit: "none", window: snap.deadline };
  }
  return null;
}

// --- the report block ---------------------------------------------------------

const STACK_MARKERS = [/^Fatal Python error\b/, /^Thread 0x/, /^Current thread\b/];

/**
 * The stack dump of a stopped run: from the first faulthandler line to the end of
 * the log, capped at 80 lines, else the literal `none`. A Python process answers
 * SIGABRT with its stacks, which is what `stop` sends first.
 */
function stackDump(logText) {
  const lines = splitLines(logText);
  const start = lines.findIndex((line) => STACK_MARKERS.some((re) => re.test(line)));
  if (start < 0) return "none";
  return lines.slice(start, start + STACK_DUMP_LINES).join("\n");
}

/** The fixed block the Executor copies into a blocked report, two lines left to fill. */
export function reportBlock(runDir) {
  const snap = readSnapshot(runDir);
  const deadline =
    snap.state === "RUNNING" ? new Date(snap.deadline * 1000).toISOString() : `not running (${snap.state})`;
  const extensions =
    snap.extensions.length === 0
      ? "0"
      : `${snap.extensions.length} (${snap.extensions.map((entry) => entry.at).join(", ")})`;
  return [
    `RUN_DIR: ${runDir}`,
    `COMMAND: ${readText(join(runDir, "command")).replace(/\n$/, "")}`,
    `LIMITS: stall=${snap.stall}s overlong=${snap.overlong}s deadline=${deadline}`,
    `EXTENSIONS: ${extensions}`,
    "LOG_TAIL:",
    ...tailLines(join(runDir, "log"), LOG_TAIL_LINES),
    `STACK_DUMP: ${stackDump(readTail(join(runDir, "log")))}`,
    "DONE_SO_FAR:",
    "REMAINING:",
  ].join("\n");
}

// --- the verbs ----------------------------------------------------------------

/**
 * Start a long local command detached, arm one command relay for it, and return at
 * once. The command runs inside a subshell so an `exit` in its own text cannot
 * skip the `exit` file the wrapper writes after it.
 *
 * `relay: false` skips arming the relay. Tests use it to watch the run folder
 * without starting a watcher that would outlive them.
 */
export function startRun({ command, cwd, stall, overlong, env = process.env, now = new Date(), relay = true }) {
  if (typeof command !== "string" || !command.trim()) throw new Error("start needs a command");

  const forbidden = forbiddenWordIn(command);
  if (forbidden) {
    throw new Error(
      `run_command runs local commands only: '${forbidden}' is a cluster or cloud tool (ruling O4). Run it in the foreground under the existing ops rules.`,
    );
  }
  const checkedStall = checkLimit("stall", stall, STALL_CEILING) ?? STALL_DEFAULT;
  const checkedOverlong = checkLimit("overlong", overlong, OVERLONG_CEILING) ?? OVERLONG_DEFAULT;

  const owner = whoami(env);
  if (!owner) {
    throw new Error(
      "cannot resolve this session to a herdr agent (no HERDR_PANE_ID, or it is not in the registry), so nothing could be told what the run is doing",
    );
  }
  if (ORCHESTRATOR_NAME_RE.test(owner.name)) {
    throw new Error(`run_command is for workers, not the control plane: '${owner.name}' is an Orchestrator`);
  }

  const id = newRunId(now);
  const dir = join(runsDir(env), owner.name, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "command"), command, "utf8");
  writeFileSync(join(dir, "cwd"), `${cwd}\n`, "utf8");
  writeFileSync(
    join(dir, "limits.json"),
    JSON.stringify({ stall: checkedStall, overlong: checkedOverlong, extensions: [] }, null, 2),
    "utf8",
  );
  writeFileSync(join(dir, "owner.json"), JSON.stringify(owner, null, 2), "utf8");
  writeFileSync(join(dir, "log"), "", "utf8");

  // The command runs inside a subshell, so an `exit` in its own text ends the
  // subshell only and the wrapper still records the code. The exit file is written
  // by temp file plus rename, so a reader never sees a half-written code.
  const wrapper = [
    `d=${shellQuote(dir)}`,
    `( bash "$d/command" )`,
    `c=$?`,
    "printf '%s\\n' \"$c\" > \"$d/exit.tmp\" && mv \"$d/exit.tmp\" \"$d/exit\"",
  ].join("\n");
  const child = detach("bash", ["-c", wrapper], {
    cwd,
    env: { ...env, PYTHONUNBUFFERED: "1", PYTHONFAULTHANDLER: "1" },
    logPath: join(dir, "log"),
  });
  if (!child.pid) throw new Error("could not start the command process");
  writeFileSync(join(dir, "pid"), `${child.pid}\n`, "utf8");

  if (relay) detach(process.execPath, [RELAY_MODULE, dir], { cwd, env, logPath: join(dir, "relay.log") });

  return { id, dir, owner, stall: checkedStall, overlong: checkedOverlong };
}

/** Read-only, apart from the ack that says the owner looked at its own run. */
export function statusRun(runDir, nowSec = Date.now() / 1000) {
  writeAck(runDir, nowSec);
  const snap = readSnapshot(runDir, nowSec);
  return {
    state: snap.state,
    elapsed_seconds: Math.max(0, Math.round(nowSec - snap.started_at)),
    exit_code: snap.exit_code,
    stall: snap.stall,
    overlong: snap.overlong,
    extensions: snap.extensions,
    block: reportBlock(runDir),
  };
}

/** The integer N in the grant file, or null when there is none or it does not allow more. */
function grantCeiling(runDir) {
  const raw = readText(join(runDir, "grant")).trim();
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n > FREE_EXTENSIONS ? n : null;
}

/**
 * Move the overlong deadline one more overlong value ahead of the previous
 * deadline. Extensions 1..3 are free. From the 4th the Orchestrator must have
 * written a grant; without one the extend is refused, the run is left untouched,
 * and the relay is told to ask. No answer means the run continues.
 */
export function extendRun(runDir, nowSec = Date.now() / 1000) {
  writeAck(runDir, nowSec);
  const snap = readSnapshot(runDir, nowSec);
  const wanted = snap.extensions_used + 1;

  const granted = grantCeiling(runDir);
  if (wanted > FREE_EXTENSIONS && (granted === null || wanted > granted)) {
    const requestPath = join(runDir, "extension-requested.json");
    if (!existsSync(requestPath)) {
      writeFileSync(
        requestPath,
        JSON.stringify(
          {
            requested_at: new Date(nowSec * 1000).toISOString(),
            extension: wanted,
            grant_file: join(runDir, "grant"),
          },
          null,
          2,
        ),
        "utf8",
      );
    }
    return {
      granted: false,
      extension: wanted,
      extensions: snap.extensions,
      note: `extension ${wanted} needs an Orchestrator grant at ${join(runDir, "grant")}. The request is recorded and the run keeps running.`,
    };
  }

  snap.extensions.push({ n: wanted, at: new Date(nowSec * 1000).toISOString() });
  writeAtomic(
    join(runDir, "limits.json"),
    JSON.stringify({ stall: snap.stall, overlong: snap.overlong, extensions: snap.extensions }, null, 2),
  );
  return {
    granted: true,
    extension: wanted,
    extensions: snap.extensions,
    deadline: new Date((snap.started_at + snap.overlong * (1 + wanted)) * 1000).toISOString(),
    note: `extension ${wanted} recorded; the overlong deadline moved one more ${snap.overlong}s ahead`,
  };
}

function signalGroup(pgid, signal, signals) {
  if (!pgid || pgid < 1) return;
  try {
    process.kill(-pgid, signal);
    signals.push(signal);
  } catch {
    // The group is already gone, or it is not ours to signal. Either way the
    // stopped.json marker is the fact that matters.
  }
}

/**
 * Stop a run: SIGABRT to the group first, because a Python process answers it with
 * a stack dump the Executor can read; then SIGKILL to the group if 5 seconds of
 * grace did not end it. Writes stopped.json, which is what makes the state STOPPED
 * and lets the relay exit.
 */
export function stopRun(runDir, { nowSec = Date.now() / 1000, waitMs = 5000, pollMs = 100 } = {}) {
  writeAck(runDir, nowSec);
  const snap = readSnapshot(runDir, nowSec);
  const signals = [];
  if (snap.state !== "DONE") {
    signalGroup(snap.pid, "SIGABRT", signals);
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline && groupAlive(snap.pid)) sleepMs(pollMs);
    if (groupAlive(snap.pid)) signalGroup(snap.pid, "SIGKILL", signals);
  }
  writeAtomic(
    join(runDir, "stopped.json"),
    JSON.stringify({ stopped_at: new Date(nowSec * 1000).toISOString(), signals }, null, 2),
    "utf8",
  );
  return { state: readSnapshot(runDir, nowSec).state, signals, block: reportBlock(runDir) };
}

/** Find a run folder by id, searching every owner folder under the runs root. */
export function findRunDir(runId, env = process.env) {
  const root = runsDir(env);
  if (!runId || !existsSync(root)) return null;
  for (const name of listOwners(root)) {
    const candidate = join(root, name, runId);
    if (existsSync(join(candidate, "pid"))) return candidate;
  }
  return null;
}

function listOwners(root) {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** Append one knock record, so the relay can tell what it has already sent. */
export function appendKnock(runDir, record) {
  appendFileSync(join(runDir, "knocks.jsonl"), `${JSON.stringify(record)}\n`, "utf8");
}

export function readKnocks(runDir) {
  return splitLines(readText(join(runDir, "knocks.jsonl")))
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((entry) => entry && entry.key);
}

