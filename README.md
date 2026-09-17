# amz-clone — Amazon storefront rebuild

A rebuild of the amazon.com shopping experience.

## Agent capture

Every build turn's **prompt + final response** is captured automatically to
`.agent-logs/` via Claude Code hooks (`.claude/settings.json` →
`scripts/agent-capture.mjs`). The hook rebuilds each session's log from the
session transcript, recording only the prompt and the final response — no
thinking, no tool calls, no intermediate steps. Setup + canary proof:
[`CAPTURE-TEST.md`](CAPTURE-TEST.md).

## Status

🚧 Capture rig in place; product build starting.
