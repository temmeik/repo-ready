'use strict';
// Repo structure: annotated tree, env vars, "do not touch" guardrails.
const fs = require('fs');
const path = require('path');
const { readIf } = require('./detect');

const KNOWN_DIRS = {
  src: 'application source code',
  lib: 'library code',
  app: 'application code',
  api: 'API routes / handlers',
  routes: 'API routes',
  server: 'server-side code',
  client: 'client-side code',
  web: 'web frontend',
  ui: 'UI components',
  components: 'UI components',
  pages: 'routed pages',
  views: 'views / templates',
  public: 'static assets served as-is',
  static: 'static assets',
  assets: 'assets',
  tests: 'test suite',
  test: 'test suite',
  __tests__: 'test suite',
  e2e: 'end-to-end tests',
  spec: 'test suite',
  scripts: 'utility / maintenance scripts',
  tools: 'developer tooling',
  docs: 'documentation',
  examples: 'usage examples',
  migrations: 'DB migrations',
  db: 'database layer',
  models: 'data models',
  services: 'service layer',
  utils: 'shared utilities',
  helpers: 'shared helpers',
  config: 'configuration',
  '.github': 'CI workflows & repo config',
  bin: 'executable entry points',
  cmd: 'Go binaries (per-directory main packages)',
  internal: 'Go internal packages (not importable externally)',
  pkg: 'Go public library packages',
  crates: 'Rust workspace crates',
  skill: 'agent skill definition',
};

function scanTree(root, maxDepth = 2) {
  const lines = [];
  function walk(dir, prefix, depth) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entries = entries.filter((e) => !['node_modules', '.git', 'dist', 'build', 'target', '__pycache__', '.venv', 'venv', '.next', 'coverage'].includes(e.name) && !e.name.startsWith('.git') && !/\.(log|tmp)$/.test(e.name) && e.name !== '.DS_Store');
    entries.sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1));
    for (const e of entries) {
      if (depth > maxDepth) continue;
      const note = e.isDirectory() ? KNOWN_DIRS[e.name] : null;
      const isDir = e.isDirectory();
      lines.push(`${prefix}${e.name}${isDir ? '/' : ''}${note ? ` — ${note}` : ''}`);
      if (isDir && depth < maxDepth) walk(path.join(dir, e.name), prefix + '  ', depth + 1);
    }
  }
  lines.push(`${path.basename(path.resolve(root))}/`);
  walk(root, '', 0);
  return lines.join('\n');
}

function envVars(root) {
  const file = ['.env.example', '.env.sample', '.env.template'].map((f) => path.join(root, f)).find((p) => fs.existsSync(p));
  if (!file) return [];
  const out = [];
  for (const line of readIf(file).split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) {
      const comment = line.trim().startsWith('#') ? line.trim().replace(/^#\s*/, '') : null;
      out.push({ key: m[1], hasValue: m[2].trim().length > 0, comment });
    }
  }
  return out;
}

function guardrails(root) {
  const out = [];
  for (const d of ['dist', 'build', 'out', 'target', '.next', 'coverage']) {
    if (fs.existsSync(path.join(root, d))) out.push(`\`${d}/\` is generated — never edit or commit it`);
  }
  for (const f of ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'poetry.lock', 'uv.lock', 'Cargo.lock', 'go.sum']) {
    if (fs.existsSync(path.join(root, f))) out.push(`\`${f}\` is managed by the package manager — don't hand-edit`);
  }
  if (fs.existsSync(path.join(root, '.env'))) out.push('`.env` holds real secrets — never read it, commit it, or echo it');
  const pkg = (() => { try { return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); } catch { return null; } })();
  if (pkg && pkg.name && fs.existsSync(path.join(root, 'src', 'version.js')) === false && pkg.private !== true) {
    // published package — version bumps go through npm
    out.push('this package is published to npm — bump the version in `package.json`, don\'t hardcode versions elsewhere');
  }
  return [...new Set(out)];
}

module.exports = { scanTree, envVars, guardrails, KNOWN_DIRS };
