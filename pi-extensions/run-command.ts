/**
 * run_command: start a long local command detached, so the agent stays reachable
 * instead of sitting inside one tool call waiting for it.
 *
 * This file registers the tool and turns library results into tool text. All the
 * run logic lives in ./lib/run-store.mjs, and the watching lives in the separate
 * detached command relay. The tool itself watches nothing: one module, one job.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";

import {
  OVERLONG_CEILING,
  STALL_CEILING,
  extendRun,
  findRunDir,
  reportBlock,
  startRun,
  statusRun,
  stopRun,
} from "./lib/run-store.mjs";

const ACTIONS = ["start", "status", "extend", "stop"] as const;

function text(value: string) {
  return { content: [{ type: "text", text: value }], details: {} };
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "run_command",
    label: "Run long command",
    description:
      "Start one long-running LOCAL command detached, in its own process group, and return at once with a run id " +
      "and a run folder. Verbs: start, status, extend, stop. Use it for anything that may run more than a couple of " +
      "minutes (test suites, builds, waits). After start, do bounded independent work only if it does not change the " +
      "running command's inputs or invalidate its evidence; otherwise end your turn. Do not poll in a foreground " +
      "sleep; when the relay knocks you, use run_command status before acting. The relay knocks you when the run is " +
      "DONE, STALLED, CRASHED or OVERLONG. Local commands only -- never a cluster or cloud command. " +
      "Executor only. You set stall and overlong inside a fence; extensions 1-3 are free, the 4th needs an " +
      "Orchestrator grant. Nothing is ever killed on time: a knock is a check-in, and stop is your decision. " +
      "When you report BLOCKED, copy the report block this tool returns into it and fill DONE_SO_FAR and REMAINING.",
    promptSnippet: "Start a long local command detached and get knocked when it needs you",
    promptGuidelines: [
      "Use run_command instead of bash for anything that may run more than a couple of minutes, so your turn can end while the command keeps going.",
      "After run_command start, do bounded independent work only if it does not change the running command's inputs or invalidate its evidence; otherwise end your turn. Do not poll in a foreground sleep. After a relay notification, use run_command status before acting.",
      "Use run_command extend when a run is legitimately going over its overlong deadline; run_command stop only when you decided to end it.",
      "Copy the run_command report block (RUN_DIR, COMMAND, LIMITS, EXTENSIONS, LOG_TAIL, STACK_DUMP) into any BLOCKED report.",
    ],
    parameters: Type.Object({
      action: StringEnum(ACTIONS),
      command: Type.Optional(Type.String({ description: "Shell command text (start)" })),
      run: Type.Optional(Type.String({ description: "Run id from a previous start (status, extend, stop)" })),
      stall: Type.Optional(
        Type.Number({ description: `Quiet seconds that count as a stall (default 300, ceiling ${STALL_CEILING})` }),
      ),
      overlong: Type.Optional(
        Type.Number({ description: `Total seconds per ceiling before a check-in (default 1200, ceiling ${OVERLONG_CEILING})` }),
      ),
    }),

    async execute(_id, params, _signal, _onUpdate, ctx) {
      try {
        if (params.action === "start") {
          const started = startRun({
            command: params.command ?? "",
            cwd: ctx.cwd,
            stall: params.stall,
            overlong: params.overlong,
          });
          return text(
            [
              `RUN=${started.id}`,
              `RUN_DIR=${started.dir}`,
              `STATE=RUNNING`,
              `LIMITS stall=${started.stall}s overlong=${started.overlong}s`,
              `Owner ${started.owner.name}: do bounded independent work only if it does not change the running command's ` +
                `inputs or invalidate its evidence; otherwise end your turn. Do not poll in a foreground sleep. After a ` +
                `relay notification, use run_command status before acting. The relay knocks you on DONE, STALLED, ` +
                `CRASHED or OVERLONG.`,
            ].join("\n"),
          );
        }

        const runDir = findRunDir(params.run ?? "");
        if (!runDir) return text(`no run folder for run '${params.run}' under the runs directory`);

        if (params.action === "status") {
          const status = statusRun(runDir);
          const head = `STATE=${status.state} ELAPSED=${status.elapsed_seconds}s EXIT=${status.exit_code ?? "none"}`;
          return text(`${head}\n${status.block}`);
        }
        if (params.action === "extend") {
          const extended = extendRun(runDir);
          return text(`${extended.granted ? "EXTENDED" : "REFUSED"}: ${extended.note}\n${reportBlock(runDir)}`);
        }
        const stopped = stopRun(runDir);
        return text(`STATE=${stopped.state} SIGNALS=${stopped.signals.join(",") || "none"}\n${stopped.block}`);
      } catch (error) {
        // A refusal is a fact the model has to read, not a stack trace.
        return text(`REFUSED: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  });
}
