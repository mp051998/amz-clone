#!/usr/bin/env node
// agent-capture.mjs — 8x agent-capture hook for Claude Code.
//
// Wired to UserPromptSubmit + Stop in .claude/settings.json. On each event it
// rebuilds the CURRENT session's .agent-logs/<...>.md file from the session's
// authoritative transcript (.jsonl, path supplied by the hook on stdin),
// capturing ONLY the human prompt and the final text response per turn — no
// thinking, no tool calls, no intermediate steps (per the 8x spec).
//
// Deriving from the immutable transcript makes it idempotent and self-healing:
// a re-run reproduces past entries exactly and only appends new ones, so it
// never hand-edits history. Always exits 0 so a logging hiccup can't block the
// session.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const AUTHOR = 'mp051998';
const PROJECT = 'nile-store';
const TOOL = 'claude-code';

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

/** Normalise a user message's content to plain text + flag tool results. */
function normUserContent(content) {
  if (typeof content === 'string') return { text: content, hasToolResult: false };
  if (!Array.isArray(content)) return { text: '', hasToolResult: false };
  let text = '';
  let hasToolResult = false;
  for (const b of content) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'text' && typeof b.text === 'string') text += b.text;
    else if (b.type === 'tool_result') hasToolResult = true;
  }
  return { text, hasToolResult };
}

/** Extract only the visible text blocks from an assistant message. */
function assistantText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  let text = '';
  for (const b of content) {
    if (b && b.type === 'text' && typeof b.text === 'string') text += b.text;
  }
  return text;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function main() {
  const hook = (() => {
    try {
      return JSON.parse(readStdin());
    } catch {
      return {};
    }
  })();

  const transcriptPath = hook.transcript_path || process.env.CLAUDE_TRANSCRIPT_PATH;
  const sessionId = hook.session_id || 'unknown-session';
  const projectDir = process.env.CLAUDE_PROJECT_DIR || hook.cwd || process.cwd();
  if (!transcriptPath) return;

  let rawLines;
  try {
    rawLines = readFileSync(transcriptPath, 'utf8').split('\n');
  } catch {
    return;
  }

  const entries = [];
  for (const line of rawLines) {
    const s = line.trim();
    if (!s) continue;
    try {
      entries.push(JSON.parse(s));
    } catch {
      /* ignore malformed lines */
    }
  }

  // Fold the transcript into turns: each human prompt -> the final assistant
  // text that closes that turn (later assistant messages overwrite earlier
  // ones, so tool-call preambles drop out and only the closing answer remains).
  const turns = [];
  let cur = null;
  for (const e of entries) {
    if (e.isSidechain || e.isMeta || e.isCompactSummary) continue;
    const type = e.type || (e.message && e.message.role);
    if (type === 'user') {
      const c = normUserContent(e.message ? e.message.content : e.content);
      if (c.hasToolResult) continue; // tool result echoed as a user turn
      if (!c.text.trim()) continue; // empty / non-prompt
      cur = { promptText: c.text, promptTime: e.timestamp || '', respText: '', respTime: '', model: '' };
      turns.push(cur);
    } else if (type === 'assistant' && cur) {
      const t = assistantText(e.message ? e.message.content : e.content);
      const model = (e.message && e.message.model) || e.model || '';
      if (t.trim()) {
        cur.respText = t;
        cur.respTime = e.timestamp || cur.respTime;
      }
      if (model) cur.model = model;
    }
  }

  const completed = turns.filter((t) => t.respText.trim());
  if (completed.length === 0) return;

  const first = completed[0];
  const last = completed[completed.length - 1];
  const firstTime = first.promptTime || new Date().toISOString();
  const lastTime = last.respTime || last.promptTime || firstTime;
  const d = new Date(firstTime);
  const stamp = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}-${pad(d.getUTCSeconds())}`;
  const dateStr = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const topModel = last.model || first.model || 'unknown';
  const short = sessionId.slice(0, 8);

  const logDir = join(projectDir, '.agent-logs');
  mkdirSync(logDir, { recursive: true });

  // The session id is the stable file suffix; keep the original start-time stamp
  // once a file exists so the name doesn't drift.
  let fname = `${stamp}_${sessionId}.md`;
  try {
    const existing = readdirSync(logDir).find((f) => f.endsWith(`_${sessionId}.md`));
    if (existing) fname = existing;
  } catch {
    /* dir may be empty */
  }

  const out = [];
  out.push('---');
  out.push(`session_id: ${sessionId}`);
  out.push(`date: ${dateStr}`);
  out.push(`author: ${AUTHOR}`);
  out.push(`model: ${topModel}`);
  out.push(`tool: ${TOOL}`);
  out.push(`project: ${PROJECT}`);
  out.push(`total_exchanges: ${completed.length}`);
  out.push(`first_prompt_time: ${firstTime}`);
  out.push(`last_prompt_time: ${lastTime}`);
  out.push('---');
  out.push('');
  out.push(`# Session Log — ${dateStr}`);
  out.push('');
  out.push(`Session: \`${short}\` | Project: \`${PROJECT}\` | Author: \`${AUTHOR}\``);
  out.push('');

  let num = 0;
  for (const t of completed) {
    num += 1;
    out.push('---');
    out.push('');
    out.push(`[LOG_ENTRY type=PROMPT num=${num} session=${short}]`);
    out.push(`timestamp: ${t.promptTime || ''}`);
    out.push(`model: ${t.model || topModel}`);
    out.push('');
    out.push(t.promptText.replace(/\r/g, ''));
    out.push('');
    out.push('');
    out.push(`[LOG_ENTRY type=RESPONSE num=${num} session=${short}]`);
    out.push(`timestamp: ${t.respTime || ''}`);
    out.push(`model: ${t.model || topModel}`);
    out.push('');
    out.push(t.respText.replace(/\r/g, ''));
    out.push('');
  }

  writeFileSync(join(logDir, fname), out.join('\n'));
}

try {
  main();
} catch {
  /* never block the session on a logging error */
}
process.exit(0);
