// The foreground watchdog's rules, kept away from the doing.
//
// This is Release 2's answer to G1: a command the model thought was quick and ran in
// the foreground can hang, and with the old bounds retired nothing timed it. The
// watchdog watches the tool calls that are OPEN right now in this session and says so.
//
// It never kills, never blocks, never redirects, and never changes a tool call. Its
// entire output is the alert list below, and the only thing an alert can do is be
// reported to the Orchestrator, which is the only party that can act. Whether it
// acts is a decision, not a consequence: see critique C6 and the open task T150.
//
// Two rules, deliberately different:
//   silent -- a call that has produced NOTHING for SILENT_HUNG_SECONDS. The hang.
//   total  -- a call still open at TOTAL_OPEN_SECONDS, output or no output. The
//             runaway that prints forever (the 6760 s class), which silence would
//             never catch and which the model can extend past any quiet check.

/** Seconds of no output before an open foreground call is called hung. */
export const SILENT_HUNG_SECONDS = 600;
/** Seconds between further alerts about that same still-silent call. */
export const SILENT_REPEAT_SECONDS = 600;
/** Total seconds an open call earns one alert regardless of any output. */
export const TOTAL_OPEN_SECONDS = 1800;

/** How often the watchdog looks at its records. Wall clock, not tool time. */
export const DEFAULT_TICK_SECONDS = 15;

/** Read at registration time, not at import: `TOOL_WATCH_TICK_SECONDS` is a test seam. */
export function tickSeconds(env = process.env) {
  const value = Number(env.TOOL_WATCH_TICK_SECONDS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TICK_SECONDS;
}

/**
 * The complete set of things a watchdog alert can be. Nothing in here kills,
 * blocks, cancels, mutates or overrides: an alert is a report and no more. The
 * test pins this list, so an action the watchdog has no authority to take cannot
 * be added without a red test.
 */
export const ALERT_KINDS = Object.freeze(["silent", "total"]);

/** One line, no longer than this, so an event stays small and safe to paste. */
export const ARGS_PREVIEW_CHARS = 200;

/** The arguments as one capped line: what was called, not a transcript of it. */
export function previewArgs(args) {
  const text =
    typeof args === "string"
      ? args
      : (() => {
          try {
            return JSON.stringify(args ?? {});
          } catch {
            return String(args);
          }
        })();
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length <= ARGS_PREVIEW_CHARS ? oneLine : `${oneLine.slice(0, ARGS_PREVIEW_CHARS - 1)}\u2026`;
}

/**
 * Alerts due at `nowSec`, given what the records already reported.
 *
 * Pure: it reads counters and writes nothing, so every threshold and every cadence
 * can be driven by an injected clock. Silence is measured from the LATER of start or
 * the last update -- output is progress, and progress restarts the quiet window.
 * A total alert fires once per call; a silent alert fires at the threshold and then
 * every SILENT_REPEAT_SECONDS while the call stays open and stays silent.
 */
export function computeAlerts(records, nowSec) {
  const alerts = [];
  for (const record of [...records.values()]) {
    if (record.closed) continue;
    const silentFor = Math.max(0, nowSec - record.lastActivityAt);
    const openFor = Math.max(0, nowSec - record.startedAt);
    const silentDue = silentAlertsDue(silentFor);
    for (let n = record.silentReported + 1; n <= silentDue; n += 1) {
      alerts.push(toAlert("silent", record, silentFor, openFor));
    }
    if (openFor >= TOTAL_OPEN_SECONDS && !record.totalReported) {
      alerts.push(toAlert("total", record, silentFor, openFor));
    }
  }
  return alerts;
}

/** How many silent alerts a quiet window of `silentFor` seconds has earned. */
function silentAlertsDue(silentFor) {
  if (silentFor < SILENT_HUNG_SECONDS) return 0;
  return 1 + Math.floor((silentFor - SILENT_HUNG_SECONDS) / SILENT_REPEAT_SECONDS);
}

function toAlert(kind, record, silentFor, openFor) {
  return {
    kind,
    toolCallId: record.toolCallId,
    toolName: record.toolName,
    argsPreview: record.argsPreview,
    silentSeconds: Math.floor(silentFor),
    totalSeconds: Math.floor(openFor),
  };
}

/**
 * The per-`toolCallId` record machine the handlers drive.
 *
 * One record per open call, so parallel calls are timed independently and cannot
 * mask each other. `end` removes the record outright: a call that finished is never
 * alerted about again, however long it took. `alertsReported` is what keeps the pure
 * rule above from re-firing on every 15-second tick.
 */
export function createToolWatch() {
  /** @type {Map<string, object>} */
  const records = new Map();

  function onStart({ toolCallId, toolName, args }, nowSec) {
    if (!toolCallId) return null;
    const at = nowSec ?? Date.now() / 1000;
    const record = {
      toolCallId,
      toolName: typeof toolName === "string" ? toolName : "unknown",
      argsPreview: previewArgs(args),
      startedAt: at,
      lastActivityAt: at,
      silentReported: 0,
      totalReported: false,
      closed: false,
    };
    records.set(toolCallId, record);
    return record;
  }

  /** Output is progress: the quiet window restarts, the open window does not. */
  function onUpdate({ toolCallId }, nowSec) {
    const record = records.get(toolCallId);
    if (!record || record.closed) return null;
    record.lastActivityAt = nowSec ?? Date.now() / 1000;
    record.silentReported = 0;
    return record;
  }

  function onEnd({ toolCallId }, nowSec) {
    const record = records.get(toolCallId);
    if (!record) return null;
    records.delete(toolCallId);
    return { openSeconds: Math.max(0, (nowSec ?? Date.now() / 1000) - record.startedAt) };
  }

  /** Counters advance only once an alert has actually been handed off. */
  function alertsReported(alerts) {
    for (const alert of alerts ?? []) {
      const record = records.get(alert.toolCallId);
      if (!record || record.closed) continue;
      if (alert.kind === "silent") record.silentReported += 1;
      else if (alert.kind === "total") record.totalReported = true;
    }
  }

  return {
    records,
    onStart,
    onUpdate,
    onEnd,
    alertsReported,
    openCount: () => [...records.values()].filter((record) => !record.closed).length,
    reset: () => records.clear(),
  };
}
