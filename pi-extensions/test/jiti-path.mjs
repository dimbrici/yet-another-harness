import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Path to pi's own jiti loader, which is how pi loads TypeScript extension entries.
 *
 * Resolution order:
 *   1. `JITI_STATIC`, for CI or a machine where pi lives somewhere unusual;
 *   2. the standard pi install under the user's home.
 *
 * The caller imports the returned path and treats a failure as an unverified load, so a
 * machine without pi reports `UNVERIFIED` rather than failing the test file at import
 * time.
 */
export function jitiStaticPath() {
  if (process.env.JITI_STATIC) return process.env.JITI_STATIC;
  return join(
    homedir(),
    ".local",
    "lib",
    "node_modules",
    "@earendil-works",
    "pi-coding-agent",
    "node_modules",
    "jiti",
    "lib",
    "jiti-static.mjs",
  );
}
