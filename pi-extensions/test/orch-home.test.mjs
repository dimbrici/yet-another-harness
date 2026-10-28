// Tests for lib/orch-home.mjs: the single resolver every lane consumer derives
// its non-repo state path from. This suite has no repo-local predecessor -- the
// module it covers arrived with the global move, and its whole job is to keep
// four consumers from disagreeing the way three hardcoded /tmp paths once did.
//
// Everything runs against temp dirs created here and removed here; nothing reads
// or writes the real lane state of any repo.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";

import {
  ORCH_HOME_BASE,
  ORCH_HOME_PIN,
  inboxDir,
  orchHome,
  relayDir,
  runsDir,
} from "../lib/orch-home.mjs";

let root;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "orch-home-test-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** A repo dir with no pin file, so resolution falls to the basename default. */
function bareRepo(name) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** A repo dir carrying a one-line pin file. */
function pinnedRepo(name, pinText) {
  const dir = bareRepo(name);
  const pinPath = join(dir, ORCH_HOME_PIN);
  mkdirSync(join(pinPath, ".."), { recursive: true });
  writeFileSync(pinPath, pinText, "utf8");
  return dir;
}

describe("the constants", () => {
  test("the fallback base and the pin file name are the documented ones", () => {
    assert.equal(ORCH_HOME_BASE, "/tmp/orch");
    assert.equal(ORCH_HOME_PIN, join(".planning", "orch", "orch-home"));
  });
});

describe("root resolution priority", () => {
  test("ORCH_HOME beats the pin file AND the basename default", () => {
    const pinned = pinnedRepo("lane-a", `${join(root, "pinned-target")}\n`);
    assert.equal(orchHome(pinned, { ORCH_HOME: "/tmp/explicit-lane" }), "/tmp/explicit-lane");
    assert.equal(orchHome(bareRepo("lane-b"), { ORCH_HOME: "/tmp/explicit-lane" }), "/tmp/explicit-lane");
  });

  test("ORCH_HOME wins verbatim: no suffix, no normalization", () => {
    const home = orchHome("/tmp/fake-repo-x", { ORCH_HOME: "/tmp/orchhome-probe/" });
    assert.equal(home, "/tmp/orchhome-probe/");
  });

  test("an empty ORCH_HOME is not a value: the pin still answers", () => {
    const pinned = pinnedRepo("lane-empty-env", `${join(root, "the-pin")}\n`);
    assert.equal(orchHome(pinned, { ORCH_HOME: "" }), join(root, "the-pin"));
  });

  test("the pin file beats the basename default", () => {
    const pinned = pinnedRepo("lane-pin-wins", `${join(root, "pinned")}\n`);
    assert.equal(orchHome(pinned, {}), join(root, "pinned"));
    assert.notEqual(orchHome(pinned, {}), join(ORCH_HOME_BASE, "lane-pin-wins"));
  });

  test("with neither env nor pin the root is base plus the slug of the repo name", () => {
    assert.equal(orchHome("/tmp/fake-repo-x", {}), `${ORCH_HOME_BASE}/fake-repo-x`);
    assert.equal(orchHome("/tmp/a b!!c", {}), `${ORCH_HOME_BASE}/a-b-c`); // module header example
  });

  test("the first non-blank pin line wins, and blanks or an empty pin fall through", () => {
    const first = pinnedRepo("lane-first-line", `\n   \n${join(root, "one")}\n${join(root, "two")}\n`);
    assert.equal(orchHome(first, {}), join(root, "one"));

    const blank = pinnedRepo("lane-blank", "\n\n   \n");
    assert.equal(orchHome(blank, {}), `${ORCH_HOME_BASE}/lane-blank`);

    const empty = pinnedRepo("lane-empty-file", "");
    assert.equal(orchHome(empty, {}), `${ORCH_HOME_BASE}/lane-empty-file`);
  });

  test("an absolute pin line is used as-is", () => {
    const pinned = pinnedRepo("lane-abs", "/tmp/trino-scenario-decisions\n");
    assert.equal(orchHome(pinned, {}), "/tmp/trino-scenario-decisions");
  });

  test("a relative pin line resolves from the repo root, not the process cwd", () => {
    const pinned = pinnedRepo("lane-rel", "state/here\n");
    assert.equal(orchHome(pinned, {}), join(pinned, "state/here"));
    // Same pin, asked from a different process cwd: the answer must not move.
    const savedCwd = process.cwd();
    try {
      process.chdir(root);
      assert.equal(orchHome(pinned, {}), join(pinned, "state/here"));
    } finally {
      process.chdir(savedCwd);
    }
  });

  test("pin lines are trimmed, so trailing spaces and CRs do not leak in", () => {
    const pinned = pinnedRepo("lane-trim", `  ${join(root, "clean")}  \r\n`);
    assert.equal(orchHome(pinned, {}), join(root, "clean"));
  });

  test("an unreadable pin is not fatal: resolution falls through to the default", () => {
    const dir = bareRepo("lane-bad-pin");
    mkdirSync(join(dir, ORCH_HOME_PIN), { recursive: true });
    // A directory where the pin file is expected: reading it throws, the lane moves on.
    assert.equal(orchHome(dir, {}), `${ORCH_HOME_BASE}/lane-bad-pin`);
  });
});

describe("per-consumer overrides", () => {
  test("each override redirects exactly its own consumer", () => {
    const repo = bareRepo("lane-own");
    const env = { ORCH_RELAY_DIR: "/tmp/only-relay" };
    assert.equal(relayDir(repo, env), "/tmp/only-relay");
    assert.equal(inboxDir(repo, env), `${ORCH_HOME_BASE}/lane-own/relay-inbox`);
    assert.equal(runsDir(repo, env), `${ORCH_HOME_BASE}/lane-own/runs/run-command`);

    assert.equal(inboxDir(repo, { ORCH_EVENTS_DIR: "/tmp/only-inbox" }), "/tmp/only-inbox");
    assert.equal(relayDir(repo, { ORCH_EVENTS_DIR: "/tmp/only-inbox" }), `${ORCH_HOME_BASE}/lane-own/relay`);

    assert.equal(runsDir(repo, { RUN_COMMAND_RUNS_DIR: "/tmp/only-runs" }), "/tmp/only-runs");
    assert.equal(inboxDir(repo, { RUN_COMMAND_RUNS_DIR: "/tmp/only-runs" }), `${ORCH_HOME_BASE}/lane-own/relay-inbox`);
  });

  test("an explicit ORCH_HOME prefixes the three subdirs and loses to each override", () => {
    const repo = bareRepo("lane-home");
    const env = { ORCH_HOME: "/tmp/named-lane" };
    assert.equal(relayDir(repo, env), "/tmp/named-lane/relay");
    assert.equal(inboxDir(repo, env), "/tmp/named-lane/relay-inbox");
    assert.equal(runsDir(repo, env), "/tmp/named-lane/runs/run-command");

    assert.equal(relayDir(repo, { ...env, ORCH_RELAY_DIR: "/tmp/x" }), "/tmp/x");
    assert.equal(inboxDir(repo, { ...env, ORCH_EVENTS_DIR: "/tmp/y" }), "/tmp/y");
    assert.equal(runsDir(repo, { ...env, RUN_COMMAND_RUNS_DIR: "/tmp/z" }), "/tmp/z");
  });

  test("the pin file feeds all three consumers the same root", () => {
    const repo = pinnedRepo("lane-pin-all", `${join(root, "pinned-lane")}\n`);
    assert.equal(relayDir(repo, {}), join(root, "pinned-lane", "relay"));
    assert.equal(inboxDir(repo, {}), join(root, "pinned-lane", "relay-inbox"));
    assert.equal(runsDir(repo, {}), join(root, "pinned-lane", "runs", "run-command"));
  });

  test("the consumers can never disagree: each is orchHome plus its own suffix", () => {
    const cases = [
      [bareRepo("lane-agree"), {}],
      [bareRepo("lane-agree"), { ORCH_HOME: join(root, "env-lane") }],
      [pinnedRepo("lane-agree-pin", "relative/pin\n"), {}],
      [bareRepo("lane-agree"), { ORCH_HOME: "/tmp/a", ORCH_EVENTS_DIR: "" }],
    ];
    for (const [repo, env] of cases) {
      const home = orchHome(repo, env);
      assert.equal(relayDir(repo, env), join(home, "relay"));
      assert.equal(inboxDir(repo, env), join(home, "relay-inbox"));
      assert.equal(runsDir(repo, env), join(home, "runs", "run-command"));
    }
  });

  test("the consumers stay consistent through the libs that use them", async () => {
    // inboxRoot and runsDir in the consumer libs are the same resolver, so the
    // four places lane state is named agree for one repo and one env.
    const repo = pinnedRepo("lane-consumers", `${join(root, "lane-state")}\n`);
    const savedCwd = process.cwd();
    process.chdir(repo);
    try {
      const { inboxRoot } = await import("../lib/orch-events.mjs");
      const { runsDir: storeRunsDir } = await import("../lib/run-store.mjs");
      assert.equal(inboxRoot({}), join(root, "lane-state", "relay-inbox"));
      assert.equal(storeRunsDir({}), join(root, "lane-state", "runs", "run-command"));
      assert.equal(inboxRoot({}), join(orchHome(repo, {}), "relay-inbox"));
      assert.equal(storeRunsDir({}), join(orchHome(repo, {}), "runs", "run-command"));
    } finally {
      process.chdir(savedCwd);
    }
  });
});

describe("lazy resolution", () => {
  test("no caching: the env is read afresh on every call", () => {
    const repo = bareRepo("lane-lazy");
    assert.equal(orchHome(repo, { ORCH_HOME: "/tmp/first" }), "/tmp/first");
    assert.equal(orchHome(repo, { ORCH_HOME: "/tmp/second" }), "/tmp/second");
    assert.equal(orchHome(repo, {}), `${ORCH_HOME_BASE}/lane-lazy`);
  });

  test("no caching: editing the pin file between calls changes the answer", () => {
    const repo = pinnedRepo("lane-pin-edit", `${join(root, "one")}\n`);
    assert.equal(orchHome(repo, {}), join(root, "one"));
    writeFileSync(join(repo, ORCH_HOME_PIN), `${join(root, "two")}\n`, "utf8");
    assert.equal(orchHome(repo, {}), join(root, "two"));
    rmSync(join(repo, ORCH_HOME_PIN));
    assert.equal(orchHome(repo, {}), `${ORCH_HOME_BASE}/lane-pin-edit`);
  });

  test("process.env and process.cwd are the defaults, read at call time", () => {
    const repo = bareRepo("lane-defaults");
    const savedCwd = process.cwd();
    const saved = { ORCH_HOME: process.env.ORCH_HOME, ORCH_RELAY_DIR: process.env.ORCH_RELAY_DIR };
    try {
      process.chdir(repo);
      delete process.env.ORCH_HOME;
      delete process.env.ORCH_RELAY_DIR;
      assert.equal(orchHome(), `${ORCH_HOME_BASE}/lane-defaults`);
      assert.equal(relayDir(), join(orchHome(), "relay"));
      process.env.ORCH_HOME = join(root, "from-env");
      assert.equal(orchHome(), join(root, "from-env"));
    } finally {
      process.chdir(savedCwd);
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test("a fresh process resolves per call, so nothing is captured at module load", () => {
    const repo = bareRepo("lane-detached");
    const modulePath = join(import.meta.dirname, "..", "lib", "orch-home.mjs");
    const script = `
      import { orchHome } from ${JSON.stringify(modulePath)};
      process.env.ORCH_HOME = "/tmp/first-load";
      console.log(orchHome(${JSON.stringify(repo)}, process.env));
      process.env.ORCH_HOME = "/tmp/second-load";
      console.log(orchHome(${JSON.stringify(repo)}, process.env));
      delete process.env.ORCH_HOME;
      console.log(orchHome(${JSON.stringify(repo)}, process.env));
    `;
    const file = join(root, "lazy-detached.mjs");
    writeFileSync(file, script, "utf8");
    const out = spawnSync(process.execPath, [file], { encoding: "utf8" });
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(
      out.stdout.trim().split("\n"),
      ["/tmp/first-load", "/tmp/second-load", `${ORCH_HOME_BASE}/lane-detached`],
    );
  });
});

describe("slug of the repo name", () => {
  test("spaces and punctuation collapse to one dash and are trimmed at the ends", () => {
    // One run of unsuitable characters becomes one dash; leading and trailing
    // dashes are then stripped.
    const cases = [
      ["  my   repo  ", "my-repo"],
      ["a!!!b", "a-b"],
      ["a b", "a-b"],
      ["--a--b--", "a--b"],
      ["a b!!c", "a-b-c"],
    ];
    for (const [name, slug] of cases) {
      assert.equal(orchHome(join("/tmp", name), {}), `${ORCH_HOME_BASE}/${slug}`, JSON.stringify(name));
    }
  });

  test("anything outside [A-Za-z0-9._-] becomes a dash", () => {
    for (const [name, slug] of [
      ["a@b#c", "a-b-c"],
      ["café-repo", "caf--repo"],
      ["a+b", "a-b"],
      ["a:b", "a-b"],
    ]) {
      assert.equal(orchHome(join("/tmp", name), {}), `${ORCH_HOME_BASE}/${slug}`, name);
    }
  });

  test("only the basename is used: unsuitable characters above the repo name never leak in", () => {
    // The path is cut to its basename before it is slugged.
    assert.equal(orchHome("/srv/my team/app", {}), `${ORCH_HOME_BASE}/app`);
    assert.equal(orchHome("/tmp/a.b~c", {}), `${ORCH_HOME_BASE}/a.b-c`);
  });

  test("dots, underscores and hyphens inside a name survive untouched", () => {
    assert.equal(orchHome("/tmp/keep.me_as-is", {}), `${ORCH_HOME_BASE}/keep.me_as-is`);
  });

  test("an entirely unsuitable name falls back to 'default'", () => {
    for (const name of ["   ", "!!!", "+++"]) {
      assert.equal(orchHome(join("/tmp", name), {}), `${ORCH_HOME_BASE}/default`, JSON.stringify(name));
    }
  });

  test("only the basename is used: the path above the repo never leaks in", () => {
    const deep = join(root, "nested", "dirs", "lane-name");
    mkdirSync(deep, { recursive: true });
    assert.equal(orchHome(deep, {}), `${ORCH_HOME_BASE}/${basename(deep)}`);
  });
});
