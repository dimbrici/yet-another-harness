/**
 * The foreground watchdog: time the tool calls this session has open right now.
 *
 * It answers G1 -- a plain `bash` call the model expected to be quick, that hangs.
 * `run_command` cannot help there, because the model chooses which tool to use, and
 * the 28-minute incident was a foreground call (critique C8). Release 1 retired the
 * old bounds, so this is what replaced them for the foreground.
 *
 * It reports and nothing else. It registers no tool, sets no `tool_call` hook, sends
 * nothing to its own agent, and kills nothing: alerting is the whole design. The
 * Orchestrator decides what to do about a `tool_hung`, and its only real options are
 * to look at the pane, send keys, or restart the agent (C6). Those stay its choice.
 *
 * Registration and the conversion of an alert into a delivery live here. The rule
 * that decides whether an alert is due is in ./lib/tool-watch.mjs, and the event
 * shape and the inbox are in ./lib/orch-events.mjs.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { spawnSync } from "node:child_process";

import {
  emitEvent,
  isOrchestratorName,
  resolveGateName,
} from "./lib/orch-events.mjs";
import { herdrBin } from "./lib/run-identity.mjs";
import {
  ALERT_KINDS,
  computeAlerts,
  createToolWatch,
  tickSeconds,
} from "./lib/tool-watch.mjs";

const ORCHESTRATOR_NAME = "orchestrator";

/** The text event the older delivery path carried, kept for the fallback. */
function hungText(alert, agent, pane) {
  return (
    `RELAY_EVENT: TASK=tool_hung AGENT=${agent} STATUS=tool_hung WAIT_GET=unknown ` +
    `ARTIFACT_OR_REPORT=none TSK_ID=none ORCHESTRATOR_ACTION=inspect-agent RELAY_LOG= ` +
    `TOOL=${alert.toolName} SILENT_SECONDS=${alert.silentSeconds} TOTAL_SECONDS=${alert.totalSeconds} PANE=${pane}`
  );
}

export default function (pi: ExtensionAPI) {
  const watch = createToolWatch();
  /** Resolved once per session: identity does not change underneath a running watch. */
  let gate = { resolved: false, name: null, orchestrator: false };
  let timer = null;

  pi.on("session_start", async () => {
    const name = await resolveGateName(pi);
    gate = { resolved: true, name, orchestrator: isOrchestratorName(name) };
    // The control plane is watched, not watching: it must never alarm about itself.
    // An UNRESOLVED identity still watches: it is a worker whose name we could not
    // read, and a silent watchdog is the failure this whole file exists to prevent.
    if (gate.orchestrator) return;
    const seconds = tickSeconds(process.env);
    timer = setInterval(() => tick(), seconds * 1000);
    if (typeof timer?.unref === "function") timer.unref();
  });

  pi.on("tool_execution_start", async (event: any) => {
    if (gate.orchestrator) return;
    watch.onStart(event ?? {}, nowSec());
  });

  pi.on("tool_execution_update", async (event: any) => {
    if (gate.orchestrator) return;
    watch.onUpdate(event ?? {}, nowSec());
  });

  pi.on("tool_execution_end", async (event: any) => {
    if (gate.orchestrator) return;
    watch.onEnd(event ?? {}, nowSec());
  });

  pi.on("session_shutdown", async () => {
    // Stop the clock and forget the open calls: a reload re-registers, and records
    // that survive would re-alert about calls from a turn that no longer exists.
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    watch.reset();
  });

  function nowSec() {
    return Date.now() / 1000;
  }

  /** One pass of the rule, then hand every due alert off exactly once. */
  function tick() {
    if (gate.orchestrator) return;
    const alerts = computeAlerts(watch.records, nowSec());
    if (alerts.length === 0) return;
    for (const alert of alerts) report(alert);
    watch.alertsReported(alerts);
  }

  /** Emit into the inbox; only a failed emit drops back to the text prompt. */
  function report(alert) {
    if (!ALERT_KINDS.includes(alert.kind)) return; // no alert kind is an action
    const env = process.env;
    const agent = gate.resolved ? gate.name ?? "unknown" : "unknown";
    const pane = env.HERDR_PANE_ID || "none";
    const sent = emitEvent(
      {
        task: "tool_hung",
        agent,
        status: "tool_hung",
        wait_get: "unknown",
        artifact_or_report: "none",
        tsk_id: "none",
        extra: `TOOL=${alert.toolName} SILENT_SECONDS=${alert.silentSeconds} TOTAL_SECONDS=${alert.totalSeconds} PANE=${pane}`,
        tool: {
          toolCallId: alert.toolCallId,
          toolName: alert.toolName,
          argsPreview: alert.argsPreview,
          silentSeconds: alert.silentSeconds,
          totalSeconds: alert.totalSeconds,
        },
      },
      { env },
    );
    if (sent.ok) return;
    try {
      spawnSync(herdrBin(env), ["agent", "prompt", ORCHESTRATOR_NAME, hungText(alert, agent, pane)], {
        encoding: "utf8",
        timeout: 15_000,
        env,
      });
    } catch {
      // Both paths failed. The alert is lost, and nothing here may act on the call.
    }
  }
}
