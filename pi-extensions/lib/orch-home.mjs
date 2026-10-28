// Where an orchestration lane keeps its NON-REPO state: relay scripts, the relay
// inbox, and run-command run folders.
//
// WHY THIS FILE EXISTS
// --------------------
// This state used to live at three hardcoded paths under /tmp/trino-scenario-decisions,
// one per consumer:
//
//   orch-dispatch.ts:65      RELAY_DIR   = /tmp/trino-scenario-decisions/relay
//   lib/orch-events.mjs:23   inbox root  = /tmp/trino-scenario-decisions/relay-inbox
//   lib/run-store.mjs:63     runs dir    = /tmp/trino-scenario-decisions/runs/run-command
//
// Those literals came from the project where the machinery was first built. Any
// OTHER repo that ran an orchestrator inherited them, so two projects sharing a
// /tmp namespace wrote relays, inbox files and run folders into the same
// directories. The visible symptom was a relay in the `masking` workspace firing
// its settle event at the `trino` control plane.
//
// THE CONVENTION
// --------------
// State is scoped to the REPO the orchestrator is running in, keyed by the repo
// directory name, and every consumer derives its path from this one resolver so
// they can never disagree:
//
//   /tmp/orch/<repo>/relay/            relay scripts + their .armed stamps and logs
//   /tmp/orch/<repo>/relay-inbox/      pending/ and processed/ event files
//   /tmp/orch/<repo>/runs/run-command/ run folders
//
// REPO NAME RESOLUTION, highest priority first:
//   1. ORCH_HOME                  explicit root; everything hangs off it.
//   2. <repo>/.planning/orch/orch-home   one-line pin file, so a repo can name its
//                                 own root without any environment plumbing. This
//                                 is how a project that already has live state at
//                                 a legacy path keeps that path.
//   3. /tmp/orch/<basename(cwd)>  the generic default.
//
// Per-consumer overrides still win over the shared root, so a single lane can be
// redirected without moving the others:
//
//   ORCH_RELAY_DIR          relay scripts          (orch-dispatch.ts)
//   ORCH_EVENTS_DIR         relay inbox            (lib/orch-events.mjs)
//   RUN_COMMAND_RUNS_DIR    run folders            (lib/run-store.mjs)
//
// HOW TO USE IT
// -------------
//   import { relayDir, inboxDir, runsDir } from "./lib/orch-home.mjs";
//
//   relayDir()                  // -> /tmp/orch/masking/relay
//   relayDir("/srv/repo")       // -> /tmp/orch/repo/relay
//   inboxDir("/srv/repo", env)  // honours ORCH_EVENTS_DIR, then ORCH_HOME, then the pin
//
// All three take (cwd, env) and default to `process.cwd()` / `process.env`, so a
// caller with no context still gets the right answer. Paths are resolved LAZILY,
// at call time, never captured at module load: a long-lived extension host imports
// this once, but the directory it wants depends on the session's cwd.
//
// MIGRATING A PROJECT WITH EXISTING STATE
// ---------------------------------------
// To keep a project on its current directory, either export ORCH_HOME in its
// session environment, or drop a pin file:
//
//   printf '%s\n' /tmp/trino-scenario-decisions > .planning/orch/orch-home
//
// Without one of those the project moves to /tmp/orch/<repo> on the next session.
// Nothing is deleted either way: relays are self-contained scripts that carry their
// own absolute paths, so already-armed relays keep writing where they were armed.

import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

/** Root under which every repo's lane state lives when nothing overrides it. */
export const ORCH_HOME_BASE = "/tmp/orch";

/** Repo-local pin file: one line naming this repo's state root. */
export const ORCH_HOME_PIN = ".planning/orch/orch-home";

/** A dir name that is safe as one path segment and never empty. */
function slug(name) {
  return String(name || "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "default";
}

/**
 * The state root for the repo at `cwd`.
 * ORCH_HOME wins, then the repo's pin file, then /tmp/orch/<repo-name>.
 * Returns a path only; nothing is created here.
 */
export function orchHome(cwd = process.cwd(), env = process.env) {
  if (env?.ORCH_HOME) return env.ORCH_HOME;

  const root = resolve(cwd || process.cwd());
  try {
    const pin = join(root, ORCH_HOME_PIN);
    if (existsSync(pin)) {
      const line = readFileSync(pin, "utf8").split("\n").find((l) => l.trim());
      if (line) {
        const value = line.trim();
        // A relative pin is read from the repo root, not the process cwd.
        return value.startsWith("/") ? value : join(root, value);
      }
    }
  } catch {
    // An unreadable pin is not worth failing a dispatch over: fall through.
  }
  return join(ORCH_HOME_BASE, slug(basename(root)));
}

/** Relay scripts, their `.armed` stamps, and their `-relay.log` files. */
export function relayDir(cwd = process.cwd(), env = process.env) {
  return env?.ORCH_RELAY_DIR || join(orchHome(cwd, env), "relay");
}

/** Relay inbox root. The `pending/` and `processed/` subdirs are the inbox's own. */
export function inboxDir(cwd = process.cwd(), env = process.env) {
  return env?.ORCH_EVENTS_DIR || join(orchHome(cwd, env), "relay-inbox");
}

/** Where run-command run folders live. */
export function runsDir(cwd = process.cwd(), env = process.env) {
  return env?.RUN_COMMAND_RUNS_DIR || join(orchHome(cwd, env), "runs", "run-command");
}
