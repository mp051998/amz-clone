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

---

## 2026-09-26: re-verification (gap found and fixed)

### Tool + model

- **Tool:** Claude Code, in the Claude desktop app (Code tab). It has a hook mechanism: `.claude/settings.json` hooks on `UserPromptSubmit` and `Stop`.
- **Model:** `claude-opus-5-5` (Opus 5.5) has planned and executed everything since 2026-09-25 17:43 UTC. Earlier sessions ran on `claude-opus-4-8`. Every entry records its model, so the switch shows in the logs.

### What went wrong

Sessions from 2026-09-16 20:14 UTC onward were opened on the parent folder, `~/personal`, not on `~/personal/amz-clone`. Claude Code loads project hooks from the folder a session is launched in, so this repo's hooks never ran for those sessions. The watcher from the first session had also stopped. Four sessions went unlogged, and so did the tail of `1baec498`.

Auditing the transcripts also turned up bugs in v1 of `scripts/agent-capture.mjs`:

- **Queued prompts dropped.** Prompts typed while the agent was mid-turn (Claude Code queues them) were never logged. Session `e31f7cd6` alone had 12.
- **Interrupted prompts dropped.** A prompt interrupted (Esc) before any text came back was never logged.
- **Notifications logged as prompts.** Background-task notifications would have been logged as if you had typed them.
- **Wrong `last_prompt_time`.** It held the time of the last *response*.

### Fix

`scripts/agent-capture.mjs` v2 (the hooks config is unchanged):

- **Every human prompt is logged,** including queued and interrupted ones. Notifications and local slash-command output are not.
- **What counts as a turn's RESPONSE:** the last text the agent wrote before the earliest of:
  - the turn ending (`end_turn`),
  - the user interrupting it,
  - the next human prompt arriving.
- **Interrupted turns:** the RESPONSE ends with the transcript's own `[Request interrupted by user]` marker.
- **No text came back:** the RESPONSE reads `[no text response]`.
- **Images in prompts** are recorded as `[image: <type>]`.
- **Append-only.** If a rebuild would change anything already written, the existing entries are kept byte-for-byte and only newer turns are appended. Only the frontmatter counters are rewritten.
- **Resumed sessions.** A resumed session's transcript starts with history copied from the earlier session. That history is skipped, since it belongs to the earlier session's log.

All backfill was generated by that script from the raw transcripts (`~/.claude/projects/<folder>/<session-id>.jsonl`). Nothing was hand-written.

| Log | Prompts | Notes |
| --- | --- | --- |
| `2026-09-15_18-30-48_1baec498-….md` | 31 | Committed log. One missed prompt appended (num=31, 2026-09-16 20:13, interrupted). Entries 1–30 are byte-identical. v1's missed queued and interrupted prompts inside 1–30 were **not** inserted, because renumbering committed history would be editing it. Entries 1–4 (2026-09-15 18:30–20:38) were inherited from predecessor session `c9d97306`, which worked in a different repo (`amazon-clone`). |
| `2026-09-16_20-14-30_e31f7cd6-….md` | 23 | Backfilled. |
| `2026-09-17_06-29-12_d850f74a-….md` | 30 | Backfilled. This session resumed `e31f7cd6`; the 271 copied entries at the top of its transcript were skipped. |
| `2026-09-17_07-16-12_89324963-….md` | 6 | Backfilled. |
| `2026-09-25_17-44-11_ff84cad5-….md` | growing | Backfilled, then kept live by the watcher. This session was launched on `~/personal`, so hooks can't load for it. |
| `2026-09-25_18-46-56_f664364f-….md` | 2 | Written by the hooks, since this session was launched on `amz-clone`. See "What failed first". |
| `2026-09-25_19-13-18_c47352f3-….md` | 5 | Written by the hooks: a second session launched on `amz-clone`. Its RESPONSE num=4 and entries num=5 were missing until 2026-09-28. See "What failed first". |

For future sessions, open them on the `amz-clone` folder so the hooks load. For a session already running on a parent folder, run:
`node scripts/agent-capture-watch.mjs <transcript.jsonl> <session-id> <repo-dir>`.

### Secrets check

All logs were scanned for:
- Stripe keys (`sk_`, `rk_`, `whsec_`),
- Supabase secret and publishable keys,
- JWTs,
- GitHub, Vercel and AWS tokens,
- private keys and passwords.

There was one hit: `e31f7cd6` PROMPT num=6 contains a Supabase **anon** key pasted into the prompt. Anon keys are public by design (they ship in browser bundles and are gated by row-level security), and this one belongs to a hosted project that is no longer used. It is left verbatim, because the spec forbids editing prompts.

### What failed first

- **Hooks without the right launch folder.** The hooks were correct, but they only fire for sessions launched on the repo folder. See above.
- **The first v2 build had a bug.** Claude Code writes each content block of a message as its own transcript entry, and every one carries the message's stop reason. The first v2 build closed the turn on the *thinking* block's `end_turn` and never saw the text block after it.
  - For about 15 minutes, while that build was live, the `f664364f` Stop hook wrote a wrong RESPONSE num=2: intermediate text, not the final answer.
  - That file was uncommitted. It was regenerated from the transcript with the fixed script.
  - Entry num=1 matches what v1 had written byte-for-byte.
- **A live watcher can race a turn's final write.** A watcher can read the transcript while a message's blocks are still being appended. A turn's RESPONSE is now only written once something follows the final message in the transcript, or when a hook fires.
- **A turn that ends on an API error fires no `Stop`.** In `c47352f3`, the turn for PROMPT num=4 ended on 2026-09-26 with a synthetic "API Error" message.
  - When `UserPromptSubmit` fired for the next prompt ("Try again"), the script still waited for something to follow that message before closing the turn. `UserPromptSubmit` fires before the new prompt is written to the transcript, so nothing followed, and RESPONSE num=4 was skipped. "Try again" also ended on an API error, so no `Stop` fired after it either.
  - **Fix (2026-09-28):** any hook event now counts as proof that a turn which reached its end is over. Only the watcher still waits.
  - Replaying the transcript as it stood at that hook call reproduces the missing RESPONSE num=4 with the fix, and doesn't without it. The log was then brought up to date append-only: entries 1–4 are unchanged, RESPONSE num=4 and PROMPT/RESPONSE num=5 were added.
- **The watcher dies with the app.** It is a background process of the session that started it. After the desktop app restarted on 2026-09-28 it had to be started again. Any gap is filled on restart, because it rebuilds from the transcript.

### Canary proof

**Canary 1** was sent in session `ff84cad5`, launched on `~/personal` and captured by the watcher. It landed in `.agent-logs/2026-09-25_17-44-11_ff84cad5-9300-4a58-92b1-6b76010ed9cf.md`:

```
[LOG_ENTRY type=PROMPT num=8 session=ff84cad5]
timestamp: 2026-09-25T19:12:03.577Z
model: claude-opus-5-5

CAPTURE TEST — 8x assignment, Monish Prakasan


[LOG_ENTRY type=RESPONSE num=8 session=ff84cad5]
timestamp: 2026-09-25T19:12:26.663Z
model: claude-opus-5-5

Canary 1 prompt landed at `PROMPT num=8` in `.agent-logs/2026-09-25_17-44-11_ff84cad5-….md`, timestamp 2026-09-25T19:12:03.577Z, model `claude-opus-5-5`. My previous reply also landed in full as `RESPONSE num=7`.

This reply becomes `RESPONSE num=8`. The watcher only writes a response once the turn is over, so it will appear a few seconds after I finish. I'll check it's there before pasting both canary entries raw into CAPTURE-TEST.md.

Next: open a **new session on the `amz-clone` folder** and send `CAPTURE TEST — 8x assignment, Monish Prakasan` there. That one goes through the hooks, not the watcher. Then tell me here, and I'll check it landed, update CAPTURE-TEST.md and ask you about commits.
```

**Canary 2** is _pending_. It needs a new session launched on `amz-clone`, which exercises the hooks path.

Session `c47352f3` (launched on `amz-clone`) already shows the hooks capturing a second session, but it holds no canary prompt.
