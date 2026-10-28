// The command relay: one detached process per run, whose only job is to tell the
// owning Executor what its run is doing, because an idle Executor cannot see its
// own subprocess.
//
// It is the command half of the two watchers. The other half is the dispatch
// relay armed by orch_dispatch, which watches the agent. Neither reads the
// other's data: this one reads nothing outside its own run folder.
//
// It never stops, extends or judges a run, and it never kills. Its escalation is
// a text event to the Orchestrator saying a knock went unanswered -- which is not
// the same claim as "the agent is hung", because the agent may be mid-turn.
//
// Spawned by run_command with `process.execPath` and the run folder as argv[2].
// Node built-in modules only: nothing outside this repo and node: is imported.

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { herdrBin, listAgents, ownerMatch } from "./run-identity.mjs";
import { emitEvent } from "./orch-events.mjs";
import {
  KNOCK_GRACE_SECONDS,
  appendKnock,
  readKnocks,
  readSnapshot,
  runVerdict,
} from "./run-store.mjs";

const ORCHESTRATOR_NAME = "orchestrator";
const POLL_MS = Number(process.env.RUN_RELAY_POLL_MS || 15_000);
/** Consecutive good registry reads that do not show our owner before we give up. */
const UNBOUND_EXIT_READS = 3;

/** Block this process between polls. It has nothing else to wait on. */
function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// --- the decision, kept apart from the doing -----------------------------------

/**
 * Given what a run looks like now, decide what the relay should do.
 *
 * Returns a list of actions: `knock` (tell the owner), `request` (ask the
 * Orchestrator for an extension grant), `escalate` (one unanswered-knock event),
 * `exit` (stop watching). Pure: no files, no processes, no clock of its own, so
 * every state and every exit can be driven by an injected `nowSec`.
 */
export function decide(snap, nowSec, limits, knocks) {
  if (snap.state === "STOPPED") return [{ action: "exit", reason: "stopped" }];
  // An escalation is one event per run. If the marker is there, this relay's job is
  // done even after a restart, so it leaves rather than watching on.
  if (snap.escalated) return [{ action: "exit", reason: "already_escalated" }];

  const actions = [];
  const verdict = runVerdict({ ...snap, now: nowSec });

  // One knock per event worth knocking: DONE and CRASHED once each, STALLED once per
  // quiet window, OVERLONG once per deadline. The window or deadline carried in the
  // knock record is what makes a later knock a different event, not a repeat.
  if (verdict && !knocks.some((entry) => entry.key === verdict.key && entry.window === verdict.window)) {
    actions.push({ action: "knock", state: verdict.key, exit: verdict.exit, window: verdict.window });
  }

  if (snap.extension_requested && !knocks.some((entry) => entry.event === "grant_request")) {
    actions.push({ action: "request", used: snap.extensions_used });
  }

  // A knock is answered when the owner acts on the run: status, extend and stop all
  // write `ack`. The owner being `working` proves nothing about this run.
  const unanswered = knocks.filter((entry) => entry.at && entry.at > snap.ack).at(-1);
  if (unanswered && nowSec - unanswered.at > limits.grace_seconds) {
    return [
      { action: "escalate", state: unanswered.key, unanswered_seconds: Math.round(nowSec - unanswered.at) },
      { action: "exit", reason: "escalated" },
    ];
  }

  // Finished, told the owner, and the owner looked: nothing left to watch.
  if (snap.state === "DONE" || snap.state === "CRASHED") {
    const terminalKnock = knocks.filter((entry) => entry.key === snap.state).at(-1);
    if (terminalKnock && snap.ack >= terminalKnock.at) actions.push({ action: "exit", reason: "acked_terminal" });
  }
  return actions;
}

// --- the doing -----------------------------------------------------------------

function knockText(state, snap, runDir) {
  const next = state === "STALLED" || state === "OVERLONG" ? "status|extend|stop" : "status";
  return `RUN_EVENT: RUN=${runDir.split("/").pop()} STATE=${state} EXIT=${snap.exit_code ?? "none"} RUN_DIR=${runDir} NEXT=run_command ${next}`;
}

function escalationText(owner, runDir, state, unanswered) {
  return (
    `RELAY_EVENT: TASK=${runDir.split("/").pop()} AGENT=${owner.name} STATUS=agent_unresponsive ` +
    `WAIT_GET=unknown ARTIFACT_OR_REPORT=${runDir} KNOCK=${state} UNANSWERED_SECONDS=${unanswered} ` +
    `TSK_ID=none ORCHESTRATOR_ACTION=inspect-agent RELAY_LOG=${runDir}/relay.log`
  );
}

function requestText(owner, runDir, used) {
  return (
    `RELAY_EVENT: TASK=${runDir.split("/").pop()} AGENT=${owner.name} STATUS=extension_request ` +
    `WAIT_GET=unknown ARTIFACT_OR_REPORT=${runDir} EXTENSIONS_USED=${used} GRANT_FILE=${runDir}/grant ` +
    `TSK_ID=none ORCHESTRATOR_ACTION=inspect-agent RELAY_LOG=${runDir}/relay.log`
  );
}

/**
 * Deliver one message. True only when herdr accepted it: a knock that did not land
 * is not recorded, so the same verdict knocks again on the next poll instead of
 * being silently lost.
 */
function prompt(bin, env, target, text) {
  try {
    return spawnSync(bin, ["agent", "prompt", target, text], { encoding: "utf8", timeout: 15_000, env }).status === 0;
  } catch {
    return false;
  }
}

/**
 * Deliver one Orchestrator-bound event: write it to the relay inbox, and use the older
 * text prompt only when that write failed.
 *
 * Exactly one of the two paths runs, so an event is never sent twice. True means the
 * event is on its way by one of them; false means neither worked, and the caller does
 * not record it, so the same verdict tries again on the next poll rather than losing
 * it silently. The owner knock never comes through here: a knock belongs to the pane.
 */
function sendEvent(event, text, bin, env) {
  if (emitEvent(event, { env }).ok) return true;
  return prompt(bin, env, ORCHESTRATOR_NAME, text);
}

function ownerOf(runDir) {
  try {
    return JSON.parse(readFileSync(join(runDir, "owner.json"), "utf8"));
  } catch {
    return null;
  }
}

/**
 * Watch one run until there is nothing left to report.
 *
 * Binds to the owner by pane id and session, not by name alone: a name can be
 * reused by a different agent, and a stale DONE knock landing in a new agent's
 * composer is worse than no knock. Three consecutive registry reads that do not
 * show our owner end the relay silently -- the dispatch relay reports a dead agent.
 */
export function watch(runDir, { env = process.env, pollMs = POLL_MS, graceSeconds = KNOCK_GRACE_SECONDS } = {}) {
  const bin = herdrBin(env);
  const owner = ownerOf(runDir);
  if (!owner) return { reason: "no_owner_file" };
  const log = (text) => appendFileSync(join(runDir, "relay.log"), `[${new Date().toISOString()}] ${text}\n`, "utf8");
  log(`armed for ${runDir} owner=${owner.name} poll=${pollMs}ms grace=${graceSeconds}s`);
  let unbound = 0;
  for (;;) {
    // The folder is the relay's whole world. If it is gone, the owner reaped the
    // run: keep polling would leave an orphan that watches nothing.
    if (!existsSync(runDir)) return { reason: "run_folder_gone" };
    const { ok, agents } = listAgents(bin, env);
    let bound = false;
    if (ok) {
      bound = ownerMatch(agents, owner);
      if (bound) {
        unbound = 0;
      } else {
        unbound += 1;
        log(`owner not in registry (${unbound}/${UNBOUND_EXIT_READS})`);
        if (unbound >= UNBOUND_EXIT_READS) {
          log("exit reason=owner_gone");
          return { reason: "owner_gone" };
        }
      }
    } else {
      // A failed read is unknown, not gone: it must not count toward the exit.
      log("registry read failed; treating as unknown");
    }
    // Knock only at an owner the registry shows right now. An unverified owner gets
    // no message, because the name may already belong to a different agent.
    if (!bound) {
      pause(pollMs);
      continue;
    }

    const snap = readSnapshot(runDir);
    const knocks = readKnocks(runDir);
    const nowSec = Date.now() / 1000;
    const actions = decide(snap, nowSec, { grace_seconds: graceSeconds }, knocks);

    for (const act of actions) {
      if (act.action === "knock") {
        if (prompt(bin, env, owner.name, knockText(act.state, snap, runDir))) {
          appendKnock(runDir, { key: act.state, at: nowSec, window: act.window });
          log(`knock state=${act.state}`);
        } else {
          log(`knock not delivered state=${act.state}`);
        }
      } else if (act.action === "request") {
        if (
          sendEvent(
            {
              task: runDir.split("/").pop(),
              agent: owner.name,
              status: "extension_request",
              wait_get: "unknown",
              artifact_or_report: runDir,
              tsk_id: "none",
              relay_log: `${runDir}/relay.log`,
              extra: `EXTENSIONS_USED=${act.used} GRANT_FILE=${runDir}/grant`,
            },
            requestText(owner, runDir, act.used),
            bin,
            env,
          )
        ) {
          appendKnock(runDir, { key: "OVERLONG", event: "grant_request", at: nowSec });
          log("extension grant requested");
        }
      } else if (act.action === "escalate") {
        // Marked before sending: a restart must not repeat the one escalation.
        writeFileSync(join(runDir, "escalated"), `${new Date(nowSec * 1000).toISOString()} ${act.state}\n`, "utf8");
        sendEvent(
          {
            task: runDir.split("/").pop(),
            agent: owner.name,
            status: "agent_unresponsive",
            wait_get: "unknown",
            artifact_or_report: runDir,
            tsk_id: "none",
            relay_log: `${runDir}/relay.log`,
            extra: `KNOCK=${act.state} UNANSWERED_SECONDS=${act.unanswered_seconds}`,
          },
          escalationText(owner, runDir, act.state, act.unanswered_seconds),
          bin,
          env,
        );
        log(`escalated knock=${act.state} unanswered=${act.unanswered_seconds}s`);
      } else if (act.action === "exit") {
        log(`exit reason=${act.reason}`);
        return { reason: act.reason };
      }
    }
    pause(pollMs);
  }
}

// Run as a process when started detached by run_command, and stay importable for
// the tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const runDir = process.argv[2];
  if (!runDir || !existsSync(join(runDir, "owner.json"))) {
    console.error(`run relay needs a run folder with an owner.json: ${runDir}`);
    process.exit(1);
  }
  watch(runDir);
}
