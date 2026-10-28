// The relay inbox: one JSON event file per event, written by senders and read back
// by the Orchestrator's own relay-inbox extension.
//
// This module owns the event's SHAPE and its MOVEMENT. It does not decide when an
// event is worth sending: each sender (the command relay, the dispatch relay, the
// foreground watchdog) keeps that judgement. Nothing here kills, blocks or mutates
// a tool call or a run; the worst it does is hand the Orchestrator a line to look at.
//
// Delivery is durable on disk and at-most-once live. A sender that cannot write its
// event falls back to the older `herdr agent prompt orchestrator` text path, so an
// inbox problem never loses an event, and never sends it twice.
//
// Node built-in modules only: this is imported by detached node processes as well as
// by pi extensions.

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, watch, writeFileSync } from "node:fs";
import { join } from "node:path";

import { herdrBin, whoami } from "./run-identity.mjs";
// The inbox root is per repo (/tmp/orch/<repo>/relay-inbox), never one project's
// hardcoded path; see ./orch-home.mjs for the convention and the pin file.
import { inboxDir as resolveInboxDir } from "./orch-home.mjs";

/** Production root: the repo's own lane state, or ORCH_EVENTS_DIR when set. */

/** Every event file carries this `kind`; it is not a per-sender choice. */
export const EVENT_KIND = "relay";

/** Anchored: a substring test would also match a worker named "orch-something". */
export const ORCHESTRATOR_NAME_RE = /^orchestrator(-[a-z0-9]+)*$/;

/** The twelve keys every event carries, in the order they are written. */
export const EVENT_KEYS = [
  "id",
  "kind",
  "task",
  "agent",
  "status",
  "wait_get",
  "artifact_or_report",
  "tsk_id",
  "orchestrator_action",
  "relay_log",
  "ts",
  "extra",
];

/** `id` and `ts` are the two keys the emitter fills when a sender leaves them out. */
const REQUIRED_KEYS = ["id", "kind", "task", "agent", "status", "ts"];

/**
 * The action an event asks of the Orchestrator, derived from its status and never
 * from what a sender happened to write: only a settled agent earns a board update.
 */
export function actionForStatus(status) {
  return status === "settled" ? "update-tsk-board" : "inspect-agent";
}

/** Where events live: the env override names the ROOT, and the two subdirs are ours. */
export function inboxRoot(env = process.env) {
  return env.ORCH_EVENTS_DIR || resolveInboxDir(process.cwd(), env);
}

export function inboxPaths(root) {
  return { root, pending: join(root, "pending"), processed: join(root, "processed") };
}

/** Never fails delivery on an absent directory: it is created on demand. */
function ensureDirs(paths, fileSystem = { mkdirSync }) {
  fileSystem.mkdirSync(paths.pending, { recursive: true });
  fileSystem.mkdirSync(paths.processed, { recursive: true });
}

/** `20261008T133123Z`: the same stamp `run-store.mjs` gives a run id. */
function utcStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Second precision, so the node emitter and the bash/python emitter agree. */
function isoStamp(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Only for file NAMES: a task or status with a path separator must not escape. */
function nameSafe(value) {
  return (
    String(value)
      .replace(/[^A-Za-z0-9._-]/g, "-")
      .replace(/^-+|-+$/g, "") || "none"
  );
}

/**
 * A name whose lexicographic order is its chronological order, so the drain reads
 * oldest first. `<4 hex>` keeps two events in the same second apart.
 */
function eventFileName(stamp, hex, task, status) {
  return `${stamp}-${hex}-${nameSafe(task)}-${nameSafe(status)}.json`;
}

/**
 * True for event files only. A temp name ends in `.tmp-<hex>`, and a dotfile starts
 * with a dot, so neither is ever claimed or delivered.
 */
export function isEventName(name) {
  const text = String(name ?? "");
  return text.endsWith(".json") && !text.startsWith(".");
}

/**
 * Write one event into `pending/`.
 *
 * Atomic on purpose: the file is written under a temp name and renamed into place,
 * so a reader either sees the whole event or sees nothing. `fs` is a seam the test
 * spies on, and it is also how a partial write is proven impossible rather than
 * assumed. Any failure -- bad input, an unwritable directory, a missing python --
 * comes back as `{ok:false}` and is never thrown: a sender must always be able to
 * fall back to the text prompt.
 */
export function emitEvent(input, { env = process.env, now = new Date(), inboxDir, fs } = {}) {
  const fileSystem = fs ?? { writeFileSync, renameSync, mkdirSync };
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false };
    const task = typeof input.task === "string" ? input.task : "";
    const status = typeof input.status === "string" ? input.status : "";
    if (!task || !status) return { ok: false };

    const date = now instanceof Date ? now : new Date(now);
    if (!Number.isFinite(date.getTime())) return { ok: false };

    const stamp = utcStamp(date);
    const hex = randomBytes(2).toString("hex");
    const event = {
      id: input.id || `${task}-${status}-${stamp}-${hex}`,
      kind: EVENT_KIND,
      task,
      agent: typeof input.agent === "string" && input.agent ? input.agent : "unknown",
      status,
      wait_get: input.wait_get ?? "unknown",
      artifact_or_report: input.artifact_or_report ?? "none",
      tsk_id: input.tsk_id ?? "none",
      orchestrator_action: actionForStatus(status),
      relay_log: input.relay_log ?? "",
      ts: input.ts || isoStamp(date),
      extra: input.extra ?? "",
    };
    // Keys the twelve do not cover (a watchdog's `tool`, a later sender's field)
    // ride along: dropping them would lose the evidence the event was sent for.
    for (const [key, value] of Object.entries(input)) {
      if (!(key in event)) event[key] = value;
    }

    const paths = inboxPaths(inboxDir ?? inboxRoot(env));
    ensureDirs(paths, fileSystem);
    const name = eventFileName(stamp, hex, task, status);
    const target = join(paths.pending, name);
    const temp = `${target}.tmp-${hex}`;
    fileSystem.writeFileSync(temp, `${JSON.stringify(event, null, 2)}\n`, "utf8");
    fileSystem.renameSync(temp, target);
    return { ok: true, file: target, id: event.id };
  } catch {
    return { ok: false };
  }
}

/**
 * Read an event back. Validation is deliberately minimal: the six keys a delivery
 * cannot be built without must be there, and everything else -- including keys this
 * module has never heard of -- is preserved rather than normalised away.
 *
 * Throws on bad input; `readEventFile` turns that into a value a caller can log.
 */
export function parseEvent(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`not json: ${error.message}`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("not an object");
  for (const key of REQUIRED_KEYS) {
    const value = data[key];
    if (typeof value !== "string" || !value) throw new Error(`missing ${key}`);
  }
  if (data.kind !== EVENT_KIND) throw new Error(`unknown kind ${data.kind}`);
  return { ...data, orchestrator_action: actionForStatus(data.status) };
}

export function readEventFile(path) {
  try {
    return { ok: true, event: parseEvent(readFileSync(path, "utf8")) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * The same `RELAY_EVENT: KEY=value` line the text prompt has always carried, so a
 * delivered event reads to the Orchestrator exactly like the fallback it replaces.
 *
 * The authoritative copy is the message's `details.event`: values with spaces are
 * the last thing on the line, as they have always been, and are not quoted.
 */
export function renderFlatLine(event) {
  const parts = [
    "RELAY_EVENT:",
    `TASK=${event.task}`,
    `AGENT=${event.agent}`,
    `STATUS=${event.status}`,
    `WAIT_GET=${event.wait_get}`,
    `ARTIFACT_OR_REPORT=${event.artifact_or_report}`,
    `TSK_ID=${event.tsk_id}`,
    `ORCHESTRATOR_ACTION=${event.orchestrator_action}`,
    `RELAY_LOG=${event.relay_log ?? ""}`,
  ];
  const extra = typeof event.extra === "string" ? event.extra.trim() : "";
  if (extra) parts.push(extra);
  return parts.join(" ");
}

/**
 * Claim every pending event, oldest first, and deliver it.
 *
 * Claim-then-deliver: the rename into `processed/` happens BEFORE the delivery, so
 * two orchestrator-named sessions cannot deliver the same event, and a session that
 * restarts cannot redeliver one it already claimed. The residual this accepts is a
 * crash between the rename and the delivery: that event is then evidence in
 * `processed/` and was never delivered live. It is the price of at-most-once.
 *
 * The loop is synchronous, so deliveries are serial and can never overlap. A
 * malformed file is logged and skipped: one bad file never stalls the session.
 */
export function drainInbox({ inboxDir, env = process.env, deliver = () => {}, log = () => {} } = {}) {
  const paths = inboxPaths(inboxDir ?? inboxRoot(env));
  const outcome = { delivered: [], claimed: 0, skipped: 0 };
  let names;
  try {
    names = readdirSync(paths.pending);
  } catch {
    return outcome; // no inbox yet: there is nothing to deliver, which is not a failure
  }
  for (const name of names.filter(isEventName).sort()) {
    const from = join(paths.pending, name);
    const to = join(paths.processed, name);
    try {
      renameSync(from, to);
    } catch {
      continue; // claimed by another drain a moment ago, or already gone
    }
    outcome.claimed += 1;
    const parsed = readEventFile(to);
    if (!parsed.ok) {
      outcome.skipped += 1;
      log(`skipped ${name}: ${parsed.error}`);
      continue;
    }
    outcome.delivered.push(name);
    try {
      deliver(parsed.event);
    } catch (error) {
      // Claimed and undeliverable: it stays as evidence, and the rest still go out.
      log(`delivery failed for ${name}: ${error?.message ?? error}`);
    }
  }
  return outcome;
}

/**
 * Watch `pending/` and drain on every new event file.
 *
 * Returns `{ stop }`, and a `drainNow` the entry (and the tests) can call to drive
 * the same path without waiting on the filesystem's timing.
 */
export function startInboxWatch({ inboxDir, env = process.env, deliver = () => {}, log = () => {} } = {}) {
  const paths = inboxPaths(inboxDir ?? inboxRoot(env));
  try {
    ensureDirs(paths);
  } catch (error) {
    log(`inbox unavailable: ${error?.message ?? error}`);
  }

  let queue = Promise.resolve();
  const runDrain = () => {
    queue = queue.then(() => {
      try {
        return drainInbox({ inboxDir: paths.root, deliver, log });
      } catch (error) {
        log(`drain failed: ${error?.message ?? error}`);
      }
    });
    return queue;
  };

  let watcher = null;
  try {
    watcher = watch(paths.pending, (_type, changed) => {
      if (changed && !isEventName(String(changed))) return; // a mid-write temp file
      runDrain();
    });
    watcher.on("error", (error) => log(`watch error: ${error?.message ?? error}`));
  } catch (error) {
    log(`watch unavailable: ${error?.message ?? error}`);
  }

  return {
    paths,
    drainNow: runDrain,
    stop() {
      if (watcher) {
        try {
          watcher.close();
        } catch {
          // already closed
        }
        watcher = null;
      }
    },
  };
}

/**
 * The name this session is, for the gate. pi's own name first -- it is what `/name`
 * sets -- then herdr's registry for this pane, which is what dispatch uses. Returns
 * `null` when neither answers, and callers must not guess at that point.
 */
export async function resolveGateName(pi, env = process.env) {
  let name;
  try {
    name = pi?.getSessionName?.()?.trim() || undefined;
  } catch {
    name = undefined;
  }
  if (name) return name.toLowerCase();
  const identity = whoami(env, herdrBin(env));
  return identity?.name ? identity.name.toLowerCase() : null;
}

/** True when this session may not talk about itself: the control plane is watched, not watching. */
export function isOrchestratorName(name) {
  return typeof name === "string" && ORCHESTRATOR_NAME_RE.test(name);
}
