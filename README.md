# claude-hud-combo

Custom Claude Code statusline: [ccline](https://github.com/haleclipse/CCometixLine) powerline on line 1, [claude-hud](https://github.com/jarrodwatts/claude-hud) usage bars and config counts on lines 2+.

## What you get

```
 Opus 4.7  ░ dmestas  ░ 55.7% · 111.5k tokens ░ 20m59s +24 -4
Usage ███░░░░░░░ 25% (resets in 4h 34m) | ██░░░░░░░░ 15% (resets in 6d)
1 CLAUDE.md | 2 MCPs | 1 hooks
```

Customizations vs. defaults:
- ccline `usage` segment disabled (claude-hud shows it with a bar instead)
- claude-hud `context` element dropped (redundant with ccline's context%)
- claude-hud `sevenDayThreshold: 0` so the 7-day bar always shows
- claude-hud `todos-line.ts` patched to hide the "All todos complete" summary (only shows active in-progress todos)
- `COLUMNS=500` forced so the usage line doesn't get wrapped off on narrow terminals

## Requirements

- [mise](https://mise.jdx.dev/) managing `node` and `bun`
- `@cometix/ccline` installed globally via mise's node (`mise exec -- npm i -g @cometix/ccline`)
- `claude-hud` plugin installed in Claude Code (`/plugin install claude-hud`)
- Optional: `jq` (for safe settings.json edits; otherwise install.sh prints what to paste)

## Install

```bash
git clone <this-repo> ~/projects/claude-hud-combo
cd ~/projects/claude-hud-combo
./install.sh
```

Restart Claude Code.

## Files

| Path | Purpose |
|---|---|
| `bin/statusline.sh` | Wrapper that tees stdin to ccline + claude-hud and concatenates output |
| `config/claude-hud.config.json` | Written to `~/.claude/plugins/claude-hud/config.json` |
| `config/ccline.config.toml` | Written to `~/.claude/ccline/config.toml` |
| `patches/todos-line.ts.patch` | Applied to `~/.claude/plugins/cache/claude-hud/claude-hud/<version>/src/render/todos-line.ts` |
| `install.sh` | Idempotent installer. Backs up existing files on overwrite. |

## The patch caveat

The todos-line patch lives inside claude-hud's cache dir. When claude-hud auto-updates, Claude Code re-fetches the plugin and overwrites the patched file. Re-run `./install.sh` to reapply — `install.sh` is idempotent and will detect if the patch is already applied.

If you want it applied automatically on every plugin update, add a `SessionStart` hook in `~/.claude/settings.json` that runs `./install.sh`.

## Uninstall

Restore backups under `~/.claude/` (any file touched gets a `.bak.<timestamp>`), or swap `statusLine.command` in `~/.claude/settings.json` back to whatever you had before.
