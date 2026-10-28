// Where the global suites find the one input they cannot own: the shared bash
// relay library, which lives in a repo's .planning/orch/, not in the extension tree.
//
// Production resolves the same path from the session's repo root
// (orch-dispatch.ts: join(cwd, ".planning/orch/relay-lib.sh")). A suite has no
// session cwd, so it takes an explicit ORCH_RELAY_LIB, and otherwise probes the
// repos that carry an orchestration lane. A test that cannot find the library
// fails loudly: a skipped pin is a pin nobody is holding.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const RELAY_LIB_RELATIVE = join(".planning", "orch", "relay-lib.sh");

/** Same candidate list as the relay library's own default REPO_ROOT: CSI repos first. */
const CANDIDATE_ROOTS = [
  join(homedir(), "Documents", "Projects", "CSI", "trino"),
  join(homedir(), "Documents", "Projects", "CSI", "masking"),
  process.cwd(),
  join(process.cwd(), ".."),
];

/**
 * Absolute path to a relay-lib.sh, or null when no candidate has one.
 * Callers assert instead of skipping.
 */
export function findRelayLib(env = process.env) {
  const explicit = env.ORCH_RELAY_LIB;
  if (explicit) {
    const path = resolve(explicit);
    return existsSync(path) ? path : null;
  }
  for (const root of CANDIDATE_ROOTS) {
    const path = join(root, RELAY_LIB_RELATIVE);
    if (existsSync(path)) return path;
  }
  return null;
}

/** Text for an assertion message, so a failure says what to set. */
export const RELAY_LIB_HINT =
  "set ORCH_RELAY_LIB to a repo's .planning/orch/relay-lib.sh";
