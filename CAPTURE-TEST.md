# CAPTURE-TEST

Proof that agent capture is working before the build.

## Tool + model

- **Tool:** Claude Code (Claude desktop app, Code tab)
- **Model:** `claude-opus-4-8` (Opus 4.8) — planning + execution
- Captured to: `.agent-logs/YYYY-MM-DD_HH-MM-SS_<session-id>.md`, one file per session.

## Mechanism (two automatic paths, both committed)

Capture records only the **prompt** and the **final response** per turn (no thinking,
no tool calls, no intermediate steps), derived from the session transcript.

1. **`.claude/settings.json` hooks** → `scripts/agent-capture.mjs`
   Wired to `UserPromptSubmit` + `Stop`. Fires on its own for any session that
   **starts after** the hook exists. Each run rebuilds that session's log from the
   session transcript (`.jsonl`), so it is idempotent and self-healing.

2. **`scripts/agent-capture-watch.mjs`** (transcript watcher)
   For the session that *created* the rig, whose hook loaded **before**
   `settings.json` existed. Started once in the background; watches the live
   transcript (`fs.watchFile` + 4s interval) and re-runs the capture on every
   change. Automatic ("fires on its own"), as-you-go, no manual step.

The 8x spec allows any mechanism that fires on its own and explicitly suggests
reading the tool's on-disk session file — which is exactly what both paths do.

## Config files changed

- `.claude/settings.json` — the hooks
- `scripts/agent-capture.mjs` — transcript → log extractor
- `scripts/agent-capture-watch.mjs` — background watcher for this session

## Log file the entries landed in

`.agent-logs/2026-09-15_18-30-48_1baec498-0a2f-4acf-b0f4-39d97a7bc0fa.md`
— 19 exchanges at first commit and growing as the build proceeds.

## Real captured entry, pasted raw

```
[LOG_ENTRY type=PROMPT num=17 session=1baec498]
timestamp: 2026-09-16T10:20:12.084Z
model: claude-opus-4-8

logged in, verify with vercel whoami


[LOG_ENTRY type=RESPONSE num=17 session=1baec498]
timestamp: 2026-09-16T10:20:30.519Z
model: claude-opus-4-8

Verified — logged in as **`mp051998`** ✓. Vercel's fully set up and the build
session inherits it automatically. ...
```

## What I tried first that did not work

- **Session-start hook alone.** I installed the `.claude/settings.json` hook, but
  this session had already started before the file existed, so the hook never
  loaded and `.agent-logs/` stayed empty for this session (verified: an `ls`
  showed nothing for this session id). A session-start hook cannot retroactively
  capture the session that set it up.
- **Fix:** the transcript watcher above reads the on-disk session file the hook
  would have read, so the current session is captured automatically without a
  restart — and the committed `.claude/settings.json` hook captures every future
  session from its start.
- The extractor was self-tested against a synthetic transcript first, confirming
  it excludes thinking / tool-calls / tool-output (no secrets leak) and is
  idempotent before it was pointed at the real session.
