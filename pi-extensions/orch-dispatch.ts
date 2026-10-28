/**
 * Orchestrator dispatch tools: start a worker on the model its role is assigned,
 * watch it, and stop it cleanly.
 *
 * WHY THIS EXISTS. On 2026-10-01 the Orchestrator hand-typed
 * `herdr agent start <name> --kind pi --pane <pane>` seven times without pinning a
 * model. Every one silently came up on pi's default model instead of the routing
 * assignment, and one of them was a reviewer running the same model family as the
 * executor it was judging. Remembering is not a control. This tool reads
 * `.planning/orch/agents/orchestrator-routing.yaml` through the shared
 * `routing_lookup.py`, verifies the provider with `pi auth check`, pins `--model`
 * explicitly, and reads the chosen model back out of the live pi session. There is
 * no default role and no fallback provider: an unassigned role is an error.
 *
 * It also collapses the rest of the hand-run dance: create the tab, refuse to
 * clobber a live agent, submit the brief, arm a watch-only relay that gates on the
 * report being newer than an arm-time stamp, and confirm the agent actually started
 * a turn.
 *
 * Tools are registered for every session but refuse to run outside the
 * Orchestrator, because the Orchestrator is the sole control plane and a worker
 * must not dispatch workers.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { spawn } from "node:child_process";
// The generated relay lives in ./lib/relay-script.mjs, so it can be rendered and tested
// without loading the pi runtime. shellQuote() went with it: it writes that script's own lines.
// CO-LOCATION REQUIREMENT: this file and ./lib/ must travel together. A copy of
// orch-dispatch.ts without its sibling ./lib/ fails at import time. Never copy
// one without the other (this bit a second .pi home that holds extensions without lib/).
// The P1b brief cross-check lives there too, for the same testability reason; it is a
// separate statement because the import-shape test pins the relayScript import line.
import { relayScript } from "./lib/relay-script.mjs";
import { briefMismatch } from "./lib/relay-script.mjs";
// Lane state (relay scripts, with their stamps and logs) is resolved per REPO rather
// than from one project's hardcoded /tmp path. See ./lib/orch-home.mjs for the
// convention and for how to pin a repo to a legacy directory.
import { relayDir } from "./lib/orch-home.mjs";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

const ROLES = [
  "planning",
  "implementation",
  "reviewer",
  "architect",
  "interlocutor",
  "deliberation",
  "research",
] as const;

const ROUTING_RELATIVE = ".planning/orch/agents/orchestrator-routing.yaml";
const LOOKUP_RELATIVE = ".planning/orch/agents/routing_lookup.py";
const RELAY_LIB_RELATIVE = ".planning/orch/relay-lib.sh";

/**
 * Only the control plane may dispatch. This is anchored rather than a substring
 * search: a substring test for "orch" let a session named "worker-not-orch"
 * through, which is exactly how a stray test run reached into a live campaign and
 * killed its runner. Anchoring also keeps discussion sessions such as "orch_discuss"
 * (decision-workflow participants, not the control plane) out.
 */
const ORCHESTRATOR_NAME_RE = /^orchestrator(-[a-z0-9]+)*$/;

const MAX_BRIEF_BYTES = 100_000;
const DEFAULT_CONFIRM_MS = 25_000;
const DEFAULT_STOP_MS = 60_000;
const POLL_MS = 1_500;
/** pi records the chosen model in the session file; it appears near the top. */
const SESSION_SCAN_BYTES = 262_144;

type RunResult = { stdout: string; stderr: string; code: number };
type HerdrAgent = {
  name?: string;
  agent_status?: string;
  pane_id?: string;
  cwd?: string;
  agent_session?: { value?: string };
};

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

function asJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function absolute(cwd: string, path: string): string {
  // Some models prefix paths with "@"; built-in tools strip it, so does this one.
  const cleaned = path.startsWith("@") ? path.slice(1) : path;
  return isAbsolute(cleaned) ? cleaned : resolve(cwd, cleaned);
}

async function sh(pi: ExtensionAPI, cmd: string, args: string[], timeout?: number): Promise<RunResult> {
  const raw: any = await pi.exec(cmd, args, timeout ? { timeout } : undefined);
  return {
    stdout: String(raw?.stdout ?? ""),
    stderr: String(raw?.stderr ?? ""),
    code: Number(raw?.code ?? 0),
  };
}

async function shOk(pi: ExtensionAPI, cmd: string, args: string[], timeout?: number): Promise<string> {
  const result = await sh(pi, cmd, args, timeout);
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout).trim() || "(no output)";
    throw new Error(`${cmd} ${args.join(" ")} exited ${result.code}: ${detail}`);
  }
  return result.stdout;
}

/**
 * Who is running this? Two sources, because pi's session name alone is NOT
 * reliable: `getSessionName()` reads a `session_info` entry, and a session that was
 * never named with `/name` has none. That is not hypothetical -- the live
 * Orchestrator session has zero `session_info` entries, so a name-only guard
 * refuses its own Orchestrator, and the same bug left the orchdoc rulebook
 * silently un-injected for days while looking perfectly healthy.
 *
 * So: prefer pi's session name (works headless), otherwise ask herdr which agent
 * owns this pane via HERDR_PANE_ID -- the same registry dispatch itself uses.
 */
async function resolveIdentity(pi: ExtensionAPI): Promise<{ name?: string; source: string }> {
  let name: string | undefined;
  try {
    name = pi.getSessionName()?.trim() || undefined;
  } catch {
    name = undefined;
  }
  if (name) return { name, source: "pi session name" };

  const pane = process.env.HERDR_PANE_ID;
  if (pane) {
    const result = await sh(pi, "herdr", ["agent", "list"]);
    const agents = result.code === 0 ? asJson(result.stdout)?.result?.agents : undefined;
    if (Array.isArray(agents)) {
      const mine = agents.find((entry: any) => entry?.pane_id === pane);
      const herdrName = typeof mine?.name === "string" ? mine.name.trim() : "";
      if (herdrName) return { name: herdrName, source: `herdr agent in pane ${pane}` };
    }
  }
  return { name: undefined, source: "unresolved" };
}

/**
 * Compare two model ids for equality, tolerating punctuation differences.
 *
 * pi writes some provider ids to the session with punctuation swapped:
 * github-copilot/claude-sonnet-5.5 is recorded as "claude-sonnet-5-5". A strict
 * string comparison therefore reported a FALSE MISMATCH on the first dispatch
 * under the new routing, and warned that a correctly-routed worker could not be
 * trusted. Both failure directions matter: a false alarm trains distrust of valid
 * work, and a comparison loose enough to hide a real substitution would defeat
 * the point of reading the model back at all. So normalize punctuation and case,
 * but compare the whole id -- never a prefix, never a substring.
 */
function sameModel(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[._\-\/]/g, "");
  return norm(a) === norm(b);
}

/** Refuse outside the Orchestrator session. Returns a message, or null to proceed. */
async function orchestratorOnly(pi: ExtensionAPI): Promise<string | null> {
  const { name, source } = await resolveIdentity(pi);
  if (!name || !ORCHESTRATOR_NAME_RE.test(name.toLowerCase())) {
    const who = name ? `"${name}" (from ${source})` : `${source}`;
    return (
      `refused: the orch_* tools are Orchestrator-only, and this session identifies as ${who}. ` +
      "The Orchestrator is the sole control plane, so a worker must not dispatch or stop workers. " +
      "If this really is the Orchestrator, give it a name with /name orchestrator."
    );
  }
  return null;
}

async function agentInfo(pi: ExtensionAPI, target: string): Promise<HerdrAgent | undefined> {
  const result = await sh(pi, "herdr", ["agent", "get", target]);
  if (result.code !== 0) return undefined;
  return asJson(result.stdout)?.result?.agent;
}

/** Read the model pi actually chose, out of the live agent's session file. */
function modelFromSession(file: string | undefined): string | undefined {
  if (!file || !existsSync(file)) return undefined;
  try {
    const fd = openSync(file, "r");
    try {
      const buffer = Buffer.alloc(SESSION_SCAN_BYTES);
      const read = readSync(fd, buffer, 0, buffer.length, 0);
      const match = buffer.subarray(0, read).toString("utf8").match(/"model"\s*:\s*"([^"]+)"/);
      return match?.[1];
    } finally {
      closeSync(fd);
    }
  } catch {
    return undefined;
  }
}

/**
 * provider+model+thinking for a role, or a thrown error. No default, no fallback.
 *
 * 'thinking' is optional: when the routing file omits it the agent inherits pi's
 * per-provider default, which is not uniform (github-copilot starts at medium,
 * opencode-go at high). Pinning it in the file makes dispatch deterministic.
 */
async function routeFor(
  pi: ExtensionAPI,
  cwd: string,
  role: string,
): Promise<{ provider: string; model: string; thinking?: string }> {
  const routing = join(cwd, ROUTING_RELATIVE);
  const lookup = join(cwd, LOOKUP_RELATIVE);
  if (!existsSync(routing)) throw new Error(`routing file not found: ${routing}`);
  if (!existsSync(lookup)) throw new Error(`routing lookup not found: ${lookup}`);

  const result = await sh(pi, "python3", [lookup, routing, role]);
  if (result.code !== 0) {
    throw new Error((result.stderr || result.stdout).trim() || `no route for role '${role}'`);
  }
  const [provider, model, thinking] = result.stdout.trim().split(/\s+/);
  if (!provider || !model) {
    throw new Error(`routing lookup for '${role}' printed ${JSON.stringify(result.stdout)}`);
  }
  return { provider, model, thinking: thinking || undefined };
}

/** Read-only availability probe. Never prints or transmits a secret value. */
async function assertProviderReady(pi: ExtensionAPI, provider: string): Promise<void> {
  const result = await sh(pi, "pi", ["auth", "check", "--provider", provider]);
  const verdict = (result.stdout.trim().split("\n").pop() ?? "").trim();
  if (verdict !== "ready") {
    throw new Error(
      `provider '${provider}' is not ready (pi auth check said: '${verdict || result.stderr.trim()}'). ` +
        "No substitution is made -- fix the route or pick another assigned role.",
    );
  }
}

/** Index the generated relay scripts by the agent they watch, for the repo at `cwd`. */
function relayIndex(cwd: string): Record<string, { script: string; task?: string; report?: string; marker?: string; tskId?: string }> {
  const index: Record<string, { script: string; task?: string; report?: string; marker?: string; tskId?: string }> = {};
  const dir = relayDir(cwd);
  if (!existsSync(dir)) return index;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith("-watch.sh")) continue;
    const script = join(dir, name);
    let text: string;
    try {
      text = readFileSync(script, "utf8");
    } catch {
      continue;
    }
    // Values are written with shellQuote(); read back the simple single-quoted form
    // and skip anything that does not match rather than guessing. Accept "KEY='v'"
    // whether it owns its line or sits after a semicolon on a packed line.
    const field = (key: string) => new RegExp(`(?:^|[;\\s])${key}='([^']*)'`, "m").exec(text)?.[1];
    const agent = field("AGENT");
    if (!agent) continue;
    index[agent] = {
      script,
      task: field("TASK"),
      report: field("REPORT"),
      marker: field("MARKER"),
      tskId: field("TSK_ID"),
    };
  }
  return index;
}

async function relayAlive(pi: ExtensionAPI, script: string): Promise<boolean> {
  const result = await sh(pi, "pgrep", ["-f", script]);
  return result.code === 0 && result.stdout.trim().length > 0;
}

/**
 * Wait until a freshly started agent is willing to take input. `agent start`
 * reports readiness, but a prompt issued a moment later can still come back
 * `agent_not_ready` and be DROPPED SILENTLY -- observed live, where the worker sat
 * at its prompt having never received the brief.
 */
async function waitReady(pi: ExtensionAPI, name: string, timeoutMs = 30_000): Promise<boolean> {
  const result = await sh(pi, "herdr", [
    "agent",
    "wait",
    name,
    "--until",
    "idle",
    "--until",
    "done",
    "--timeout",
    String(timeoutMs),
  ]);
  return result.code === 0;
}

/**
 * Poll until a turn is visibly under way (working/blocked/done) or the deadline
 * passes, reading the model pi really chose back out of the live session.
 */
async function pollTurn(
  pi: ExtensionAPI,
  name: string,
  timeoutMs: number,
): Promise<{ state: string; model?: string }> {
  const deadline = Date.now() + timeoutMs;
  let state = "unknown";
  let model: string | undefined;
  while (Date.now() < deadline) {
    const info = await agentInfo(pi, name);
    if (info) {
      state = info.agent_status ?? "unknown";
      model = model ?? modelFromSession(info.agent_session?.value);
      if (model && (state === "working" || state === "blocked" || state === "done")) break;
    }
    await sleep(POLL_MS);
  }
  return { state, model };
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "orch_dispatch",
    label: "Dispatch worker",
    description:
      "Start a worker agent on the model its ROLE is assigned in .planning/orch/agents/orchestrator-routing.yaml, " +
      "pin that model explicitly, submit a brief file, arm a watch-only relay, and confirm the agent started a turn. " +
      "Orchestrator-only; refuses an unassigned role or an unready provider with no fallback.",
    promptSnippet: "Start a worker on its role's assigned model and arm a completion relay",
    promptGuidelines: [
      "Use orch_dispatch instead of hand-typing 'herdr agent start' so the worker always runs the model its role is assigned; never pass a model yourself.",
      "Give orch_dispatch a role, an agent name, a brief file path, and the report path plus settle marker the relay should watch.",
      "A relay only reports; use orch_status to read a worker's real state and model, and orch_stop to retire it.",
    ],
    parameters: Type.Object({
      role: StringEnum(ROLES),
      agent: Type.String({ description: "Unique agent name, [a-z][a-z0-9_-]{0,31}" }),
      briefPath: Type.String({ description: "Path to the brief file whose contents are submitted" }),
      reportPath: Type.String({ description: "Report the relay waits for" }),
      marker: Type.String({ description: "Marker string that must appear in that report" }),
      relayTask: Type.String({ description: "Relay TASK name, e.g. T9-B-R2-REVIEW" }),
      allowUnmatchedBrief: Type.Optional(
        Type.Boolean({
          description:
            "Escape hatch for the brief cross-check: dispatch even though the brief text does not literally contain reportPath or marker. Use only for a verified false refusal (e.g. a path written across lines) and record the reason.",
        }),
      ),
      tskId: Type.Optional(Type.String({ description: "Board task id for the RELAY_EVENT" })),
      pane: Type.Optional(Type.String({ description: "Existing shell pane; omit to create a tab" })),
      tabLabel: Type.Optional(Type.String({ description: "Tab label when creating a tab" })),
      tabCwd: Type.Optional(Type.String({ description: "Working directory for the new tab (default session cwd)" })),
      workspace: Type.Optional(Type.String({ description: "Workspace for the new tab (default: this orchestrator's own workspace; pass to place the worker elsewhere)" })),
      confirmMs: Type.Optional(Type.Number({ description: `Milliseconds to await turn+model confirmation (default ${DEFAULT_CONFIRM_MS})` })),
    }),

    async execute(_id, params, signal, _onUpdate, ctx: ExtensionContext) {
      if (signal?.aborted) throw new Error("cancelled before dispatch");
      const refusal = await orchestratorOnly(pi);
      if (refusal) throw new Error(refusal);

      const cwd = ctx.cwd;
      const route = await routeFor(pi, cwd, params.role);
      await assertProviderReady(pi, route.provider);

      const briefPath = absolute(cwd, params.briefPath);
      if (!existsSync(briefPath)) throw new Error(`brief not found: ${briefPath}`);
      const briefBytes = statSync(briefPath).size;
      if (briefBytes > MAX_BRIEF_BYTES) {
        throw new Error(
          `brief is ${briefBytes} bytes (limit ${MAX_BRIEF_BYTES}); prompt the agent with the path instead`,
        );
      }
      const brief = readFileSync(briefPath, "utf8");

      const reportPath = absolute(cwd, params.reportPath);

      // P1 single-sourcing: the report path and marker are authored once, in the
      // brief. Refuse before any herdr call when the brief does not literally name
      // them (study DELIVERY-STUDY-T160 §1.A: 11 lanes dispatched on a bare path no
      // brief ever stated). Both the as-given and the normalised path count, so a
      // brief may author the path relative to the repo.
      if (!params.allowUnmatchedBrief) {
        // The extension host loads this module once at session start: if the
        // session predates the P1P3 change, briefMismatch is undefined and a
        // bare call crashes every dispatch. Fail with the remedy, not a TypeError.
        if (typeof briefMismatch !== "function") {
          throw new Error(
            "refused: the loaded orch_dispatch predates the brief cross-check " +
              "(briefMismatch missing). Run /reload and dispatch again."
          );
        }
        const mismatches = briefMismatch(brief, params.reportPath, reportPath, params.marker);
        if (mismatches.length > 0) {
          const echoed = mismatches
            .map((what) =>
              what === "reportPath"
                ? `reportPath (given ${JSON.stringify(params.reportPath)}, normalised ${JSON.stringify(reportPath)})`
                : `marker ${JSON.stringify(params.marker)}`,
            )
            .join(" and ");
          throw new Error(
            `refused: the brief ${briefPath} does not literally contain ${echoed}. ` +
              "Fix the brief or the argument; override only with allowUnmatchedBrief=true and a recorded reason.",
          );
        }
      }
      // A live watcher on this relayTask would be silently overwritten, mixing two
      // lanes into one relay log (observed: CAMPAIGN-S1-FIX-C1-REVPLAN). Refuse.
      const liveWatch = join(relayDir(cwd), `${params.relayTask}-watch.sh`);
      if (existsSync(liveWatch) && (await relayAlive(pi, liveWatch))) {
        throw new Error(
          `refused: relayTask ${params.relayTask} still has a live watcher at ${liveWatch}. ` +
            "Pick a unique relayTask per dispatch (or stop the old watcher first).",
        );
      }

      let pane = params.pane?.trim() ?? "";
      let tab: string | undefined;
      if (!pane) {
        if (!params.tabLabel) {
          throw new Error("give either pane (an existing shell pane) or tabLabel (to create a tab)");
        }
        const args = [
          "tab",
          "create",
          "--cwd",
          params.tabCwd ? absolute(cwd, params.tabCwd) : cwd,
          "--label",
          params.tabLabel,
        ];
        // The tab must land in THIS orchestrator's workspace, not in whichever workspace
        // happens to have focus. herdr's own default ("current") follows focus, so a
        // dispatch issued while another lane is focused would put this lane's worker into
        // that lane's workspace. Observed 2026-10-13: t189-fixtures was created in trino's
        // workspace (wA, pane wA:pR6) because focus had moved there mid-dispatch. The defect
        // is symmetric -- any orchestrator could leak a worker into any other lane -- so the
        // default is derived from the orchestrator's own environment instead. An explicit
        // `workspace` param still wins, and an unset HERDR_WORKSPACE_ID falls back to
        // herdr's own default rather than guessing.
        const workspace = params.workspace?.trim() || process.env.HERDR_WORKSPACE_ID?.trim();
        if (workspace) args.push("--workspace", workspace);
        const parsed = asJson(await shOk(pi, "herdr", args));
        pane = parsed?.result?.root_pane?.pane_id ?? "";
        tab = parsed?.result?.tab?.tab_id ?? parsed?.result?.tab;
        if (!pane) throw new Error("could not read the new tab's root pane id from herdr");
      }

      const existing = await agentInfo(pi, params.agent);
      if (existing) {
        throw new Error(
          `an agent named '${params.agent}' already exists (state ${existing.agent_status ?? "?"}); ` +
            "refusing to replace it. Stop it first, or pick another name.",
        );
      }

      const startArgs = [
        "agent",
        "start",
        params.agent,
        "--kind",
        "pi",
        "--pane",
        pane,
        "--",
        "--model",
        `${route.provider}/${route.model}`,
      ];
      // Pin the level when the routing file names one; otherwise the agent inherits
      // pi's per-provider default, which differs between providers.
      if (route.thinking) startArgs.push("--thinking", route.thinking);

      await shOk(pi, "herdr", startArgs);

      // Arm the relay before submitting: the stamp must predate the report, or the
      // freshness gate would never let the relay settle.
      const relayRoot = relayDir(cwd);
      mkdirSync(relayRoot, { recursive: true });
      const stamp = join(relayRoot, `${params.relayTask}.armed`);
      const log = join(relayRoot, `${params.relayTask}-relay.log`);
      const scriptPath = join(relayRoot, `${params.relayTask}-watch.sh`);
      writeFileSync(stamp, "", "utf8");
      writeFileSync(
        scriptPath,
        relayScript({
          agent: params.agent,
          task: params.relayTask,
          report: reportPath,
          marker: params.marker,
          tskId: params.tskId ?? "",
          relayLib: join(cwd, RELAY_LIB_RELATIVE),
          stamp,
          log,
        }),
        "utf8",
      );
      chmodSync(scriptPath, 0o755);

      const ready = await waitReady(pi, params.agent);
      // A freshly started pi agent reports idle while it is still attaching, and a
      // prompt submitted in that window is silently dropped (observed on every
      // dispatch of the 2026-10-01 wave). Let it settle before the first prompt.
      await sleep(3_000);
      const confirmMs = params.confirmMs ?? DEFAULT_CONFIRM_MS;
      let submitted = await sh(pi, "herdr", ["agent", "prompt", params.agent, brief]);
      let promptNote = submitted.code === 0 ? "" : (submitted.stderr || submitted.stdout).trim();

      const child = spawn(scriptPath, [], { detached: true, stdio: "ignore" });
      child.unref();

      // Confirm, rather than assume: did a turn actually start, and which model did
      // pi really pick? Read the model back out of the live session.
      let { state, model } = await pollTurn(pi, params.agent, confirmMs);

      // Two distinct ways a brief is lost, and both were observed live:
      //  1. the prompt command is refused while the agent is still settling;
      //  2. the command SUCCEEDS but no turn ever starts -- the agent sits at an
      //     empty prompt (this silently produced an idle worker that looked
      //     dispatched).
      // Retry once for either shape. Never retry on a bare timeout, because that
      // does not prove the first attempt was lost.
      const refusalText = `${submitted.stderr} ${submitted.stdout}`.toLowerCase();
      const refused =
        submitted.code !== 0 && /not.?ready|stalled|timeout/.test(refusalText);
      const neverStarted = submitted.code === 0 && state === "idle";
      let retried = false;
      if (refused || neverStarted) {
        retried = true;
        await waitReady(pi, params.agent);
        await sleep(2_000);
        submitted = await sh(pi, "herdr", ["agent", "prompt", params.agent, brief]);
        promptNote = submitted.code === 0 ? "" : (submitted.stderr || submitted.stdout).trim();
        ({ state, model } = await pollTurn(pi, params.agent, confirmMs));
      }

      // Compare normalized ids. pi records some ids with punctuation swapped
      // (github-copilot/claude-sonnet-5.5 is written to the session as
      // "claude-sonnet-5-5"), which produced a FALSE MISMATCH warning on the first
      // dispatch under the new routing. A false alarm is as harmful as a missed one:
      // it teaches distrust of valid work. Normalize both sides before comparing.
      const modelOk =
        model === undefined ? "unconfirmed" : sameModel(model, route.model) ? "ok" : "MISMATCH";
      const triggered = state === "working" || state === "blocked" || state === "done";

      const lines = [
        `dispatched ${params.agent}  role=${params.role}`,
        `  assigned model : ${route.provider}/${route.model}  thinking=${route.thinking ?? "inherited"}`,
        `  session model  : ${model ?? "(not recorded yet)"}  -> ${modelOk}`,
        `  pane           : ${pane}${tab ? `   tab=${tab}` : ""}`,
        `  brief          : ${briefPath} (${briefBytes} bytes)`,
        `  prompt         : ${promptNote ? `rejected: ${promptNote}` : "submitted"}${retried ? " (after one retry)" : ""}`,
        `  ready before   : ${ready ? "yes" : "no (timed out waiting for idle)"}`,
        `  state after    : ${state}`,
        `  relay          : ${scriptPath}`,
        `  report gate    : ${reportPath} must contain ${JSON.stringify(params.marker)} and be newer than ${stamp}`,
      ];
      if (modelOk === "MISMATCH") {
        lines.push(
          "  WARNING: the live session is NOT on the assigned model. Fix this before trusting any output.",
        );
      }
      if (!triggered) {
        lines.push("  WARNING: no working/blocked/done state was observed; the brief may not have started a turn.");
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: {
          agent: params.agent,
          role: params.role,
          provider: route.provider,
          assignedModel: route.model,
          assignedThinking: route.thinking ?? null,
          sessionModel: model ?? null,
          modelConfirmed: modelOk === "ok",
          pane,
          tab: tab ?? null,
          briefPath,
          reportPath,
          marker: params.marker,
          relayScript: scriptPath,
          relayTask: params.relayTask,
          promptAccepted: submitted.code === 0,
          promptRetried: retried,
          readyBeforePrompt: ready,
          promptNote,
          state,
          turnStarted: triggered,
        },
      };
    },
  });

  pi.registerTool({
    name: "orch_status",
    label: "Worker status",
    description:
      "Read the live state, the model each worker is actually running, and its relay/report/marker status in one call. " +
      "Nothing here is cached: state and model are read from Herdr and from each agent's own pi session file.",
    promptSnippet: "Read workers' live state, model, and report/relay status",
    promptGuidelines: [
      "Use orch_status instead of several 'herdr agent get' calls when checking on dispatched workers.",
      "Trust orch_status state idle/done as completion; a relay event is only a trigger to go and look.",
    ],
    parameters: Type.Object({
      agents: Type.Array(Type.String(), { description: "Agent names to inspect" }),
    }),

    async execute(_id, params, _signal, _onUpdate, ctx: ExtensionContext) {
      // Guarded like the others. It is read-only, but leaving ONE of the three
      // control-plane tools unguarded created a trap: an authorization test written
      // against the unguarded one reports PASS while proving nothing. Uniform is
      // the only shape that cannot mislead.
      const refusal = await orchestratorOnly(pi);
      if (refusal) throw new Error(refusal);

      const relays = relayIndex(ctx.cwd);
      const details: any[] = [];
      const lines: string[] = [];

      for (const name of params.agents) {
        const info = await agentInfo(pi, name);
        const relay = relays[name];
        const model = modelFromSession(info?.agent_session?.value);
        const row: any = {
          agent: name,
          exists: Boolean(info),
          state: info?.agent_status ?? "gone",
          pane: info?.pane_id ?? null,
          cwd: info?.cwd ?? null,
          model: model ?? null,
          relay: relay ? { script: relay.script, task: relay.task, alive: await relayAlive(pi, relay.script) } : null,
        };

        if (relay?.report) {
          const stamp = relay.task ? join(relayDir(ctx.cwd), `${relay.task}.armed`) : undefined;
          const present = existsSync(relay.report);
          const markerSeen = present && relay.marker
            ? readFileSync(relay.report, "utf8").includes(relay.marker)
            : false;
          const fresh = present && stamp && existsSync(stamp)
            ? statSync(relay.report).mtimeMs > statSync(stamp).mtimeMs
            : false;
          row.report = {
            path: relay.report,
            present,
            markerSeen,
            newerThanStamp: fresh,
            mtime: present ? new Date(statSync(relay.report).mtime).toISOString() : null,
          };
        }

        details.push(row);
        lines.push(
          `${name}: state=${row.state} model=${row.model ?? "?"} report=${
            row.report ? `${row.report.present ? "yes" : "no"}/marker=${row.report.markerSeen ? "yes" : "no"}/fresh=${
              row.report.newerThanStamp ? "yes" : "no"
            }` : "no relay"
          } relay=${row.relay ? (row.relay.alive ? "watching" : "not running") : "-"}`,
        );
      }

      return { content: [{ type: "text", text: lines.join("\n") }], details: { agents: details } };
    },
  });

  pi.registerTool({
    name: "orch_stop",
    label: "Stop worker",
    description:
      "Retire workers: send /quit through the pane, wait until the agent is actually GONE, then close the pane. " +
      "Verifies disappearance instead of assuming the quit worked.",
    promptSnippet: "Quit workers, verify they are gone, and close their panes",
    promptGuidelines: [
      "Use orch_stop to retire a finished worker: it sends /quit, waits for the agent to disappear, and only then closes the pane.",
      "Set orch_stop closePane=false when the pane should be kept.",
    ],
    parameters: Type.Object({
      agents: Type.Array(Type.String(), { description: "Agent names to retire" }),
      closePane: Type.Optional(Type.Boolean({ description: "Close the pane after the agent is gone (default true)" })),
      timeoutMs: Type.Optional(Type.Number({ description: `Milliseconds to wait for each agent to disappear (default ${DEFAULT_STOP_MS})` })),
    }),

    async execute(_id, params) {
      const refusal = await orchestratorOnly(pi);
      if (refusal) throw new Error(refusal);

      const closePane = params.closePane !== false;
      const timeout = params.timeoutMs ?? DEFAULT_STOP_MS;
      const lines: string[] = [];
      const details: any[] = [];

      for (const name of params.agents) {
        const before = await agentInfo(pi, name);
        const pane = before?.pane_id;
        const row: any = { agent: name, found: Boolean(before), pane: pane ?? null };

        if (!before) {
          row.outcome = "already gone";
          lines.push(`${name}: already gone`);
          details.push(row);
          continue;
        }

        if (pane) await sh(pi, "herdr", ["pane", "run", pane, "/quit"]);

        const deadline = Date.now() + timeout;
        let gone = false;
        while (Date.now() < deadline) {
          if (!(await agentInfo(pi, name))) {
            gone = true;
            break;
          }
          await sleep(POLL_MS);
        }
        row.outcome = gone ? "gone" : "STILL PRESENT after timeout";

        if (gone && closePane && pane) {
          const closed = await sh(pi, "herdr", ["pane", "close", pane]);
          row.paneClosed = closed.code === 0;
          if (closed.code !== 0) {
            row.paneCloseError = (closed.stderr || closed.stdout).trim();
          }
        }

        lines.push(
          `${name}: ${row.outcome}${row.paneClosed === true ? ", pane closed" : row.paneClosed === false ? ", PANE CLOSE FAILED" : ""}`,
        );
        details.push(row);
      }

      return { content: [{ type: "text", text: lines.join("\n") }], details: { agents: details } };
    },
  });
}
