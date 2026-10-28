/**
 * The relay inbox: turns event files the relays and the watchdog wrote into messages
 * this Orchestrator session actually sees.
 *
 * The older delivery was `herdr agent prompt orchestrator "RELAY_EVENT: ..."`, which
 * lands in the composer and is gone if nothing reads it: an Orchestrator that was
 * restarting, or was mid-turn and lost the prompt, never sees the event again. Here
 * the sender writes a JSON file and this extension delivers it, so the event outlives
 * the Orchestrator's own lifetime and is claimed exactly once.
 *
 * Durable on disk, at-most-once live, evidence always retained. The claim is an atomic
 * rename into `processed/` that happens BEFORE the delivery, so two orchestrator-named
 * sessions cannot deliver the same event and a restart cannot redeliver one already
 * claimed. The accepted residual is a crash in the window between the rename and the
 * send: that event is then `processed/` evidence and was never delivered live.
 *
 * Active only in the Orchestrator's session. A worker's session does nothing here --
 * workers are watched, they do not watch -- and the watchdog entry is inert for the
 * same session for the mirror-image reason.
 *
 * The directory convention, the claiming and the watching live in ./lib/orch-events.mjs.
 * This file only decides whether THIS session may run, and what a delivery calls.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// The canonical path resolver is imported DIRECTLY from ./lib/orch-home.mjs rather than
// being reached through inboxRoot() in ./lib/orch-events.mjs. pi's hot reload re-imports
// an extension's ENTRY files but REUSES cached instances of their sibling modules, so a
// sibling edited mid-session keeps serving its pre-edit code even though the file on disk
// is correct. An inbox path resolved through it silently stays on the old directory: on
// 2026-10-13 this session went on claiming trino's relay events after the plumbing had
// been made repo-generic, because orch-events.mjs was cached from before the edit while
// this entry file reloaded. orch-home.mjs is the one resolver every consumer already
// shares, so calling it here keeps the paths consistent AND survives a reload.
import { inboxDir as resolveInboxDir } from "./lib/orch-home.mjs";

import {
  drainInbox,
  isOrchestratorName,
  renderFlatLine,
  resolveGateName,
  startInboxWatch,
} from "./lib/orch-events.mjs";

export default function (pi: ExtensionAPI) {
  let inbox: { stop: () => void; drainNow: () => Promise<unknown> } | null = null;

  pi.on("session_start", async () => {
    const name = await resolveGateName(pi);
    // Unresolved or a worker: stay inert. An event that is not delivered here is still
    // durable in `pending/`, so being wrong costs a delay, never an event -- but a
    // second session claiming events is a delivery we cannot see, so we do not guess.
    if (!isOrchestratorName(name)) return;

    // Resolved at call time, and deliberately NOT through the sibling module: see the
    // import comment above for why a reload can otherwise leave this on a stale path.
    const inboxDir = resolveInboxDir(process.cwd(), process.env);
    const log = (text: string) => pi.events.emit("relay:inbox-log", { text, ts: new Date().toISOString() });

    // Anything written while this session was down is delivered first, oldest first.
    drainInbox({ inboxDir, deliver: (event) => deliver(event), log });
    inbox = startInboxWatch({ inboxDir, deliver: (event) => deliver(event), log });
  });

  pi.on("session_shutdown", async () => {
    // Stop watching only. The inbox and its files are persistent state: a reload is
    // not a reason to throw away events nobody has read yet.
    if (inbox) {
      inbox.stop();
      inbox = null;
    }
  });

  /**
   * Wake the agent with one event. `triggerTurn` is the point of the whole extension:
   * an idle Orchestrator has to act on the event, not merely have it in its context.
   * `followUp` means a busy Orchestrator takes it after its current turn finishes
   * rather than being steered out of work in progress.
   */
  function deliver(event: any) {
    pi.sendMessage(
      {
        customType: "relay-event",
        content: renderFlatLine(event),
        display: true,
        details: { event },
      },
      { triggerTurn: true, deliverAs: "followUp" },
    );
    pi.events.emit("relay:event", event);
  }
}
