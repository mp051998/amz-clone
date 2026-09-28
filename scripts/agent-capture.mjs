#!/usr/bin/env node
// agent-capture.mjs — 8x agent-capture hook for Claude Code.
//
// Wired to UserPromptSubmit, Stop, StopFailure (a turn that ended on an API
// error) and SessionEnd in .claude/settings.json. On each event it
// rebuilds the CURRENT session's .agent-logs/<...>.md file from the session's
// authoritative transcript (.jsonl, path supplied by the hook on stdin),
// capturing ONLY the human prompt and the final text response per turn — no
// thinking, no tool calls, no intermediate steps (per the 8x spec).
//
// Deriving from the immutable transcript makes it idempotent. Entries are
// append-only: a run only ever adds to the end of an existing log. If a rebuild
// would change something already written (e.g. after a change to this script),
// the existing entries are kept byte-for-byte and only newer turns are
// appended. Only the frontmatter counters are rewritten. Always exits 0 so a
// logging hiccup can't block the session.
//
// v2 (2026-09-26) — v1 dropped prompts in three cases; all are now captured:
//   - prompts typed while the agent was mid-turn (queued_command attachments);
//   - prompts that were interrupted before any text came back (the RESPONSE
//     is the transcript's own "[Request interrupted by user…]" marker);
//   - v1 also logged background-task notifications as if they were prompts.
// What counts as the response:
//   - A turn's RESPONSE is the last text the agent wrote before the turn ended
//     (end_turn), was interrupted, or the next human prompt arrived. So a prompt
//     followed by a mid-turn follow-up gets the text the agent had written when
//     that follow-up landed.
//   - Turns that only a background-task notification started are not human
//     prompts, so they are not logged.
//   - A prompt is written once the agent has started answering it, which is
//     when its model is known. Its RESPONSE is written once the turn is over.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const AUTHOR = 'mp051998';
const PROJECT = 'amz-clone';
const TOOL = 'claude-code';

const INTERRUPT_RE = /^\[Request interrupted by user[^\]]*\]$/;
const END_REASONS = new Set(['end_turn', 'stop_sequence', 'max_tokens', 'refusal']);
// Harness-generated user messages in transcripts that predate `origin` tagging.
const SYSTEM_PREFIXES = ['<task-notification>', '<local-command-stdout>', '<local-command-stderr>', '<local-command-caveat>'];

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
  const images = [];
  let hasToolResult = false;
  for (const b of content) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'text' && typeof b.text === 'string') text += b.text;
    else if (b.type === 'image') images.push(`[image: ${(b.source && b.source.media_type) || 'attached'}]`);
    else if (b.type === 'tool_result') hasToolResult = true;
  }
  // Images can't live in a markdown log; record that they were part of the prompt.
  if (images.length) text = text ? `${images.join('\n')}\n\n${text}` : images.join('\n');
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

/**
 * Classify a transcript entry:
 *   { kind: 'prompt', text, time } — a human prompt: typed, or queued mid-turn
 *   { kind: 'interrupt', text } — the user pressed Esc
 *   { kind: 'assistant', text, model, stop, msgId } — model output
 *   { kind: 'model', model } — the session's current model
 *   null — anything else (tool results, meta, notifications, local commands)
 */
function classify(e, hasOrigin) {
  if (e.isSidechain || e.isMeta || e.isCompactSummary) return null;
  if (e.type === 'attachment') {
    const a = e.attachment;
    // Written with each prompt; names the model even when no reply came back.
    if (a && a.type === 'model' && a.identity && a.identity.modelId) return { kind: 'model', model: a.identity.modelId };
    if (!a || a.type !== 'queued_command') return null;
    const { text } = normUserContent(a.prompt);
    if (!text.trim()) return null;
    const human = a.origin ? a.origin.kind === 'human' : a.commandMode === 'prompt' && !isSystemText(text);
    return human ? { kind: 'prompt', text, time: e.timestamp || '' } : null;
  }
  const type = e.type || (e.message && e.message.role);
  if (type === 'user') {
    const c = normUserContent(e.message ? e.message.content : e.content);
    if (c.hasToolResult || !c.text.trim()) return null;
    if (INTERRUPT_RE.test(c.text.trim())) return { kind: 'interrupt', text: c.text.trim() };
    const human = hasOrigin ? !!e.origin && e.origin.kind === 'human' : !isSystemText(c.text);
    return human ? { kind: 'prompt', text: c.text, time: e.timestamp || '' } : null;
  }
  if (type === 'assistant') {
    const m = e.message || {};
    const model = m.model && m.model !== '<synthetic>' ? m.model : '';
    return { kind: 'assistant', text: assistantText(m.content ?? e.content), model, stop: m.stop_reason, msgId: m.id || '', time: e.timestamp || '' };
  }
  return null;
}

function isSystemText(text) {
  const t = text.trimStart();
  return SYSTEM_PREFIXES.some((p) => t.startsWith(p));
}

/**
 * Fold transcript entries into turns: one per human prompt.
 * `final`: a hook fired, so any turn that reached end_turn is over — `Stop` /
 * `StopFailure` fire after it, `UserPromptSubmit` before the next prompt is
 * written, `SessionEnd` at exit.
 */
function buildTurns(entries, final) {
  const hasOrigin = entries.some((e) => e.type === 'user' && e.origin);
  // A resumed session's transcript opens with history copied from the session
  // it resumed; that history belongs to the earlier session's log. The first
  // queue "enqueue" marks this session's first real prompt.
  const firstEnqueue = entries.find((e) => e.type === 'queue-operation' && e.operation === 'enqueue');
  const since = firstEnqueue ? Date.parse(firstEnqueue.timestamp) - 2000 : -Infinity;

  const turns = [];
  let cur = null;
  let lastModel = '';
  entries.forEach((e, i) => {
    const c = classify(e, hasOrigin);
    if (!c) return;
    if (c.kind === 'prompt') {
      if (cur) cur.done = true;
      if (Date.parse(c.time) < since) {
        cur = null; // inherited history
        return;
      }
      cur = { promptText: c.text, promptTime: c.time, model: '', fallbackModel: lastModel, started: false, respText: '', respTime: '', respModel: '', done: false, interrupt: '', endMsg: '', endIdx: -1 };
      turns.push(cur);
    } else if (c.kind === 'model') {
      lastModel = c.model;
      if (cur && !cur.started && !cur.done) cur.fallbackModel = c.model;
    } else if (c.kind === 'interrupt') {
      if (cur && !cur.done && !cur.endMsg) {
        cur.interrupt = c.text;
        cur.done = true;
      }
    } else if (c.kind === 'assistant') {
      if (c.model) lastModel = c.model;
      if (!cur || cur.done) return;
      // After end_turn only the rest of that same message counts; anything
      // later is a notification-triggered turn. Each content block of a
      // message is its own transcript entry, all carrying the stop reason.
      if (cur.endMsg && c.msgId !== cur.endMsg) return;
      cur.started = true;
      if (!cur.model && c.model) cur.model = c.model;
      if (c.text.trim()) {
        cur.respText = c.text;
        cur.respTime = c.time || cur.respTime;
        cur.respModel = c.model || cur.respModel;
      }
      if (END_REASONS.has(c.stop)) {
        cur.endMsg = c.msgId || `#${i}`;
        cur.endIdx = i;
      }
    }
  });
  // A turn that reached end_turn is over once anything follows its final
  // message in the transcript (a live watcher may otherwise read it while its
  // content blocks are still being appended), or once a hook has fired.
  for (const t of turns) {
    if (!t.done && t.endMsg && (final || t.endIdx < entries.length - 1)) t.done = true;
  }
  // Written once the model has started answering (or the prompt was interrupted).
  return turns.filter((t) => t.started || t.done);
}

// Block layout matches v1 byte-for-byte so v1 logs extend cleanly:
// PROMPT block, two blank lines, RESPONSE block, one blank line, next PROMPT.
function renderPrompt(t, num, short) {
  return [
    '---',
    '',
    `[LOG_ENTRY type=PROMPT num=${num} session=${short}]`,
    `timestamp: ${t.promptTime}`,
    `model: ${t.model || t.fallbackModel || 'unknown'}`,
    '',
    t.promptText.replace(/\r/g, ''),
    '',
    '',
    '',
  ].join('\n');
}

function renderResponse(t, num, short) {
  let body = t.respText.replace(/\r/g, '');
  if (t.interrupt) body = body.trim() ? `${body}\n\n${t.interrupt}` : t.interrupt;
  if (!body.trim()) body = '[no text response]';
  return [
    `[LOG_ENTRY type=RESPONSE num=${num} session=${short}]`,
    `timestamp: ${t.respTime || t.promptTime}`,
    `model: ${t.respModel || t.model || t.fallbackModel || 'unknown'}`,
    '',
    body,
    '',
  ].join('\n');
}

/**
 * Entry blocks for `turns`, numbered from `startNum`. The last turn's RESPONSE
 * waits until it's done. `afterResponse`: the text being appended to ends with
 * a RESPONSE block, so the next PROMPT needs its blank separator line.
 */
function renderEntries(turns, startNum, short, afterResponse = false) {
  let s = '';
  let sep = afterResponse;
  turns.forEach((t, i) => {
    const num = startNum + i;
    s += (sep ? '\n' : '') + renderPrompt(t, num, short);
    sep = false;
    if (t.done) {
      s += renderResponse(t, num, short);
      sep = true;
    }
  });
  return s;
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

  const turns = buildTurns(entries, !!hook.hook_event_name);
  if (turns.length === 0) return;

  const short = sessionId.slice(0, 8);
  const logDir = join(projectDir, '.agent-logs');
  mkdirSync(logDir, { recursive: true });

  const first = turns[0];
  const d = new Date(first.promptTime || Date.now());
  const stamp = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}-${pad(d.getUTCSeconds())}`;
  const dateStr = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

  // The session id is the stable file suffix; keep the original start-time stamp
  // once a file exists so the name doesn't drift.
  let fname = `${stamp}_${sessionId}.md`;
  let existing = '';
  try {
    const found = readdirSync(logDir).find((f) => f.endsWith(`_${sessionId}.md`));
    if (found) {
      fname = found;
      existing = readFileSync(join(logDir, found), 'utf8');
    }
  } catch {
    /* dir may be empty */
  }

  const titleLine = `# Session Log — ${dateStr}`;
  const intro = `${titleLine}\n\nSession: \`${short}\` | Project: \`${PROJECT}\` | Author: \`${AUTHOR}\`\n\n`;
  let body = intro + renderEntries(turns, 1, short);
  let count = turns.length;
  let firstTime = first.promptTime;
  let lastTime = turns[turns.length - 1].promptTime;

  const oldBodyAt = existing.indexOf('\n# Session Log');
  if (oldBodyAt !== -1) {
    const oldBody = existing.slice(oldBodyAt + 1);
    if (!body.startsWith(oldBody)) {
      // A rebuild would rewrite history. Keep what is there; append newer turns only.
      const nums = [...oldBody.matchAll(/\[LOG_ENTRY type=(PROMPT|RESPONSE) num=(\d+)/g)];
      const maxNum = nums.reduce((m, x) => Math.max(m, Number(x[2])), 0);
      const times = [...oldBody.matchAll(/^timestamp: (\S+)$/gm)].map((x) => x[1]).sort();
      const lastLogged = times[times.length - 1] || '';
      let tail = '';
      const lastEntry = nums[nums.length - 1];
      let afterResponse = !!lastEntry && lastEntry[1] === 'RESPONSE';
      const newer = turns.filter((t) => t.promptTime > lastLogged);
      if (lastEntry && lastEntry[1] === 'PROMPT') {
        // Last written prompt was still awaiting its response.
        const promptTimes = [...oldBody.matchAll(/type=PROMPT num=\d+ [^\]]*\]\ntimestamp: (\S+)/g)].map((x) => x[1]);
        const pending = turns.find((t) => t.promptTime === promptTimes[promptTimes.length - 1]);
        if (pending && pending.done) {
          tail += renderResponse(pending, maxNum, short);
          afterResponse = true;
        }
      }
      tail += renderEntries(newer, maxNum + 1, short, afterResponse);
      body = oldBody + tail;
      count = maxNum + newer.length;
      firstTime = (existing.match(/^first_prompt_time: (\S+)$/m) || [])[1] || firstTime;
      lastTime = newer.length ? newer[newer.length - 1].promptTime : (existing.match(/^last_prompt_time: (\S+)$/m) || [])[1] || lastTime;
    }
  }

  const last = turns[turns.length - 1];
  const header = [
    '---',
    `session_id: ${sessionId}`,
    `date: ${dateStr}`,
    `author: ${AUTHOR}`,
    `model: ${last.respModel || last.model || last.fallbackModel || 'unknown'}`,
    `tool: ${TOOL}`,
    `project: ${PROJECT}`,
    `total_exchanges: ${count}`,
    `first_prompt_time: ${firstTime}`,
    `last_prompt_time: ${lastTime}`,
    '---',
    '',
  ].join('\n');

  writeFileSync(join(logDir, fname), `${header}\n${body}`);
}

try {
  main();
} catch {
  /* never block the session on a logging error */
}
process.exit(0);
