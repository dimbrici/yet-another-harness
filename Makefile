# Thin wrappers so nobody has to remember paths or flags. pre-commit must be installed
# once (see docs/contributing-checks.md); how it was installed does not matter here.
.DEFAULT_GOAL := checks
.PHONY: checks checks-full fix test hooks

## Every hook on every file: hygiene, privacy, shellcheck, ruff, markdownlint.
checks:
	pre-commit run --all-files

## Everything: every hook, then the pre-push stage, which runs the test suite.
checks-full:
	pre-commit run --all-files
	pre-commit run --all-files --hook-stage pre-push

## Repair trailing whitespace and missing final newlines: the same hooks, autofix on.
fix:
	pre-commit run --all-files

## The test suite alone.
test:
	ORCH_RELAY_LIB=pi-extensions/test/fixtures/relay-lib.sh node --test pi-extensions/test/*.test.mjs

## Enable the hooks in this clone (pre-commit stage and pre-push stage).
hooks:
	pre-commit install
	pre-commit install --hook-type pre-push
