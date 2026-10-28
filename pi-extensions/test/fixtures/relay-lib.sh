#!/usr/bin/env bash
# Shared helpers for watch-only Orchestrator relays.
#
# A relay does ONE thing: watch a delegated agent and, when it has settled AND
# its report exists, wake the Orchestrator. It never edits the board, never
# judges an outcome, and never re-submits the task brief.
#
# THE ORCHESTRATOR OWNS THE BOARD. The relay's event NAMES the board task
# (TSK_ID) and carries ORCHESTRATOR_ACTION=update-tsk-board; the Orchestrator
# reads the report, judges the outcome, and applies the status change itself.
# This mirrors the ledger rule: agents never write the Orchestrator's records.
#
# Usage in a relay:
#   RELAY_LOG=/tmp/trino-scenario-decisions/relay/T123-relay.log
#   TSK_ID=T15                 # board task this assignment belongs to (optional)
#   source /Users/domenicoimbrici/Documents/Projects/CSI/trino/.planning/orch/relay-lib.sh
#
# Never edit a RUNNING relay in place -- bash reads scripts incrementally, so
# replace it with a fresh watcher instead.

REPO_ROOT="${REPO_ROOT:-/Users/domenicoimbrici/Documents/Projects/CSI/trino}"

# --- logging ---------------------------------------------------------------
relay_log() { echo "[$(date +%H:%M:%S)] $*" >> "${RELAY_LOG:-/dev/null}"; }

# --- agent state -----------------------------------------------------------
# working | idle | gone  (anything unreadable is treated as gone)
relay_state() {
  herdr agent get "$1" 2>/dev/null \
    | python3 -c "import sys,json;print(json.load(sys.stdin)['result']['agent'].get('agent_status','gone'))" 2>/dev/null \
    || echo gone
}

# --- the wake-up -----------------------------------------------------------
# One event, delivered to the registered `orchestrator` target. TSK_ID tells the
# Orchestrator which board task to update; it makes no claim about WHAT the
# status should become, because that is a judgement the Orchestrator makes after
# reading the report.
relay_fire() {  # $1=TASK $2=AGENT $3=REPORT
  herdr agent prompt orchestrator \
"RELAY_EVENT: TASK=$1 AGENT=$2 STATUS=settled WAIT_GET=done ARTIFACT_OR_REPORT=$3 TSK_ID=${TSK_ID:-none} ORCHESTRATOR_ACTION=update-tsk-board RELAY_LOG=${RELAY_LOG:-}" \
    >/dev/null 2>&1
}

relay_settle() {  # $1=TASK $2=AGENT $3=REPORT
  relay_fire "$1" "$2" "$3"
  relay_log "relay event sent (TSK_ID=${TSK_ID:-none})"
}

# --- agent-fact helpers (added by TIME-BOUNDS R1) -----------------------------
# A relay still does ONE thing: it reports facts about the agent it watches. These
# three carry no judgement and never act on anything.

# Confirmed death only. Exit 0 when `herdr agent get` answers with the registry's
# own agent_not_found. Anything else -- socket error, bad JSON, empty output, a
# live agent -- exits 1, because an unreadable agent is UNKNOWN, not gone, and a
# false death event would let the Orchestrator retry a healthy worker's assignment.
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

# One event of a chosen STATUS, to the same fixed `orchestrator` target relay_fire
# uses. ORCHESTRATOR_ACTION=inspect-agent: these events ask the Orchestrator to
# LOOK (orch_status, the run folder, the pane), never to retry or kill blindly.
relay_fire_status() {  # $1=TASK $2=AGENT $3=STATUS $4=WAIT_GET $5=REPORT [extra]
  local extra="${6:-}"
  [ -n "$extra" ] && extra=" $extra"
  herdr agent prompt orchestrator \
"RELAY_EVENT: TASK=$1 AGENT=$2 STATUS=$3 WAIT_GET=$4 ARTIFACT_OR_REPORT=$5 TSK_ID=${TSK_ID:-none} ORCHESTRATOR_ACTION=inspect-agent RELAY_LOG=${RELAY_LOG:-}${extra}" \
    >/dev/null 2>&1
}

# --- relay inbox emitter (added by TIME-BOUNDS R2) --------------------------------
# File ONE event as JSON into the inbox, so the Orchestrator's relay-inbox extension
# delivers it durably. Returns non-zero on any failure -- an unwritable inbox, a bad
# name, no python3 -- and the caller then uses the text path above. An event is sent
# once: this either files it or it does not, and only the failure falls back.
#
# Same KEY names as relay_fire / relay_fire_status, and ORCHESTRATOR_ACTION derived
# from STATUS the same way: settled earns a board update, everything else asks only
# to be looked at. `extra` is free text, exactly as on the command line.
relay_emit_event() {  # $1=TASK $2=AGENT $3=STATUS $4=WAIT_GET $5=REPORT [extra]
  python3 - \
    "${ORCH_EVENTS_DIR:-/tmp/trino-scenario-decisions/relay-inbox}" \
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
