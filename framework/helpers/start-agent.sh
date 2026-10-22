#!/usr/bin/env bash
# Start an orchestrated agent on the model its ROLE is assigned, or refuse.
#
# Why this exists: on 2026-10-01 the Orchestrator hand-typed "herdr agent start ... --kind pi"
# without an explicit --model seven times in a row. Every one of those agents silently came up on
# pi's default model (gpt-5.6-terra) instead of its routing assignment. One of those was a reviewer
# started in the same model family as the executor it was judging, which breaks the
# reviewer-must-differ-from-executor invariant. The routing file is the single source of truth, so
# dispatch reads it instead of relying on memory.
#
# Usage: start-agent.sh <role> <agent-name> <pane-id>
#   role: planning | implementation | reviewer | architect | interlocutor | deliberation | research
#
# Refuses (exit 2) on: unknown role, unknown pane, or a provider that is not ready. There is no
# silent fallback and no default model -- an unavailable route is an error, not a substitution.

set -euo pipefail

ROLE="${1:-}"
NAME="${2:-}"
PANE="${3:-}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROUTING="$HERE/orchestrator-routing.yaml"
LOOKUP="$HERE/routing_lookup.py"

die() { printf 'start-agent: %s\n' "$*" >&2; exit 2; }

[ -n "$ROLE" ] && [ -n "$NAME" ] && [ -n "$PANE" ] \
  || die "usage: start-agent.sh <role> <agent-name> <pane-id>"
[ -f "$ROUTING" ] || die "routing file not found: $ROUTING"
[ -f "$LOOKUP" ] || die "routing lookup not found: $LOOKUP"

# The routing rule lives in routing_lookup.py, shared with the pi-side tool.
read -r PROVIDER MODEL THINKING <<<"$(python3 "$LOOKUP" "$ROUTING" "$ROLE")" \
  || die "could not resolve role '$ROLE'"

command -v herdr >/dev/null || die "herdr not on PATH"
# The target must be an existing PANE. It will not have an agent yet -- 'agent get'
# returns nonzero for a bare shell, so check the pane, not the agent.
herdr pane get "$PANE" >/dev/null 2>&1 || die "pane '$PANE' does not exist"

# Read-only availability probe. Never prints or transmits the credential value.
AUTH="$(pi auth check --provider "$PROVIDER" 2>&1 | tail -1)"
[ "$AUTH" = "ready" ] || die "provider '$PROVIDER' is not ready (auth check said: $AUTH). \
No substitution is made -- fix the route or pick another assigned role."

MODEL_ARGS=("--model" "$PROVIDER/$MODEL")
# A role with no thinking level inherits pi's per-provider default, which is not
# uniform across providers. When the routing file names one, pass it explicitly.
[ -n "${THINKING:-}" ] && MODEL_ARGS+=("--thinking" "$THINKING")

herdr agent start "$NAME" --kind pi --pane "$PANE" -- "${MODEL_ARGS[@]}" >/dev/null \
  || die "herdr agent start failed for '$NAME'"

# Confirm the model actually took, by reading it back out of the live pi session.
SESSION="$(herdr agent get "$NAME" 2>/dev/null | python3 -c \
  "import json,sys;print(json.load(sys.stdin)['result']['agent']['agent_session']['value'])" 2>/dev/null || true)"
printf 'start-agent: %s role=%s model=%s/%s thinking=%s pane=%s\n' \
  "$NAME" "$ROLE" "$PROVIDER" "$MODEL" "${THINKING:-inherited}" "$PANE"
printf 'start-agent: read back the model from the session after the first prompt -- pi records it then.\n'
[ -n "$SESSION" ] && printf 'start-agent: session=%s\n' "$SESSION"
