---
name: repo-ready
description: Generate or audit AGENTS.md/CLAUDE.md for any repository so AI agents get accurate project context. Use when the user asks to "onboard this repo to agents", "generate AGENTS.md", "create CLAUDE.md", "make the repo agent-ready", or complains that the agent doesn't understand the project / keeps using wrong commands.
---

# Repo Ready

Make any repository legible to AI agents: a truthful AGENTS.md (commands, stack, layout, guardrails, definition-of-done) generated from what is actually in the repo, plus a drift audit.

## When to use

- User asks to generate/create/update AGENTS.md or CLAUDE.md
- User says the agent "doesn't understand the project" or uses wrong commands
- After adding CI, scripts, or new top-level directories to a repo

## How to use

Zero dependencies. **No GitHub CLI (`gh`) and no network needed** — when installed as a plugin, run the bundled CLI through the plugin root token:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/repo-ready.js" <cmd>
```

Standalone (outside a plugin): `npx github:temmeik/repo-ready <cmd>` (Node ≥ 18).

Commands:

```bash
# 1. See what would be documented (no files written)
... scan

# 2. Generate AGENTS.md + CLAUDE.md
... init

# 3. Any time later — audit for drift (exit code 1 = unhealthy)
... check

# 4. Regenerate after the project evolved (manual notes outside the
#    <!-- repo-ready:auto --> markers are preserved)
... update
```

Optional: expose as MCP tools instead (`claude mcp add repo-ready -- npx github:temmeik/repo-ready mcp`).

## Agent procedure

1. Run `scan` first and READ the output — verify the detected commands make sense before writing anything.
2. Run `init`. If it refuses because a hand-written AGENTS.md exists, show the user the conflict and ask: merge via `update` (safe, preserves manual notes) or `--force` (overwrites).
3. After generating, open AGENTS.md and improve two sections by hand (inside the file, outside the auto markers, or by editing the auto block once and accepting it):
   - "What this project is" — one honest paragraph based on reading the code, not the package.json description.
   - Add any gotchas you noticed (codegen steps, ordering requirements, flaky tests) under "Do not touch".
4. Run `check` to confirm the result is healthy (score ≥ 90).
5. Never edit files under the auto markers manually except through `update` — hand-edits there get lost.

## Notes

- Confidence column matters: `verified (manifest + runs in CI)` beats `verified (package.json scripts)`. Prefer CI-backed commands when advising the user.
- If `check` reports documented commands that no longer exist, fix AGENTS.md via `update`, don't patch scripts to match stale docs.
