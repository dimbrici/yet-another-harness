# Repository checks

Hooks run through [pre-commit](https://pre-commit.com/). Most come from upstream hook
repositories, pinned by tag; `pre-commit autoupdate` moves the pins. Two hooks are local
because no upstream hook covers them: this repository's privacy rules and the extension
test suite.

## Install

```bash
pre-commit install                        # pre-commit stage
pre-commit install --hook-type pre-push   # pre-push stage
pre-commit run --all-files                # run everything now
```

The first run fetches the hook repositories into `~/.cache/pre-commit`; later runs use the
cache.

## What runs

| Hook | Source | What it enforces |
| --- | --- | --- |
| trailing-whitespace, end-of-file-fixer, mixed-line-ending | pre-commit-hooks | whitespace and line endings, with autofix |
| check-yaml, check-json | pre-commit-hooks | configuration files parse |
| check-merge-conflict | pre-commit-hooks | no conflict markers committed |
| check-added-large-files | pre-commit-hooks | 512 KB limit |
| check-executables-have-shebangs, check-shebang-scripts-are-executable | pre-commit-hooks | a shebang and an executable bit travel together |
| detect-private-key | pre-commit-hooks | private key blocks |
| detect-secrets | Yelp/detect-secrets | credentials and high-entropy strings |
| markdownlint | markdownlint-cli | Markdown structure, with autofix |
| shellcheck | shellcheck-py | shell correctness |
| ruff | ruff-pre-commit | Python |
| repo-privacy-and-syntax | local | machine paths, personal emails, replaced customer names, TypeScript and Markdown link checks |
| repo-checks-with-tests | local, pre-push | everything above plus `node --test pi-extensions/test` |

The local checks live in `tools/checks/checks.mjs` and run without pre-commit too:

```bash
node tools/checks/checks.mjs          # with the test suite
node tools/checks/checks.mjs --fast    # without it
node tools/checks/checks.mjs --fix     # repair whitespace and missing final newlines
```

## Configuration files

- `.pre-commit-config.yaml` — the hooks and their pins.
- `.markdownlint.yaml` — long prose lines, deliberate repeat headings, embedded HTML and
  table pipe alignment are allowed; everything else must pass.
- `.githooks/` — the same two local checks as plain git hooks, for a clone without Python.
  Use either `pre-commit install` or `git config core.hooksPath .githooks`, never both:
  each writes git hooks, so the last one installed wins.

## Deliberate exceptions

- **No prettier.** Its pre-commit mirror bootstraps node through `nodeenv`, which fails on
  this machine, and running it over the prose documents rewrites them wholesale. Whitespace
  is covered by pre-commit-hooks; the formatting rules are: two spaces, no tabs, LF endings,
  one final newline, no trailing whitespace.
- **shellcheck ignores SC1091 and SC2034.** The helper templates source `relay-lib.sh` from
  the consumer's `.planning/`, which does not exist in this repository, and they assign
  placeholder variables that the generated script reads.
- **The relay fixture is not executable.** `pi-extensions/test/fixtures/relay-lib.sh` is
  sourced by tests, and its `0644` mode is part of the deployed-copy evidence.
- **Secrets in the pin table.** The pinned SHA-256 digests in
  `pi-extensions/test/orch-events.test.mjs` are inline-allowlisted rather than baselined, so
  the allowlist sits next to the reason.
- **`checks:allow`.** A single line may opt out of the local privacy rules with this marker,
  which is how this document names the forbidden words without failing itself.

## Add a check

Add an upstream hook to `.pre-commit-config.yaml` and run `pre-commit autoupdate`. Only when
no upstream hook exists, add a function to `tools/checks/checks.mjs` and call it from the loop
at the bottom; report problems with `report(file, line, message)` and never throw, because
one broken file must not hide the rest.
