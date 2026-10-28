/**
 * Make a provider error visible to herdr as `blocked`.
 *
 * pi's `idle` cannot tell a finished step from a failed request, so the
 * Orchestrator cannot tell "idle by choice" from "stopped by a connection error".
 * This hook reads the settled run's last assistant message and pushes a `blocked`
 * state over the pi event bus that herdr's own status extension already listens
 * for. It kills nothing and retries nothing.
 *
 * Only registration is here; the sequence and the label live in ./lib/provider-error.mjs.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
  createState,
  onAgentEnd,
  onAgentSettled,
  onAgentStart,
  onShutdown,
} from "./lib/provider-error.mjs";

export default function (pi: ExtensionAPI) {
  const state = createState();
  const emit = (data: { active: boolean; label?: string }) => pi.events.emit("herdr:blocked", data);

  pi.on("agent_end", async (event: any) => {
    onAgentEnd(state, event?.messages);
  });

  pi.on("agent_settled", async () => {
    const out = onAgentSettled(state);
    if (out) emit(out);
  });

  pi.on("agent_start", async () => {
    const out = onAgentStart(state);
    if (out) emit(out);
  });

  pi.on("session_shutdown", async () => {
    const out = onShutdown(state);
    if (out) emit(out);
  });
}
