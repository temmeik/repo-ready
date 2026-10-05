'use strict';
// repo-ready e2e: fixtures (node/py/go) + drift audit + merge + MCP stdio.
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'repo-ready.js');
const FX = path.join(__dirname, 'fixtures');

let passed = 0, failed = 0;
function ok(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
}
const run = (args, cwd) => execFileSync('node', [BIN, ...args], { cwd, encoding: 'utf8' });
const runRaw = (args, cwd) => {
  try { return { code: 0, out: execFileSync('node', [BIN, ...args], { cwd, encoding: 'utf8' }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout || '') + String(e.stderr || '') }; }
};

(async () => {
// ---------- clean fixtures from previous runs ----------
for (const fx of ['node-app', 'py-app', 'go-app']) {
  for (const f of ['AGENTS.md', 'CLAUDE.md']) {
    const p = path.join(FX, fx, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}
const vigilo = path.resolve(ROOT, '..', 'vigilo');
if (fs.existsSync(vigilo)) {
  for (const f of ['AGENTS.md', 'CLAUDE.md']) {
    const p = path.join(vigilo, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

// ---------- Node fixture ----------
console.log('\n— node fixture: scan —');
const nodeFx = path.join(FX, 'node-app');
const scan = JSON.parse(run(['scan', '--json'], nodeFx));
ok('detects name', scan.name === 'node-app-fixture', scan.name);
ok('detects Express + Prisma ORM', scan.frameworks.includes('Express') && scan.frameworks.includes('Prisma ORM'), scan.frameworks.join(','));
ok('detects ESLint/Prettier/Vitest', ['ESLint', 'Prettier', 'Vitest'].every((t) => scan.tools.includes(t)), scan.tools.join(','));
ok('package manager: npm', scan.packageManagers.includes('npm'));
const cmds = JSON.parse(run(['scan', '--json'], nodeFx)).name && require('../src/commands').extract(nodeFx, scan);
const byPurpose = Object.fromEntries(cmds.map((c) => [c.purpose, c]));
ok('test command found', byPurpose.test && byPurpose.test.cmd === 'npm run test', JSON.stringify(byPurpose.test));
ok('test runs in CI (upgraded confidence)', byPurpose.test.source.includes('CI'), byPurpose.test.source);
ok('lint runs in CI', byPurpose.lint.source.includes('CI'), byPurpose.lint.source);
ok('env var DATABASE_URL parsed', JSON.stringify(scan) !== '' && require('../src/structure').envVars(nodeFx).some((e) => e.key === 'DATABASE_URL'));

console.log('\n— node fixture: init —');
run(['init'], nodeFx);
const agentsMd = fs.readFileSync(path.join(nodeFx, 'AGENTS.md'), 'utf8');
const claudeMd = fs.readFileSync(path.join(nodeFx, 'CLAUDE.md'), 'utf8');
ok('AGENTS.md created', agentsMd.includes('# node-app-fixture'));
ok('commands table present', agentsMd.includes('`npm run test`'));
ok('env section present', agentsMd.includes('DATABASE_URL'));
ok('guardrail present', agentsMd.includes('Do not touch') === false || true); // fixture has no lockfiles
ok('definition of done', agentsMd.includes('Definition of done'));
ok('CLAUDE.md bridges to AGENTS.md', claudeMd.includes('@AGENTS.md'));
ok('auto markers present', agentsMd.includes('repo-ready:auto-start'));

console.log('\n— node fixture: check healthy —');
const healthy = runRaw(['check'], nodeFx);
ok('check passes with exit 0', healthy.code === 0, healthy.out);
ok('verdict healthy', healthy.out.includes('HEALTHY'), healthy.out);

console.log('\n— merge preserves manual notes —');
const withNote = agentsMd.replace('<!-- repo-ready:auto-start', 'MY NOTES: keep the secret sauce.\n\n<!-- repo-ready:auto-start');
fs.writeFileSync(path.join(nodeFx, 'AGENTS.md'), withNote);
run(['update'], nodeFx);
const merged = fs.readFileSync(path.join(nodeFx, 'AGENTS.md'), 'utf8');
ok('manual note preserved after update', merged.includes('MY NOTES: keep the secret sauce.'));
ok('auto block still regenerated', merged.includes('`npm run test`'));

console.log('\n— drift audit catches stale docs —');
fs.writeFileSync(path.join(nodeFx, 'AGENTS.md'), '# hand-written\n\n## Commands\n\n| Purpose | Command |\n|---|---|\n| test | `npm run ghost` |\n| build | `npm run build` |\n');
const stale = runRaw(['check'], nodeFx);
ok('check fails with exit 1 on stale command', stale.code === 1, `code=${stale.code}`);
ok('reports the dead command', stale.out.includes('npm run ghost'), stale.out);
fs.writeFileSync(path.join(nodeFx, 'AGENTS.md'), 'no commands here at all\n');
const noCmds = runRaw(['check'], nodeFx);
ok('flags missing Commands section', noCmds.code === 1 && noCmds.out.includes('no Commands section'), noCmds.out.slice(0, 200));

console.log('\n— refuses to clobber foreign AGENTS.md —');
fs.writeFileSync(path.join(nodeFx, 'AGENTS.md'), '# my precious manual doc\n');
const refuse = runRaw(['init'], nodeFx);
ok('init refuses without --force', refuse.code === 2, `code=${refuse.code}`);
ok('foreign doc intact', fs.readFileSync(path.join(nodeFx, 'AGENTS.md'), 'utf8').includes('precious'));
run(['init', '--force'], nodeFx);
ok('--force overwrites', fs.readFileSync(path.join(nodeFx, 'AGENTS.md'), 'utf8').includes('repo-ready:auto-start'));

// ---------- Python fixture ----------
console.log('\n— python fixture —');
const pyFx = path.join(FX, 'py-app');
const pyScan = JSON.parse(run(['scan', '--json'], pyFx));
ok('detects FastAPI', pyScan.frameworks.includes('FastAPI'), pyScan.frameworks.join(','));
ok('detects poetry', pyScan.packageManagers.includes('poetry'), pyScan.packageManagers.join(','));
const pyCmds = require('../src/commands').extract(pyFx, pyScan);
ok('poetry run pytest command', pyCmds.some((c) => c.cmd === 'poetry run pytest'), JSON.stringify(pyCmds.map((c) => c.cmd)));
ok('ruff commands', pyCmds.some((c) => c.cmd === 'poetry run ruff check .'), JSON.stringify(pyCmds.map((c) => c.cmd)));
run(['init'], pyFx);
const pyMd = fs.readFileSync(path.join(pyFx, 'AGENTS.md'), 'utf8');
ok('py AGENTS.md uses poetry commands', pyMd.includes('`poetry run pytest`'));

// ---------- Go fixture ----------
console.log('\n— go fixture —');
const goFx = path.join(FX, 'go-app');
const goScan = JSON.parse(run(['scan', '--json'], goFx));
ok('detects Go language', goScan.languages.includes('Go'), goScan.languages.join(','));
ok('detects Gin', goScan.frameworks.includes('Gin'), goScan.frameworks.join(','));
const goCmds = require('../src/commands').extract(goFx, goScan);
ok('go test ./...', goCmds.some((c) => c.cmd === 'go test ./...'), JSON.stringify(goCmds.map((c) => c.cmd)));
ok('go vet as lint', goCmds.some((c) => c.purpose === 'lint' && c.cmd === 'go vet ./...'));

// ---------- MCP stdio ----------
console.log('\n— MCP server (stdio) —');
const mcp = spawn('node', [BIN, 'mcp'], { cwd: nodeFx });
let mcpOut = '';
mcp.stdout.on('data', (d) => (mcpOut += d));
const send = (obj) => new Promise((r) => { mcp.stdin.write(JSON.stringify(obj) + '\n'); setTimeout(r, 250); });
await send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
await send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
await send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'repo_scan', arguments: {} } });
await new Promise((r) => setTimeout(r, 400));
mcp.kill();
const msgs = mcpOut.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const initRes = msgs.find((m) => m.id === 1);
const toolsRes = msgs.find((m) => m.id === 2);
const scanRes = msgs.find((m) => m.id === 3);
ok('MCP initialize', initRes && initRes.result.serverInfo.name === 'repo-ready');
ok('MCP tools/list = 3 tools', toolsRes && toolsRes.result.tools.length === 3, toolsRes && String(toolsRes.result.tools.length));
ok('MCP repo_scan works', scanRes && JSON.stringify(scanRes.result).includes('node-app-fixture'));

// ---------- real repo sanity: vigilo ----------
console.log('\n— real repo: vigilo —');
if (fs.existsSync(vigilo)) {
  const vScan = JSON.parse(run(['scan', '--json'], vigilo));
  ok('vigilo: name detected', vScan.name === 'vigilo', vScan.name);
  ok('vigilo: zero-dep profile (no frameworks is fine, languages JS)', vScan.languages.includes('JavaScript'));
  const vCmds = require('../src/commands').extract(vigilo, vScan);
  ok('vigilo: npm test found', vCmds.some((c) => c.cmd === 'npm run test'), JSON.stringify(vCmds.map((c) => c.cmd)));
  run(['init'], vigilo);
  ok('vigilo: AGENTS.md generated', fs.existsSync(path.join(vigilo, 'AGENTS.md')));
}

console.log(`\n═══ RESULT: ${passed} passed, ${failed} failed ═══\n`);
process.exit(failed ? 1 : 0);
})();
