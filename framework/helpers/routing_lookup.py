#!/usr/bin/env python3
"""Resolve an orchestrator role to the provider and model assigned to it.

This is the ONE implementation of the routing rule. `start-agent.sh` (the shell
path) and the orchestrator's `orch_dispatch` tool (the pi path) both call it, so
they cannot drift apart the way a hand-copied constant would.

    routing_lookup.py <routing.yaml> <role>     print "<provider> <model> [<thinking>]"
    routing_lookup.py <routing.yaml> --roles    print one assigned role per line

The thinking level is a third field, printed only when the role declares one. A
role without it inherits pi's per-provider default, which is not uniform
(github-copilot starts at medium, opencode-go at high), so leaving it out is a
deliberate visible choice rather than an accident.

Exit 2 on any problem. There is no default role and no fallback provider: an
unassigned role, a missing file, or a half-written entry is an error, because a
silent substitution is exactly the failure this exists to prevent.
"""

import sys

USAGE = "usage: routing_lookup.py <routing.yaml> <role|--roles>"

# pi's thinking levels. 'xhigh' and 'max' are opt-in per model, so a role is only
# refused here for a level pi would not understand at all -- whether a specific
# model exposes the level is the model's business, not this lookup's.
VALID_THINKING = ("off", "minimal", "low", "medium", "high", "xhigh", "max")


def die(message):
    sys.stderr.write(f"routing_lookup: {message}\n")
    raise SystemExit(2)


def load(path):
    try:
        import yaml
    except ImportError:
        die("PyYAML is required to read the routing file")

    try:
        with open(path, encoding="utf-8") as handle:
            data = yaml.safe_load(handle)
    except OSError as exc:
        die(f"cannot read {path}: {exc}")

    if not isinstance(data, dict) or not data:
        die(f"{path} does not contain a role mapping")
    return data


def describe(role, entry):
    """Return "<provider> <model> [<thinking>]", or die explaining what is wrong."""
    if not isinstance(entry, dict):
        die(f"role '{role}' is not a mapping")
    provider, model = entry.get("provider"), entry.get("model")
    if not isinstance(provider, str) or not provider.strip():
        die(f"role '{role}' has no provider")
    if not isinstance(model, str) or not model.strip():
        die(f"role '{role}' has no model")

    fields = [provider.strip(), model.strip()]

    thinking = entry.get("thinking")
    if thinking is not None:
        if not isinstance(thinking, str) or thinking.strip() not in VALID_THINKING:
            die(
                f"role '{role}' has thinking={thinking!r}; valid levels are "
                f"{', '.join(VALID_THINKING)} (or omit the key to inherit pi's default)"
            )
        fields.append(thinking.strip())

    return " ".join(fields)


def main(argv):
    if len(argv) != 3:
        sys.stderr.write(USAGE + "\n")
        return 2

    routes = load(argv[1])
    wanted = argv[2]

    if wanted == "--roles":
        for role in sorted(routes):
            print(role)
        return 0

    if wanted not in routes:
        die(
            f"role '{wanted}' is not assigned in the routing file "
            f"(assigned roles: {', '.join(sorted(routes))})"
        )

    print(describe(wanted, routes[wanted]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
