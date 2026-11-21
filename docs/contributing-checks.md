# Repository checks

Every check is a [pre-commit](https://pre-commit.com/) hook. Most come from upstream hook
repositories, pinned by tag; `pre-commit autoupdate` moves the pins. Two hooks are local
because no upstream hook covers them: this repository's privacy rules and the extension
test suite. Both are inline `entry:` commands, so the repository checks itself in one file
and carries no check runner of its own.

## Install

pre-commit must be installed once, because `pre-commit install` writes a git hook that
calls the installed binary. Any of these works; the repository does not care which:

```bash
uv tool install pre-commit      # uv
pipx install pre-commit         # pipx
brew install pre-commit         # Homebrew
```

Then, in the clone:

```bash
make hooks
```

The first run fetches the hook repositories into `~/.cache/pre-commit`; later runs use the
cache.

## Make targets

The `Makefile` wraps the commands, so nobody has to remember paths or flags.

| Target | Runs |
| --- | --- |
| `make checks` | `pre-commit run --all-files`, every hook on every file |
| `make checks-full` | the same, then `--hook-stage pre-push`, which runs the extension test suite |
| `make fix` | the same hooks, which is where the autofix hooks live (whitespace, final newlines, Markdown) |
| `make test` | `node --test pi-extensions/test/*.test.mjs` with `ORCH_RELAY_LIB` set to the tracked fixture |
| `make hooks` | `pre-commit install` for the pre-commit and pre-push stages |

`make checks` is the default target. The same two pre-commit commands run in CI on every
pull request, through the upstream `pre-commit/action`.

## What runs

| Hook | Source | What it enforces |
| --- | --- | --- |
| trailing-whitespace, end-of-file-fixer, mixed-line-ending, fix-byte-order-marker | pre-commit-hooks | whitespace, line endings, byte-order marks, with autofix |
| check-yaml, check-json | pre-commit-hooks | configuration files parse |
| check-merge-conflict | pre-commit-hooks | no conflict markers committed |
| check-added-large-files | pre-commit-hooks | 512 KB limit |
| check-executables-have-shebangs, check-shebang-scripts-are-executable | pre-commit-hooks | a shebang and an executable bit travel together |
| detect-private-key | pre-commit-hooks | private key blocks |
| detect-secrets | Yelp/detect-secrets | credentials and high-entropy strings |
| markdownlint | markdownlint-cli | Markdown structure, with autofix |
| shellcheck | shellcheck-py | shell syntax and static analysis |
| ruff | ruff-pre-commit | Python |
| repo-privacy | local, inline grep | machine paths, personal email addresses, replaced customer names |
| repo-tests | local, inline command, pre-push | `node --test` over the extension suite |

No hook parses JavaScript or TypeScript on its own. The test suite loads those files for
real, which is stronger evidence than a syntax check, so `repo-tests` covers them.

Markdown link targets are not verified: markdownlint checks structure, and no maintained
hook checks relative targets without a nodeenv bootstrap or a Rust build from source. A
broken relative link in the docs is caught only by the reader.

## Configuration files

- `.pre-commit-config.yaml` — the hooks and their pins, plus the two inline local hooks.
- `.markdownlint.yaml` — long prose lines, deliberate repeat headings, embedded HTML and
  table pipe alignment are allowed; everything else must pass.

There is no `pyproject.toml` and no `uv.lock`: this is not a Python project. pre-commit owns
each hook's environment, so the repository only records the pins.

## Deliberate exceptions

- **No prettier.** Its pre-commit mirror bootstraps node through `nodeenv`, which fails on
  this machine, and running it over the prose documents rewrites them wholesale. Whitespace
  is covered by pre-commit-hooks; the formatting rules are: two spaces, LF endings, one
  final newline, no trailing whitespace. Make recipes keep their tabs, which are the
  separator rather than a formatting choice.
- **shellcheck ignores SC1091 and SC2034.** The helper templates source `relay-lib.sh` from
  the consumer's `.planning/`, which does not exist in this repository, and they assign
  placeholder variables that the generated script reads.
- **The relay fixture is not executable.** `pi-extensions/test/fixtures/relay-lib.sh` is
  sourced by tests, and its mode is part of the deployed-copy evidence.
- **Secrets in the pin table.** The pinned SHA-256 digests in
  `pi-extensions/test/orch-events.test.mjs` are inline-allowlisted rather than baselined, so
  the allowlist sits next to the reason.
- **`checks:allow`.** Write alpha, beta, gamma instead of `masking`, `tskctl` and `trino`, the replaced customer names; a line that must name them carries this marker. <!-- checks:allow -->
- **No personal addresses.** Allowlisted exceptions are `example.com`, `example.org` and
  `*.users.noreply.github.com`; everything else is reported.

## Add a check

Add an upstream hook to `.pre-commit-config.yaml` and run `pre-commit autoupdate`. Only
when no upstream hook exists, add a `repo: local` hook with an inline `entry:`; keep it short
enough to read in place, because there is no separate runner to test it in.
