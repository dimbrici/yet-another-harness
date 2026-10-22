#!/usr/bin/env bash
# Shared helpers for watch-only Orchestrator relays.
#
# A relay does ONE thing: watch a delegated agent and, when it has settled AND its
# report carries the expected marker, wake the Orchestrator. It never edits the
# board, never judges an outcome, and never re-submits the task brief.
#
# THE ORCHESTRATOR OWNS THE BOARD. The relay's event NAMES the board task (TSK_ID)
# and carries ORCHESTRATOR_ACTION=update-tsk-board; the Orchestrator reads the
# report, judges the outcome, and applies the status change itself. This mirrors
# the ledger rule: agents never write the Orchestrator's records.
#
# THIS FILE IS REPO-AGNOSTIC. It is the same file in every repo that runs an
# orchestrator: everything it needs is derived at source time from where the file
# sits and from the live Herdr registry. Nothing here names a project.
#
# ---------------------------------------------------------------------------
# HOW TO USE
# ---------------------------------------------------------------------------
# Sourced by a generated relay (orch_dispatch writes that script), so normally you
# never call this directly. When writing one by hand:
#
#   RELAY_LOG=/tmp/orch/<repo>/relay/T123-relay.log   # optional; status trail
#   TSK_ID=T15                                       # optional; board task
#   source <repo>/.planning/orch/relay-lib.sh
#   relay_settle T123-EXAMPLE my_impl /path/to/report.md
#
# Recognised environment:
#
#   ORCH_TARGET      pin the control-plane agent to wake (default: discovered)
#   ORCH_HOME        this repo's state root (default: /tmp/orch/<repo>)
#   ORCH_RELAY_DIR   relay scripts  (default: $ORCH_HOME/relay)
#   ORCH_EVENTS_DIR  relay inbox    (default: $ORCH_HOME/relay-inbox)
#   REPO_ROOT        override the derived repo root
#
# WHY THE TARGET IS DISCOVERED AND NEVER HARDCODED
# ------------------------------------------------
# There is one orchestrator per workspace, named `orchestrator` or
# `orchestrator-<space>` (orchestrator-masking, orchestrator-tskctl, ...). A relay
# that hardcoded the bare name `orchestrator` delivered every repo's settle events
# to whichever project first claimed that name: a masking worker finished and woke
# the trino control plane. So the name is RESOLVED at fire time, from the live
# registry, by matching the orchestrator-name pattern against the orchestrator whose
# cwd is THIS repo. Ambiguity fails closed: an event is never sent to a guess.
#
# Never edit a RUNNING relay in place -- bash reads scripts incrementally. Replace
# it with a fresh watcher instead.

# --- repo identity -----------------------------------------------------------
# The repo is the one this file lives in: <repo>/.planning/orch/relay-lib.sh.
# Deriving it (rather than hardcoding a path) is what makes this file portable.
# Resolved AFTER following symlinks where possible, so a symlinked .planning still
# points at the real repo.
_relay_lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# <repo>/.planning/orch -> ../.. is the repo root.  (Three levels up would be the
# repo's PARENT: the off-by-one silently scoped every path to the wrong directory.)
REPO_ROOT="${REPO_ROOT:-$(cd "$_relay_lib_dir/../.." && pwd)}"
export REPO_ROOT

# --- lane state --------------------------------------------------------------
# Per-repo, so two projects never share a directory. A repo may pin its own root
# with a one-line .planning/orch/orch-home file (that is how a project with
# existing state keeps its legacy path).
#
# /tmp/orch is literal and NOT ${TMPDIR}: on macOS TMPDIR points into
# /var/folders/..., while the Node side (extensions/lib/orch-home.mjs) builds its
# path from the literal /tmp/orch. If the two disagreed, a relay would file its
# inbox event where the Orchestrator's inbox watcher is not looking.
if [ -z "${ORCH_HOME:-}" ] && [ -f "$REPO_ROOT/.planning/orch/orch-home" ]; then
  ORCH_HOME="$(head -n 1 "$REPO_ROOT/.planning/orch/orch-home" | tr -d '[:space:]')"
fi
ORCH_HOME="${ORCH_HOME:-/tmp/orch/$(basename "$REPO_ROOT")}"
ORCH_RELAY_DIR="${ORCH_RELAY_DIR:-$ORCH_HOME/relay}"
ORCH_EVENTS_DIR="${ORCH_EVENTS_DIR:-$ORCH_HOME/relay-inbox}"
export ORCH_HOME ORCH_RELAY_DIR ORCH_EVENTS_DIR

# --- logging ---------------------------------------------------------------
relay_log() { echo "[$(date +%H:%M:%S)] $*" >> "${RELAY_LOG:-/dev/null}"; }

# --- agent state -----------------------------------------------------------
# working | idle | done | blocked | gone  (anything unreadable is treated as gone)
relay_state() {
  herdr agent get "$1" 2>/dev/null \
    | python3 -c "import sys,json;print(json.load(sys.stdin)['result']['agent'].get('agent_status','gone'))" 2>/dev/null \
    || echo gone
}

# Confirmed death only. Exit 0 when `herdr agent get` answers with the registry's
# own agent_not_found. Anything else -- socket error, bad JSON, empty output, a
# live agent -- exits 1, because an unreadable agent is UNKNOWN, not gone, and a
# false death event would let the Orchestrator retry a healthy worker's assignment.
# herdr writes a missing-agent answer to STDERR with an empty stdout, so the two
# streams are merged before parsing; without the merge the body never reached the
# parser, no read ever confirmed, and removed agents lingered as zombie watchers.
relay_is_gone() {  # $1=AGENT
  herdr agent get "$1" 2>&1 | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(1)
sys.exit(0 if data.get('error', {}).get('code') == 'agent_not_found' else 1)
" >/dev/null 2>&1
}

# Best effort: herdr is verified to return agent_status, NOT verified to return the
# blocked label. Say `unreported` rather than guessing, so the event is honest.
relay_blocked_label() {  # $1=AGENT
  herdr agent get "$1" 2>/dev/null | python3 -c "
import sys, json
try:
    agent = json.load(sys.stdin)['result']['agent']
except Exception:
    agent = {}
for key in ('message', 'label', 'status_message', 'blocked_label'):
    value = agent.get(key)
    if isinstance(value, str) and value.strip():
        print(value.strip().replace(chr(10), ' '))
        break
else:
    print('unreported')
" 2>/dev/null || echo unreported
}

# --- who to wake -------------------------------------------------------------
# Resolve the control plane for THIS repo. Prints the agent name and exits 0 on a
# unique match; prints nothing and exits non-zero otherwise, so the caller can
# refuse to fire rather than fire at the wrong project.
#
#   ORCH_TARGET   when the caller pins a target, honour it and ask no questions.
#   otherwise     the single live agent whose name matches
#                 ^orchestrator(-[a-z0-9]+)*$ AND whose cwd is this repo.
#
# The watched agent is deliberately NOT used to find the workspace: relays fire
# once the worker has settled, and a settled worker is often already gone from the
# registry. The repo root is stable for the whole life of the relay.
relay_target() {
  if [ -n "${ORCH_TARGET:-}" ]; then printf '%s' "$ORCH_TARGET"; return 0; fi
  herdr agent list 2>/dev/null | python3 -c '
import json, os, re, sys
want = os.path.realpath(os.environ.get("REPO_ROOT", "") or "/")
pattern = re.compile(r"^orchestrator(-[a-z0-9]+)*$")
try:
    agents = json.load(sys.stdin).get("result", {}).get("agents", []) or []
except Exception:
    sys.exit(1)
found = sorted(
    a["name"]
    for a in agents
    if pattern.match(a.get("name") or "")
    and os.path.realpath(a.get("cwd") or "") == want
)
if len(found) == 1:
    print(found[0])
    sys.exit(0)
if found:
    sys.stderr.write("relay: %d orchestrators running in %s: %s\n" % (len(found), want, ", ".join(found)))
else:
    sys.stderr.write("relay: no orchestrator running in %s\n" % want)
sys.exit(2)
' 2>/dev/null
}

# Deliver one message to the resolved control plane. Fails closed: an unresolvable
# target is logged and reported, never guessed at.
relay_wake() {  # $1=MESSAGE
  local target
  target="$(relay_target)"
  if [ -z "$target" ]; then
    relay_log "FATAL: no control plane for REPO_ROOT=$REPO_ROOT; event NOT delivered"
    return 1
  fi
  herdr agent prompt "$target" "$1" >/dev/null 2>&1 || {
    relay_log "FATAL: prompt to $target failed; event NOT delivered"
    return 1
  }
}

# --- the wake-up -----------------------------------------------------------
# One event, delivered to the control plane resolved above. TSK_ID tells the
# Orchestrator which board task to update; it makes no claim about WHAT the status
# should become, because that is a judgement the Orchestrator makes after reading
# the report.
relay_fire() {  # $1=TASK $2=AGENT $3=REPORT
  relay_wake \
"RELAY_EVENT: TASK=$1 AGENT=$2 STATUS=settled WAIT_GET=done ARTIFACT_OR_REPORT=$3 TSK_ID=${TSK_ID:-none} ORCHESTRATOR_ACTION=update-tsk-board RELAY_LOG=${RELAY_LOG:-}"
}

# One event of a chosen STATUS. ORCHESTRATOR_ACTION=inspect-agent: these events ask
# the Orchestrator to LOOK (orch_status, the run folder, the pane), never to retry
# or kill blindly.
relay_fire_status() {  # $1=TASK $2=AGENT $3=STATUS $4=WAIT_GET $5=REPORT [extra]
  local extra="${6:-}"
  [ -n "$extra" ] && extra=" $extra"
  relay_wake \
"RELAY_EVENT: TASK=$1 AGENT=$2 STATUS=$3 WAIT_GET=$4 ARTIFACT_OR_REPORT=$5 TSK_ID=${TSK_ID:-none} ORCHESTRATOR_ACTION=inspect-agent RELAY_LOG=${RELAY_LOG:-}${extra}"
}

relay_settle() {  # $1=TASK $2=AGENT $3=REPORT
  relay_fire "$1" "$2" "$3"
  relay_log "relay event sent (TSK_ID=${TSK_ID:-none})"
}

# --- relay inbox emitter -----------------------------------------------------
# File ONE event as JSON into the inbox, so the Orchestrator's relay-inbox
# extension delivers it durably. Returns non-zero on any failure -- an unwritable
# inbox, a bad name, no python3 -- and the caller then uses the text path above.
# An event is sent once: this either files it or it does not, and only the failure
# falls back.
#
# Same KEY names as relay_fire / relay_fire_status, and ORCHESTRATOR_ACTION derived
# from STATUS the same way: settled earns a board update, everything else asks only
# to be looked at. `extra` is free text, exactly as on the command line.
relay_emit_event() {  # $1=TASK $2=AGENT $3=STATUS $4=WAIT_GET $5=REPORT [extra]
  python3 - \
    "${ORCH_EVENTS_DIR:-/tmp/orch/$(basename "$REPO_ROOT")/relay-inbox}" \
    "$1" "$2" "$3" "$4" "$5" "${6:-}" "${TSK_ID:-none}" "${RELAY_LOG:-}" <<'PY'
import json, os, sys
from datetime import datetime, timezone

root, task, agent, status, wait_get, report, extra, tsk_id, relay_log = sys.argv[1:10]
try:
    now = datetime.now(timezone.utc)
    stamp = now.strftime("%Y%m%dT%H%M%SZ")
    iso = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    hex4 = os.urandom(2).hex()
    safe = lambda v: ("".join(c if c.isalnum() or c in "._-" else "-" for c in v).strip("-") or "none")
    event = {
        "id": f"{task}-{status}-{stamp}-{hex4}",
        "kind": "relay",
        "task": task,
        "agent": agent or "unknown",
        "status": status,
        "wait_get": wait_get or "unknown",
        "artifact_or_report": report or "none",
        "tsk_id": tsk_id or "none",
        "orchestrator_action": "update-tsk-board" if status == "settled" else "inspect-agent",
        "relay_log": relay_log,
        "ts": iso,
        "extra": extra,
    }
    pending = os.path.join(root, "pending")
    os.makedirs(pending, exist_ok=True)
    os.makedirs(os.path.join(root, "processed"), exist_ok=True)
    name = f"{stamp}-{hex4}-{safe(task)}-{safe(status)}.json"
    target = os.path.join(pending, name)
    tmp = f"{target}.tmp-{hex4}"
    with open(tmp, "w", encoding="utf8") as handle:
        json.dump(event, handle, indent=2)
        handle.write("\n")
    os.rename(tmp, target)
except Exception:
    sys.exit(1)
PY
}
