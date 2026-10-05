'use strict';
// repo-ready as an MCP server (stdio) — plug into Claude Code or Codex:
//   claude mcp add repo-ready -- npx repo-ready mcp
//   (codex) mcp_servers.repo-ready = { command = "npx", args = ["repo-ready", "mcp"] }
const readline = require('readline');
const path = require('path');
const { detect } = require('./detect');
const { extract } = require('./commands');
const { scanTree, envVars, guardrails } = require('./structure');
const gen = require('./generate');
const { check } = require('./check');

function collect(root) {
  const profile = detect(root);
  return { profile, commands: extract(root, profile), tree: scanTree(root), envs: envVars(root), guards: guardrails(root) };
}

function text(obj) {
  return { content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] };
}

const TOOLS = [
  {
    name: 'repo_scan',
    description: 'Scan a repository: languages, frameworks, package managers, runnable commands (with confidence), env vars, guardrails. Read-only.',
    inputSchema: { type: 'object', properties: { root: { type: 'string', description: 'Repo path, defaults to cwd' } } },
  },
  {
    name: 'repo_generate',
    description: 'Generate AGENTS.md + CLAUDE.md for a repo (merges with existing repo-ready block, preserves manual notes). Returns what was written.',
    inputSchema: { type: 'object', properties: { root: { type: 'string' }, force: { type: 'boolean' } } },
  },
  {
    name: 'repo_check',
    description: 'Health-check an existing AGENTS.md: stale commands, missing scripts/dirs in docs, CI drift. Returns score 0-100 and issues.',
    inputSchema: { type: 'object', properties: { root: { type: 'string' } } },
  },
];

function callTool(name, args) {
  const root = path.resolve((args && args.root) || process.cwd());
  if (name === 'repo_scan') {
    const ctx = collect(root);
    return text({ name: ctx.profile.name, description: ctx.profile.description, languages: ctx.profile.langs, frameworks: ctx.profile.frameworks, tools: ctx.profile.tools, packageManagers: ctx.profile.packageManagers, monorepo: ctx.profile.monorepo, commands: ctx.commands, envVars: ctx.envs.map((e) => e.key), guardrails: ctx.guards });
  }
  if (name === 'repo_generate') {
    const ctx = collect(root);
    const res = gen.write(root, { ...ctx, merge: true, force: !!args.force });
    return text({ ok: true, wrote: res });
  }
  if (name === 'repo_check') {
    const ctx = collect(root);
    return text(check(root, ctx.profile, ctx.commands));
  }
  return text({ error: `unknown tool: ${name}` });
}

function serveStdio() {
  const rl = readline.createInterface({ input: process.stdin });
  const write = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
  rl.on('line', (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    const { id, method, params } = msg;
    switch (method) {
      case 'initialize':
        return write({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'repo-ready', version: gen.VERSION } } });
      case 'notifications/initialized':
        return;
      case 'tools/list':
        return write({ jsonrpc: '2.0', id, result: { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) } });
      case 'tools/call':
        try {
          return write({ jsonrpc: '2.0', id, result: callTool(params.name, params.arguments) });
        } catch (e) {
          return write({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `error: ${e.message}` }], isError: true } });
        }
      case 'ping':
        return write({ jsonrpc: '2.0', id, result: {} });
      default:
        if (id !== undefined) write({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } });
    }
  });
}

module.exports = { serveStdio, callTool, TOOLS };
