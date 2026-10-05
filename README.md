<div align="center">

# 🩺 repo-ready

**The doctor your repo needs before AI agents move in.**

One command generates a **truthful** `AGENTS.md` + `CLAUDE.md` from what's actually in your repository — commands proven by CI, real directory map, env vars, guardrails, definition-of-done.
A second command **audits** them for drift, so your agent docs never rot again.

[![License: MIT](https://img.shields.io/badge/License-MIT-34d399.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-34d399.svg)](https://nodejs.org)
[![Zero dependencies](https://img.shields.io/badge/npm%20dependencies-0-34d399.svg)](#why)
[![Works with](https://img.shields.io/badge/works%20with-Claude%20Code%20·%20Codex%20·%20Cursor-8b5cf6.svg)](#plug-into-your-agent)

`npx repo-ready init` · `npx repo-ready check` · ships as CLI, Agent Skill and MCP server

[Why](#why) · [Quick start](#quick-start) · [Check mode](#the-check-mode-️) · [MCP & Skill](#plug-into-your-agent)

</div>

---

## Why

Every AI coding agent asks the same first question: *"what is this project and how do I run it?"*
Today you answer it by hand-writing `AGENTS.md` — and then it silently rots: scripts get renamed, CI changes, folders appear.

**repo-ready fixes both ends:**

1. **`init`** — generates agent docs from *evidence*: manifests, lockfiles, CI workflows, Makefiles — with a **confidence column**. "verified (manifest + runs in CI)" beats a hallucinated guess every day.
2. **`check`** — audits existing docs against the live repo: dead commands, undocumented scripts, new directories, CI drift. Exit code 1 = unhealthy → drop it into CI.

```
  ✅ Repo health: HEALTHY (100/100)

   ✅ repo-ready managed (v0.1.0)
   ✅ command OK: `npm run test`
   ⚠️  package.json has scripts not documented in AGENTS.md: `db:migrate`
   ❌  documented command `npm run ghost` no longer exists in package.json scripts
```

## Quick start

Zero dependencies, zero config:

```bash
cd your-repo
npx repo-ready scan      # see what it detected — no files written
npx repo-ready init      # generate AGENTS.md + CLAUDE.md
npx repo-ready check     # audit any time (CI-friendly exit codes)
npx repo-ready update    # regenerate after the project evolved
```

What `init` writes (example from a real repo):

```markdown
## Commands

| Purpose | Command | Confidence |
|---|---|---|
| install  | `npm install`    | verified (package.json + lockfile) |
| dev      | `npm run dev`    | verified (package.json scripts)    |
| test     | `npm run test`   | verified (manifest + runs in CI)   |

## Repository layout

src/ — application source code
public/ — static assets served as-is
scripts/ — utility / maintenance scripts

## Environment variables
- `DATABASE_URL` — no default, must be set

## Do not touch
- `dist/` is generated — never edit or commit it
- `.env` holds real secrets — never read it, commit it, or echo it

## Definition of done
- Run `npm run test` and make it pass before claiming a task is done
- Do not commit unless the user asked for a commit
```

**Hand-written notes survive.** Everything repo-ready owns sits between `<!-- repo-ready:auto-start -->` markers — your own paragraphs above and below them are kept on every `update`. A foreign (hand-written) `AGENTS.md` is never overwritten without `--force`.

### What it detects

| | |
|---|---|
| **Languages** | JS/TS, Python, Go, Rust, Java, Ruby, PHP, C/C++, Vue, Svelte, … (extension census) |
| **Package managers** | npm / pnpm / yarn / bun, poetry / uv / pipenv / pip, cargo, go modules |
| **Frameworks** | Next.js, React, Vue, Express, Fastify, NestJS, FastAPI, Django, Flask, Gin, axum, … |
| **Commands** | from `package.json` scripts, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Makefile` |
| **CI evidence** | parses `.github/workflows` and upgrades commands to *“runs in CI”* |
| **Guardrails** | generated dirs, lockfiles, `.env`, published-package versioning |

## The check mode 🩺

```bash
npx repo-ready check && echo "docs are honest" || echo "docs rotted"
```

Verifies that every documented command still exists, flags scripts/dirs missing from the docs, compares against what CI actually runs, and scores the result 0–100 (`healthy ≥ 90`, `stale`, `critical`). Non-zero exit on anything but healthy — wire it into CI and your agent docs can never silently rot again.

## Plug into your agent

### ZCode / Claude Code — as a plugin (recommended)

Add this repo as a plugin marketplace and install — you get the skill, a `/repo-ready` command and the MCP server in one shot:

- **ZCode:** Plugin Marketplace → Add → paste `temmeik/repo-ready` → install **Repo Ready**
- **Claude Code:** `claude plugin marketplace add temmeik/repo-ready` → `/plugin install repo-ready@repo-ready`

### As an Agent Skill (manual)

Copy [`skills/repo-ready/SKILL.md`](skills/repo-ready/SKILL.md) into your skills directory:
`~/.claude/skills/repo-ready/SKILL.md` — then just ask the agent to *"make this repo agent-ready"*.

### As an MCP server

```bash
# Claude Code
claude mcp add repo-ready -- npx github:temmeik/repo-ready mcp

# Codex (~/.codex/config.toml)
[mcp_servers.repo-ready]
command = "npx"
args = ["github:temmeik/repo-ready", "mcp"]
```

Tools exposed: `repo_scan` · `repo_generate` · `repo_check`

## Monorepo? Rust? Python?

Yes. Workspaces, Turborepo and pnpm-workspace are detected; Go/Rust/Python get native command sets (`go test ./...`, `cargo test`, `poetry run pytest`) — all covered by 41 e2e assertions in [`test/e2e.js`](test/e2e.js), including a run against this repo's own sister project.

## License

MIT — do whatever you want, a star is appreciated ⭐
