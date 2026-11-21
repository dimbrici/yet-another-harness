#!/usr/bin/env node
/**
 * Repository checks. No dependencies, no network: node builtins plus the tools a
 * developer machine already has (git, bash, python3).
 *
 *   node tools/checks/checks.mjs            # everything, including the test suite
 *   node tools/checks/checks.mjs --fast     # everything except the test suite
 *   node tools/checks/checks.mjs --fix      # repair trailing whitespace and missing final newlines
 *
 * Exit code 0 means clean. Every finding prints as `path:line: message`.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync, writeFileSync, rmSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { extname, resolve, dirname, basename } from "node:path";
import { tmpdir } from "node:os";

const args = new Set(process.argv.slice(2));
const FAST = args.has("--fast");
const FIX = args.has("--fix");

const MAX_BYTES = 512 * 1024;
const TEXT_EXTENSIONS = new Set([
  ".md", ".mjs", ".ts", ".sh", ".json", ".yaml", ".yml", ".py", ".reladraw", ".svg", ".txt", "",
]);

/** Untracked files git would otherwise hide from us are out of scope by design. */
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);

const findings = [];
const report = (file, line, message) => findings.push({ file, line, message });

const isText = (file) => TEXT_EXTENSIONS.has(extname(file));
const read = (file) => readFileSync(file, "utf8");
const lineOf = (text, index) => text.slice(0, index).split("\n").length;

// --- hygiene -----------------------------------------------------------------

function checkHygiene(file, text) {
  const conflicts = [];
  const tabs = [];
  text.split("\n").forEach((line, i) => {
    if (/^(<<<<<<<|>>>>>>>|=======)$/.test(line.trim())) conflicts.push(i + 1);
    if (line.includes("\t")) tabs.push(i + 1);
  });

  const repaired = text.replace(/[ \t]+$/gm, "").replace(/\r\n/g, "\n");
  const normalised = repaired.endsWith("\n") ? repaired : `${repaired}\n`;

  if (FIX && normalised !== text) {
    writeFileSync(file, normalised);
    if (!text.endsWith("\n")) report(file, text.split("\n").length, "added missing final newline");
    return true;
  }

  if (!text.endsWith("\n")) report(file, text.split("\n").length, "missing final newline");
  if (text.includes("\r\n")) report(file, 0, "CRLF line endings; use LF");
  if (text.startsWith("\uFEFF")) report(file, 1, "byte-order mark");
  text.split("\n").forEach((line, i) => {
    if (/[ \t]+$/.test(line)) report(file, i + 1, "trailing whitespace");
  });
  for (const line of tabs) report(file, line, "tab character; use spaces");
  for (const line of conflicts) report(file, line, "merge conflict marker");
  return false;
}

// --- privacy and secrets -----------------------------------------------------

const SECRETS = [
  [/\bghp_[A-Za-z0-9]{30,}/, "GitHub personal access token"],
  [/\bgithub_pat_[A-Za-z0-9_]{30,}/, "GitHub fine-grained token"],
  [/\bsk-[A-Za-z0-9]{20,}/, "API key (sk-)"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key id"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key block"],
];

/**
 * This repository is public. Machine paths, personal email addresses and the
 * customer names that were deliberately replaced must not creep back in.
 */
const PRIVACY = [
  [/\/Users\/[A-Za-z0-9._-]+/, "machine-specific home path"],
  [/\/home\/[A-Za-z0-9._-]+/, "machine-specific home path"],
  [/[A-Za-z]:\\\\?Users\\\\?/, "machine-specific home path"],
  [/\b(?:masking|tskctl|trino)\b/i, "customer-specific name (use alpha, beta, gamma)"],  // checks:allow customer-names
];

function checkPrivacy(file, text) {
  for (const [pattern, label] of SECRETS) {
    const hit = text.match(pattern);
    if (hit) report(file, lineOf(text, text.indexOf(hit[0])), `possible ${label}`);
  }
  for (const [pattern, label] of PRIVACY) {
    text.split("\n").forEach((line, i) => {
      // A line may opt out with "checks:allow" so documentation can name a rule
      // without switching that rule off for a whole file.
      if (line.includes("checks:allow")) return;
      if (pattern.test(line)) report(file, i + 1, label);
    });
  }
  const emails = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [];
  for (const email of emails) {
    if (/noreply@users\.noreply\.github\.com$|@users\.noreply\.github\.com$/.test(email)) continue;
    if (/example\.(com|org)$/.test(email)) continue;
    report(file, lineOf(text, text.indexOf(email)), `personal email address (${email})`);
  }
}

// --- syntax and structure ----------------------------------------------------

function checkJson(file, text) {
  try {
    JSON.parse(text);
  } catch (error) {
    report(file, 0, `invalid JSON: ${error.message}`);
  }
}

function checkYaml(file) {
  try {
    execFileSync("python3", ["-c", "import sys,yaml;yaml.safe_load(open(sys.argv[1]))", file], {
      stdio: "pipe",
    });
  } catch (error) {
    const detail = String(error.stderr ?? error.message).trim().split("\n").pop();
    report(file, 0, `invalid YAML: ${detail}`);
  }
}

/** Type stripping catches syntax errors without needing a compiler installed. */
function checkTypeScript(file, text) {
  const stripped = resolve(tmpdir(), `check-${process.pid}-${basename(file)}.mjs`);
  try {
    writeFileSync(stripped, stripTypeScriptTypes(text, { mode: "strip" }));
    execFileSync("node", ["--check", stripped], { stdio: "pipe" });
  } catch (error) {
    const detail = String(error.stderr ?? error.message).trim().split("\n").find((l) => /Error/.test(l));
    report(file, 0, `TypeScript syntax: ${detail ?? "parse failed"}`);
  } finally {
    rmSync(stripped, { force: true });
  }
}

function checkModule(file) {
  try {
    execFileSync("node", ["--check", file], { stdio: "pipe" });
  } catch (error) {
    const detail = String(error.stderr ?? error.message).trim().split("\n").find((l) => /Error|error/.test(l));
    report(file, 0, `JavaScript syntax: ${detail ?? "parse failed"}`);
  }
}

function checkShell(file) {
  try {
    execFileSync("bash", ["-n", file], { stdio: "pipe" });
  } catch (error) {
    report(file, 0, `shell syntax: ${String(error.stderr).trim().split("\n").pop()}`);
  }
  try {
    execFileSync("shellcheck", ["-S", "warning", file], { stdio: "pipe" });
  } catch (error) {
    if (error.code === "ENOENT") return; // optional tool, absent is fine
    const detail = String(error.stdout ?? "").trim().split("\n").filter(Boolean).slice(0, 3).join(" | ");
    if (detail) report(file, 0, `shellcheck: ${detail}`);
  }
}

function checkPython(file) {
  try {
    execFileSync("python3", ["-m", "py_compile", file], { stdio: "pipe" });
  } catch (error) {
    report(file, 0, `python syntax: ${String(error.stderr).trim().split("\n").pop()}`);
  }
}

/** Relative Markdown links must resolve; absolute URLs are not fetched (no network). */
function checkMarkdownLinks(file, text) {
  const dir = dirname(file);
  const linkPattern = /\[[^\]]*\]\(([^)\s]+)\)/g;
  for (const match of text.matchAll(linkPattern)) {
    const target = match[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const path = target.split("#")[0];
    if (!path) continue;
    try {
      statSync(resolve(dir, path));
    } catch {
      report(file, lineOf(text, match.index), `broken relative link: ${target}`);
    }
  }
  const headings = [...text.matchAll(/^#\s+(.*)$/gm)].map((m) => m[1].trim().toLowerCase());
  const seen = new Set();
  for (const heading of headings) {
    if (seen.has(heading)) report(file, 0, `duplicate document title: ${heading}`);
    seen.add(heading);
  }
}

// --- run ---------------------------------------------------------------------

let repaired = 0;
for (const file of files) {
  const { size } = statSync(file);
  if (size > MAX_BYTES) report(file, 0, `file is ${(size / 1024).toFixed(0)} KB (limit ${MAX_BYTES / 1024} KB)`);
  if (!isText(file)) continue;

  const before = read(file);
  checkPrivacy(file, before);
  if (checkHygiene(file, before)) repaired += 1;
  const text = FIX ? read(file) : before;

  switch (extname(file)) {
    case ".json":
      checkJson(file, text);
      break;
    case ".yaml":
    case ".yml":
      checkYaml(file);
      break;
    case ".ts":
      checkTypeScript(file, text);
      break;
    case ".mjs":
      checkModule(file);
      break;
    case ".sh":
      checkShell(file);
      break;
    case ".py":
      checkPython(file);
      break;
    case ".md":
      checkMarkdownLinks(file, text);
      break;
  }
}

if (repaired) console.log(`fixed ${repaired} file(s)`);

if (!FAST) {
  try {
    execFileSync("node", ["--test", "pi-extensions/test"], {
      stdio: "pipe",
      // The suite needs a relay library; use the tracked fixture so CI needs nothing else.
      env: { ...process.env, ORCH_RELAY_LIB: resolve("pi-extensions/test/fixtures/relay-lib.sh") },
    });
    console.log("tests: pass");
  } catch (error) {
    const out = String(error.stdout ?? "").trim().split("\n").slice(-6).join("\n");
    findings.push({ file: "pi-extensions/test", line: 0, message: `test suite failed\n${out}` });
  }
}

if (findings.length === 0) {
  console.log(`checks: clean (${files.length} files${FAST ? ", tests skipped" : ""})`);
  process.exit(0);
}

for (const { file, line, message } of findings) console.log(`${file}${line ? `:${line}` : ""}: ${message}`);
console.log(`\n${findings.length} finding(s) in ${new Set(findings.map((f) => f.file)).size} file(s)`);
process.exit(1);
