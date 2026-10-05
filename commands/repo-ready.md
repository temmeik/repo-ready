---
description: Generate or audit AGENTS.md/CLAUDE.md for the current repository
---

Run the repo-ready CLI against the current working directory and report the results.

**No GitHub CLI (`gh`) and no network are needed.** The CLI is a plain Node.js script bundled with this plugin. Run it via the plugin root token:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/repo-ready.js" <cmd>
```

(Standalone fallback, if the token is not substituted: `npx github:temmeik/repo-ready <cmd>`. Requires Node ≥ 18.)

Steps:

1. First run `scan` and review what was detected: languages, frameworks, commands and their confidence. Sanity-check that the detected commands make sense before writing anything.
2. Then run `init` to generate AGENTS.md and CLAUDE.md. If it refuses because a hand-written AGENTS.md exists, ask the user whether to merge with `update` (preserves manual notes outside the auto markers) or overwrite with `--force` — do not decide for them.
3. Finish with `check` and show the health report (score 0-100).
4. Summarize: what was generated, the health score, and one thing the user should hand-improve (the project description paragraph).

Never edit content between the `<!-- repo-ready:auto -->` markers by hand — those are owned by the generator.
