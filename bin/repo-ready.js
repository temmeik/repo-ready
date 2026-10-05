#!/usr/bin/env node
'use strict';
// repo-ready CLI — zero dependencies.
const fs = require('fs');
const path = require('path');
const { detect } = require('../src/detect');
const { extract } = require('../src/commands');
const { scanTree, envVars, guardrails } = require('../src/structure');
const gen = require('../src/generate');
const { check, format } = require('../src/check');

const C = {
  green: (s) => `\x1b[32m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m`, yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

const BANNER = `
  ${C.green('██████╗ ')} ${C.bold('repo-ready')}${C.dim('  v' + gen.VERSION)}
  ${C.green('██╔══██╗')} the doctor your repo needs before AI agents move in
  ${C.green('██║  ██║')} generates & audits ${C.cyan('AGENTS.md')} + ${C.cyan('CLAUDE.md')}
  ${C.green('╚═╝  ╚═╝ ')}
`;

function collect(root) {
  const profile = detect(root);
  return {
    profile,
    commands: extract(root, profile),
    tree: scanTree(root),
    envs: envVars(root),
    guards: guardrails(root),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args.find((a) => !a.startsWith('--')) || 'help';
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const dirArg = args[args.indexOf(cmd) + 1];
  const root = dirArg && !dirArg.startsWith('--') ? path.resolve(dirArg) : process.cwd();

  if (cmd === 'help' || flags.has('--help') || flags.has('-h')) {
    console.log(BANNER);
    console.log(`  ${C.bold('Usage:')} npx repo-ready <command> [dir]

  ${C.cyan('init')}      generate AGENTS.md + CLAUDE.md (merges if ours exists; --force overwrites foreign files)
  ${C.cyan('update')}    regenerate the managed block, keeping your manual notes outside the markers
  ${C.cyan('check')}     audit existing AGENTS.md: stale commands, missing docs, drift (exit 1 if unhealthy)
  ${C.cyan('scan')}      print what repo-ready detected, no files written
  ${C.cyan('mcp')}       run as an MCP server (stdio) for Claude Code / Codex

  Flags: --json   machine-readable output
         --force  overwrite existing files
         --dry-run  print result, write nothing
`);
    return;
  }

  if (cmd === 'scan') {
    const ctx = collect(root);
    if (flags.has('--json')) { console.log(JSON.stringify(ctx.profile, null, 2)); return; }
    console.log(BANNER);
    console.log(`  ${C.bold(ctx.profile.name)}${ctx.profile.description ? C.dim(' — ' + ctx.profile.description) : ''}\n`);
    console.log(`  ${C.bold('Languages:')}  ${ctx.profile.langs.map((l) => `${l.lang} (${l.pct}%)`).join(', ') || '?'}`);
    console.log(`  ${C.bold('Frameworks:')} ${ctx.profile.frameworks.join(', ') || C.dim('none detected')}`);
    console.log(`  ${C.bold('Tooling:')}    ${ctx.profile.tools.join(', ') || C.dim('none detected')}`);
    console.log(`  ${C.bold('Pkg managers:')}${ctx.profile.packageManagers.join(', ') || '?'}`);
    if (ctx.profile.monorepo) console.log(`  ${C.bold('Monorepo:')}   ${ctx.profile.monorepo.kind} (${ctx.profile.monorepo.packages.length} packages)`);
    console.log(`  ${C.bold('Infra:')}      ${Object.entries(ctx.profile.infra).filter(([, v]) => v).map(([k]) => k).join(', ')}`);
    console.log(`\n  ${C.bold('Commands found:')}`);
    for (const c of ctx.commands) console.log(`   ${C.green('•')} ${c.purpose.padEnd(10)} ${C.cyan(c.cmd)}  ${C.dim('— ' + c.source)}`);
    if (ctx.envs.length) console.log(`\n  ${C.bold('Env vars:')}     ${ctx.envs.map((e) => e.key).join(', ')}`);
    console.log('');
    return;
  }

  if (cmd === 'init' || cmd === 'update') {
    const ctx = collect(root);
    try {
      const res = gen.write(root, { ...ctx, merge: cmd === 'update', force: flags.has('--force') });
      if (flags.has('--json')) { console.log(JSON.stringify({ ok: true, ...res })); return; }
      console.log(BANNER);
      console.log(`  ${C.green('✔')} wrote ${C.cyan(path.relative(root, res.agentsPath))}${res.mergedWithManual ? C.dim(' (merged — manual notes preserved)') : ''}`);
      if (res.claudePath) console.log(`  ${C.green('✔')} wrote ${C.cyan(path.relative(root, res.claudePath))}`);
      console.log(`\n  ${ctx.commands.length} commands documented · ${ctx.envs.length} env vars · ${ctx.guards.length} guardrails`);
      console.log(`  ${C.dim('next:')} run ${C.cyan('npx repo-ready check')} any time to catch drift\n`);
    } catch (e) {
      if (e.code === 'EXISTS') {
        console.error(`  ${C.red('✖')} ${e.message}`);
        process.exit(2);
      }
      throw e;
    }
    return;
  }

  if (cmd === 'check') {
    const ctx = collect(root);
    const report = check(root, ctx.profile, ctx.commands);
    if (flags.has('--json')) { console.log(JSON.stringify(report, null, 2)); return; }
    console.log(format(report));
    if (report.verdict !== 'healthy') process.exit(1);
    return;
  }

  if (cmd === 'mcp') {
    require('../src/mcp').serveStdio();
    return;
  }

  console.error(`  ${C.red('unknown command:')} ${cmd} — try --help`);
  process.exit(2);
}

main().catch((e) => { console.error(e); process.exit(1); });
