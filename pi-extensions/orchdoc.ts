import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Injects the orchestrator rulebook into the system prompt on every turn,
// but ONLY for the Orchestrator session. Every other session (workers,
// reviewers, researchers, discussion participants, ...) gets nothing.
//
// The file is read fresh from disk every turn, so editing
// .planning/orch/agents/ORCHESTRATOR_AGENT.md takes effect on the Orchestrator's very next
// prompt — no /reload and no restart needed. /reload is only required when
// this extension file itself changes.
//
// NAME RESOLUTION — why this is not just pi.getSessionName():
// getSessionName() reads a `session_info` entry, and a session that was never
// given a name with /name has none. The live Orchestrator session has ZERO
// session_info entries, so a name-only check silently skipped injection on every
// single turn — the rulebook LOOKED like it was working while never being
// delivered. Fall back to herdr's own registry for this pane (HERDR_PANE_ID),
// which is the same naming dispatch uses. Fail loudly rather than defaulting open
// or closed by accident.

const DOC_RELATIVE_PATH = ".planning/orch/agents/ORCHESTRATOR_AGENT.md";
/** Anchored: a substring test would also match a worker named "orch-something". */
const ORCHESTRATOR_NAME_RE = /^orchestrator(-[a-z0-9]+)*$/;
const SENTINEL =
  "\n\n# Orchestrator rulebook (.planning/orch/agents/ORCHESTRATOR_AGENT.md, re-read this turn)\n";

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
    try {
      const result: any = await pi.exec("herdr", ["agent", "list"]);
      if (Number(result?.code ?? 1) === 0) {
        const agents = JSON.parse(String(result?.stdout ?? ""))?.result?.agents;
        if (Array.isArray(agents)) {
          const mine = agents.find((entry: any) => entry?.pane_id === pane);
          const herdrName = typeof mine?.name === "string" ? mine.name.trim() : "";
          if (herdrName) return { name: herdrName, source: `herdr agent in pane ${pane}` };
        }
      }
    } catch {
      // fall through to unresolved
    }
  }
  return { name: undefined, source: "unresolved" };
}

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    const { name } = await resolveIdentity(pi);
    if (!name || !ORCHESTRATOR_NAME_RE.test(name.toLowerCase())) {
      return undefined; // not the orchestrator: inject nothing
    }

    const path = join(ctx.cwd, DOC_RELATIVE_PATH);
    try {
      const doc = readFileSync(path, "utf8").trim();
      if (!doc) return undefined;
      return {
        systemPrompt: `${event.systemPrompt}${SENTINEL}${doc}`,
      };
    } catch {
      // Doc missing/unreadable: say so rather than silently running unruled.
      return {
        systemPrompt: `${event.systemPrompt}${SENTINEL}[orchdoc] WARNING: could not read ${path}`,
      };
    }
  });
}
