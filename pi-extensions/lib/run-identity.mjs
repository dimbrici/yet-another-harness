// Agent identity for detached helpers: the relay must knock the agent that is
// really running, not a name that may have been retired and reused.
//
// whoami = match this process's HERDR_PANE_ID against `herdr agent list`, which
// carries name, agent_status and agent_session for every live agent.

import { spawnSync } from "node:child_process";

/** The herdr binary to call: test override, then herdr's own path, then PATH. */
export function herdrBin(env = process.env) {
  return env.RUN_RELAY_HERDR_BIN || env.HERDR_BIN_PATH || "herdr";
}

/**
 * Read the herdr registry.
 *
 * `ok: false` means the call itself failed (socket error, non-zero exit, bad
 * JSON, empty output). Callers must NOT treat that as "the agent is gone": a
 * transient failure would otherwise fire a death event at a healthy worker.
 */
export function listAgents(bin = herdrBin(), env = process.env) {
  let result;
  try {
    result = spawnSync(bin, ["agent", "list"], { encoding: "utf8", timeout: 15_000, env });
  } catch {
    return { ok: false, agents: [] };
  }
  if (!result || result.status !== 0 || !result.stdout) return { ok: false, agents: [] };
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return { ok: false, agents: [] };
  }
  const agents = parsed?.result?.agents;
  return Array.isArray(agents) ? { ok: true, agents } : { ok: false, agents: [] };
}

function sessionOf(entry) {
  const value = entry?.agent_session?.value;
  return typeof value === "string" ? value : "";
}

/** True when the registry entry is the agent we bound to. */
export function ownerMatch(agents, owner) {
  if (!Array.isArray(agents) || !owner?.pane_id) return false;
  return agents.some(
    (entry) =>
      entry?.pane_id === owner.pane_id &&
      entry?.name === owner.name &&
      (!owner.session_file || !sessionOf(entry) || sessionOf(entry) === owner.session_file),
  );
}

/**
 * Resolve the calling session to its herdr agent.
 * Returns { name, pane_id, session_file } or null when it cannot be resolved.
 */
export function whoami(env = process.env, bin = herdrBin(env)) {
  const pane = env.HERDR_PANE_ID;
  if (!pane) return null;
  const { ok, agents } = listAgents(bin, env);
  if (!ok) return null;
  const mine = agents.find((entry) => entry?.pane_id === pane);
  if (!mine || typeof mine.name !== "string" || !mine.name) return null;
  return { name: mine.name, pane_id: pane, session_file: env.PI_SESSION_FILE || sessionOf(mine) };
}
