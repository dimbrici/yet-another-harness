#!/usr/bin/env bash
# TEMPLATE -- copy to <repo>/.planning/orch/relay/<TASK>-watch.sh and edit.
#
# Prefer orch_dispatch, which writes a relay like this one for you (with the
# freshness gate, the gone/provider_error/idle_no_delivery branches, and the
# durable inbox emitter). This template is for the cases orch_dispatch does not
# cover, and it is the short, readable statement of what a relay is.
#
# Watch-only relay for ONE delegated assignment. It:
#   1. submits the brief ONCE (omit this if re-arming after a settle),
#   2. polls the agent for "settled + report exists",
#   3. fires the control-plane RELAY_EVENT naming the board task,
#   4. exits.
#
# It never re-submits the brief on re-arm, never waits with --wait (that would
# requeue the brief), and never touches the tsk board -- the Orchestrator does
# that after reading the report.
#
# Write relays FRESH. Do not derive one from another, and do not edit a RUNNING
# relay in place -- bash reads scripts incrementally.
#
# WHERE PATHS COME FROM
# ---------------------
# Every path below is derived, not typed: the repo is discovered from the library
# it sources, and the relay dir from relay-lib.sh's ORCH_RELAY_DIR. That is what
# keeps this template copy-pasteable into ANY repo. See the header of relay-lib.sh
# for the full environment and the directory convention.

set -u

# Library first: it discovers REPO_ROOT from its own location and defines
# ORCH_RELAY_DIR / ORCH_EVENTS_DIR for this repo.
#
# EDIT ME: name the repo explicitly. A relay lives in $ORCH_RELAY_DIR, OUTSIDE the
# repo it serves, so once copied there it can no longer find the library -- or the
# repo -- relative to itself. An explicit REPO_ROOT wins over the library's derived
# default. (orch_dispatch, which writes relays for you, fills this in.)
REPO_ROOT="${REPO_ROOT:-/path/to/repo}"
source "$REPO_ROOT/.planning/orch/relay-lib.sh"

AGENT="t999_impl"                          # herdr agent name
TASK="T999-EXAMPLE"                        # assignment id for the event
REPORT="$REPO_ROOT/.planning/reports/T999-implementation.md"

RELAY_LOG="${RELAY_LOG:-$ORCH_RELAY_DIR/T999-relay.log}"
PROMPT_FILE="${PROMPT_FILE:-$ORCH_RELAY_DIR/T999.prompt}"
TSK_ID="T15"            # board task this assignment belongs to; "" for none

mkdir -p "$ORCH_RELAY_DIR"

relay_log "submitting brief"
herdr agent prompt "$AGENT" "$(cat "$PROMPT_FILE")" >/dev/null 2>&1
relay_log "armed; watch-only"

prev=""
while true; do
  st=$(relay_state "$AGENT")
  if [ -f "$REPORT" ] && [ "$st" != "working" ]; then
    relay_settle "$TASK" "$AGENT" "$REPORT"
    exit 0
  fi
  [ "$st" != "$prev" ] && {
    relay_log "state=$st report=$([ -f "$REPORT" ] && echo yes || echo no)"
    prev="$st"
  }
  sleep 15
done
