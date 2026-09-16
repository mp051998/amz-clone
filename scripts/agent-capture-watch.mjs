#!/usr/bin/env node
// agent-capture-watch.mjs — automatic capture for an already-running Claude Code
// session whose `.claude/settings.json` hook loaded before the hook existed.
//
// The 8x spec permits any mechanism that "fires on its own" and explicitly
// suggests reading the tool's on-disk session file. This watches the live
// session transcript (.jsonl) and re-runs scripts/agent-capture.mjs on every
// change (and on a short interval), so .agent-logs/ stays current as the
// session progresses — no manual step, no one-lump backfill. It derives from
// the immutable transcript, so it never hand-edits history.
//
// Usage: node agent-capture-watch.mjs <transcriptPath> <sessionId> <projectDir>
// Run once in the background for the lifetime of the session.

import { watchFile } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const [, , transcriptPath, sessionId, projectDir] = process.argv;
if (!transcriptPath || !sessionId || !projectDir) {
  console.error('usage: node agent-capture-watch.mjs <transcriptPath> <sessionId> <projectDir>');
  process.exit(1);
}

const script = join(dirname(fileURLToPath(import.meta.url)), 'agent-capture.mjs');
const stdin = JSON.stringify({ session_id: sessionId, transcript_path: transcriptPath, cwd: projectDir });

function capture() {
  spawnSync('node', [script], {
    input: stdin,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    stdio: ['pipe', 'ignore', 'ignore'],
  });
}

capture(); // catch up immediately
watchFile(transcriptPath, { interval: 4000 }, capture); // then on every change
console.log(`agent-capture-watch: watching ${transcriptPath} -> ${projectDir}/.agent-logs/`);
