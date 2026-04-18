# claude-hud-combo

Self-contained Claude Code statusline written in a single Deno script. No external plugins, no Rust binary to track, no patches to reapply.

## What you get

```
 Opus 4.7   claude-hud-combo   main   55.7% · 111.5k tokens   20m59s +24 -4  󱍝 default
Usage ██████░░░░ 62% (resets in 4h 34m) | ██░░░░░░░░ 15% (resets in 6d)
1 CLAUDE.md | 2 MCPs | 1 hooks
▸ wire up the rewrite (3/7)
```

Four lines, each truncated to the actual terminal width (read via `stty size </dev/tty`) so nothing soft-wraps and consumes Claude Code's statusline budget:

1. **Powerline:** model, directory basename, git branch (if any), context %, session duration + lines added/removed, output style
2. **Usage bars:** 5h and 7d rate-limit percentages with reset times (color turns magenta ≥75%, red ≥90%)
3. **Config counts:** CLAUDE.md, MCP server, and hook totals
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
