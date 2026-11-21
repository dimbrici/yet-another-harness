# Thin wrappers so nobody has to remember paths or flags.
.DEFAULT_GOAL := checks
.PHONY: checks checks-full fix test hooks

## Fast checks: what pre-commit runs on commit (hygiene, privacy, syntax).
checks:
	node tools/checks/checks.mjs --fast

## Everything the checks can do, including the pi-extensions test suite.
checks-full:
	node tools/checks/checks.mjs

## Repair trailing whitespace and missing final newlines.
fix:
	node tools/checks/checks.mjs --fix

## The test suite alone.
test:
	node --test pi-extensions/test

## Enable the hooks in this clone (pre-commit stage and pre-push stage).
hooks:
	pre-commit install
	pre-commit install --hook-type pre-push
