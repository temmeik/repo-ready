'use strict';
// Command extraction: install/dev/build/test/lint per ecosystem, each tagged
// with its source: "verified" (declared in a manifest) or "seen-in-CI".
const fs = require('fs');
const path = require('path');
const { readJson, readIf } = require('./detect');

const SCRIPT_ALIASES = {
  install: ['install', 'setup', 'postinstall'],
  dev: ['dev', 'start', 'serve', 'watch'],
  build: ['build', 'compile', 'dist'],
  test: ['test', 'test:unit', 'test:e2e', 'tests'],
  lint: ['lint', 'eslint', 'lint:fix', 'lintfix'],
  format: ['format', 'prettier', 'fmt'],
  typecheck: ['typecheck', 'tsc', 'type-check', 'check-types', 'ts:check'],
};

function pickScript(scripts, purpose) {
  if (!scripts) return null;
  for (const alias of SCRIPT_ALIASES[purpose]) {
    if (scripts[alias]) return `npm run ${alias}${purpose === 'install' ? '' : ''}`;
  }
  return null;
}

function ciCommands(root) {
  // Pull `run:` lines out of GitHub workflow files (regex, no YAML dep).
  const dir = path.join(root, '.github', 'workflows');
  const found = [];
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml')); } catch { return found; }
  for (const f of files) {
    const text = readIf(path.join(dir, f));
    if (!text) continue;
    for (const m of text.matchAll(/^\s*(?:-\s+)?run:\s*(.+)$/gm)) {
      const cmd = m[1].trim();
      if (/^(npm|pnpm|yarn|bun|python|pytest|go|cargo|make|just|uv|ruff|poetry)\b/.test(cmd)) found.push(cmd);
    }
  }
  return [...new Set(found)];
}

function makeTargets(root) {
  const mk = readIf(path.join(root, 'Makefile'));
  if (!mk) return [];
  const targets = [];
  for (const line of mk.split('\n')) {
    const m = line.match(/^([a-zA-Z0-9][a-zA-Z0-9_-]*):/);
    if (m && !['PHONY', 'SUFFIXES', 'DEFAULT_GOAL'].includes(m[1].toUpperCase())) targets.push(m[1]);
  }
  return [...new Set(targets)];
}

function nodeCommands(root, profile) {
  const pkg = readJson(path.join(root, 'package.json'));
  if (!pkg) return [];
  const pm = profile.packageManagers[0] || 'npm';
  const install = pm === 'npm' ? 'npm install' : `${pm} install`;
  const cmds = [
    { purpose: 'install', cmd: install, source: 'verified (package.json + lockfile)' },
    { purpose: 'dev', cmd: pickScript(pkg.scripts, 'dev'), source: 'verified (package.json scripts)' },
    { purpose: 'build', cmd: pickScript(pkg.scripts, 'build'), source: 'verified (package.json scripts)' },
    { purpose: 'test', cmd: pickScript(pkg.scripts, 'test'), source: 'verified (package.json scripts)' },
    { purpose: 'lint', cmd: pickScript(pkg.scripts, 'lint'), source: 'verified (package.json scripts)' },
    { purpose: 'format', cmd: pickScript(pkg.scripts, 'format'), source: 'verified (package.json scripts)' },
    { purpose: 'typecheck', cmd: pickScript(pkg.scripts, 'typecheck'), source: 'verified (package.json scripts)' },
  ].filter((c) => c.cmd);
  return cmds;
}

function pythonCommands(root, profile) {
  if (!profile.hasPyproject && !fs.existsSync(path.join(root, 'requirements.txt'))) return [];
  const usePoetry = profile.packageManagers.includes('poetry');
  const useUv = profile.packageManagers.includes('uv');
  const pre = usePoetry ? 'poetry run ' : useUv ? 'uv run ' : '';
  const install = usePoetry ? 'poetry install' : useUv ? 'uv sync' : 'pip install -r requirements.txt';
  const cmds = [{ purpose: 'install', cmd: install, source: 'verified (lockfile)' }];
  if (readIf(path.join(root, 'pyproject.toml'))?.match(/\[tool\.pytest/) || fs.existsSync(path.join(root, 'tests'))) {
    cmds.push({ purpose: 'test', cmd: `${pre}pytest`, source: 'verified (pytest config)' });
  }
  if (readIf(path.join(root, 'pyproject.toml'))?.match(/\[tool\.ruff/)) {
    cmds.push({ purpose: 'lint', cmd: `${pre}ruff check .`, source: 'verified (pyproject [tool.ruff])' });
    cmds.push({ purpose: 'format', cmd: `${pre}ruff format .`, source: 'verified (pyproject [tool.ruff])' });
  }
  return cmds;
}

function goCommands(root) {
  if (!fs.existsSync(path.join(root, 'go.mod'))) return [];
  return [
    { purpose: 'install', cmd: 'go mod download', source: 'verified (go.mod)' },
    { purpose: 'build', cmd: 'go build ./...', source: 'verified (go.mod)' },
    { purpose: 'test', cmd: 'go test ./...', source: 'verified (go.mod)' },
    { purpose: 'lint', cmd: 'go vet ./...', source: 'verified (go.mod)' },
  ];
}

function rustCommands(root) {
  if (!fs.existsSync(path.join(root, 'Cargo.toml'))) return [];
  const cmds = [
    { purpose: 'install', cmd: 'cargo fetch', source: 'verified (Cargo.toml)' },
    { purpose: 'build', cmd: 'cargo build', source: 'verified (Cargo.toml)' },
    { purpose: 'test', cmd: 'cargo test', source: 'verified (Cargo.toml)' },
  ];
  const toml = readIf(path.join(root, 'Cargo.toml'));
  if (toml && toml.includes('[lints]')) cmds.push({ purpose: 'lint', cmd: 'cargo clippy', source: 'verified (Cargo.toml [lints])' });
  return cmds;
}

function extract(root, profile) {
  let cmds = [
    ...nodeCommands(root, profile),
    ...pythonCommands(root, profile),
    ...goCommands(root),
    ...rustCommands(root),
  ];

  // Upgrade confidence with CI evidence: "and it actually runs in CI"
  const norm = (c) => c.replace(/^npm run /, '').replace(/^npm /, '').replace(/^(pnpm|yarn|bun) run /, '').replace(/^(poetry run|uv run) /, '');
  const ci = ciCommands(root);
  const ciKeys = new Set(ci.map((c) => norm(c)));
  for (const c of cmds) {
    if (ciKeys.has(norm(c.cmd))) c.source = 'verified (manifest + runs in CI)';
  }
  // Add CI-only commands we couldn't infer from manifests
  for (const k of ci) {
    if (!cmds.some((c) => c.cmd === k)) cmds.push({ purpose: 'ci', cmd: k, source: 'seen in CI' });
  }
  // Document remaining package.json scripts as misc so the doc covers everything that exists
  const pkg = readJson(path.join(root, 'package.json'));
  if (pkg && pkg.scripts) {
    const covered = new Set(cmds.map((c) => c.cmd.replace(/^npm run /, '')));
    const internal = new Set(['postinstall', 'preinstall', 'prepack', 'postpack', 'prepare', 'prepublishOnly', 'version', 'postversion']);
    for (const [name] of Object.entries(pkg.scripts)) {
      if (!covered.has(name) && !internal.has(name)) {
        cmds.push({ purpose: 'misc', cmd: `npm run ${name}`, source: 'verified (package.json scripts)' });
      }
    }
  }
  if (!cmds.length && profile.infra.makefile) {
    const targets = makeTargets(root).filter((t) => ['test', 'build', 'lint', 'run', 'install', 'check', 'dev'].includes(t));
    cmds = targets.map((t) => ({ purpose: t, cmd: `make ${t}`, source: 'verified (Makefile)' }));
  }
  // dedupe by cmd
  const seen = new Set();
  return cmds.filter((c) => (seen.has(c.cmd) ? false : (seen.add(c.cmd), true)));
}

module.exports = { extract, ciCommands, makeTargets };
