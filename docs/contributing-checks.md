# Repository checks

Everything here runs with no dependencies to install and without network access: Node
builtins plus `git`, `bash` and `python3`. That is deliberate — the checks must work on a
fresh machine and inside CI without a package manager step.

## Run them

```bash
node tools/checks/checks.mjs          # everything, including the test suite
node tools/checks/checks.mjs --fast   # everything except the test suite
node tools/checks/checks.mjs --fix    # repair trailing whitespace and missing final newlines
```

## Install the hooks

`pre-commit` is the recommended runner. The hooks are `repo: local` + `language: system`,
so nothing is fetched from the network and no third-party hook code runs:

```bash
pre-commit install                        # pre-commit stage
pre-commit install --hook-type pre-push   # pre-push stage
pre-commit run --all-files                # run everything now
```

Without `pre-commit`, or without Python on the machine, the checks run directly and git
uses the versioned hooks in `.githooks/`:

```bash
node tools/checks/checks.mjs --fast       # what pre-commit would run
git config core.hooksPath .githooks        # enable the same hooks without pre-commit
```

Use one or the other. `core.hooksPath` and `pre-commit install` both write git hooks, and
having both means whichever was installed last wins.

- **pre-commit stage** runs `--fast`: hygiene, privacy and syntax, about a second.
- **pre-push stage** runs everything, including `node --test pi-extensions/test`.

CI (`.github/workflows/checks.yml`) runs the same command on pull requests, so a hook
someone forgot to install still cannot pass unnoticed.

### Why local hooks instead of the usual `pre-commit-hooks`

The well-known hook repos (`pre-commit/pre-commit-hooks`, `mirrors-prettier`,
`ruff-pre-commit`) clone from GitHub on first run and then execute that code. For a
repository whose payload is agent instructions, that is a supply-chain surface and a
network requirement for every contributor. Everything those hooks do here is already in
`checks.mjs`, in a few dozen lines, with no network. Adopt the upstream hooks when a check
genuinely needs one; add it as a normal `repo:` entry then.

## What is checked

| Area | Check |
| --- | --- |
| Hygiene | final newline, LF endings, no byte-order mark, no trailing whitespace, no tabs, no merge conflict markers, 512 KB file limit |
| Secrets | GitHub tokens, `sk-` keys, AWS key ids, Slack tokens, private key blocks |
| Privacy | machine-specific home paths, personal email addresses, and the customer names that were deliberately replaced (`masking`, `tskctl`, `trino` to `alpha`, `beta`, `gamma`) <!-- checks:allow customer-names --> |
| Structure | JSON parses, YAML parses, Markdown relative links resolve, no duplicate headings |
| Syntax | TypeScript type-strips, JavaScript parses, `bash -n`, `python3 -m py_compile`, optional `shellcheck` when installed |
| Behaviour | the `pi-extensions` test suite |

The privacy checks exist because this repository is public and has leaked customer names
and machine paths before. They are the cheapest possible guard against repeating that.

## Add a check

A line may opt out of the privacy rules with a `checks:allow` marker, which is how the
table above names the forbidden words without failing itself. Use it for documentation
only; it disables the check for that one line, never for the file.

Add a function to `tools/checks/checks.mjs` and call it from the loop at the bottom. Report
problems with `report(file, line, message)`; never throw, because one broken file must not
hide the rest. Keep new checks dependency-free — if a check needs a tool that may be
absent, detect it and skip instead of failing (see the `shellcheck` branch).

## Formatting

There is no formatter dependency, because adding one would mean a package manager and a
lockfile for a repository that currently needs neither. `--fix` handles the mechanical
part: trailing whitespace and the final newline. Everything else is a review matter, and
the rules are small enough to state in one line each:

- two spaces of indentation, no tabs;
- LF endings, one final newline;
- Markdown and shell lines under 120 columns;
- no trailing whitespace.
