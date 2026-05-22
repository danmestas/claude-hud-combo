# claude-hud-combo

Self-contained Claude Code statusline written in a single Deno script. No external plugins, no Rust binary to track, no patches to reapply.

## What you get

```
 Opus 4.7   claude-hud-combo   main   55.7% · 111.5k tokens   20m59s +24 -4  󱍝 default
Usage ██████░░░░ 62% (resets in 4h 34m) | ██░░░░░░░░ 15% (resets in 6d)
context-mode  claude-nats  caffeinate          ● hub:58239   ● leaf:65260   ● proj.session.worker
▸ wire up the rewrite (3/7)
```

Four lines, each truncated to the actual terminal width (read via `stty size </dev/tty`) so nothing soft-wraps and consumes Claude Code's statusline budget:

1. **Powerline:** model, directory basename, git branch (if any), context %, session duration + lines added/removed, output style
2. **Usage bars:** 5h and 7d rate-limit percentages with reset times (color turns magenta ≥75%, red ≥90%)
3. **Stack / children:** left — roles of processes descended from this claude (nats-channel, MCP servers, caffeinate, …), colored. Right-aligned — sesh stack cascade `● hub:<port>   ● leaf:<port>   ● <project>.<sesh>.<role>`. Each step only renders when the prior step is healthy; `<thing> off` surfaces an expected-but-broken state. Hidden entirely when `~/.sesh/` doesn't exist and no claude children are present.
4. **Active todo** (only when one is in progress): truncated content with a done/total count

## Requirements

Just [Deno](https://deno.com). One install: `curl -fsSL https://deno.land/install.sh | sh`.

## Install

```bash
git clone https://github.com/danmestas/claude-hud-combo ~/projects/claude-hud-combo
cd ~/projects/claude-hud-combo
./install.sh
```

Restart Claude Code.

## Files

| Path | Purpose |
|---|---|
| `src/statusline.ts` | The whole thing — reads Claude Code JSON stdin, renders 4 lines |
| `bin/statusline.sh` | Thin bash wrapper that finds deno and execs `deno run statusline.ts` |
| `install.sh` | Idempotent installer. Copies both files to `~/.claude/bin/` and wires `settings.json` |

The Deno script uses `--allow-read`, `--allow-env`, and `--allow-run=sh,git`. No network access.

## Customize

Open `src/statusline.ts`. All colors live in the `COLORS` object near the top. Segment order is in `main()`. The usage-bar thresholds (magenta/red) are in `quotaColor()`. Icons are Nerd Font codepoints inline in each segment builder — swap them as needed.

Re-run `./install.sh` to pick up changes.

## Uninstall

Restore backups under `~/.claude/bin/` (any file touched gets a `.bak.<timestamp>`), or change `statusLine.command` in `~/.claude/settings.json` back to whatever you had before.
