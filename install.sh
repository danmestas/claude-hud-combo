#!/usr/bin/env bash
# Installs claude-hud-combo: custom statusline combining ccline powerline
# with claude-hud usage bars. Idempotent.

set -euo pipefail

REPO_DIR=$(cd "$(dirname "$0")" && pwd)
CLAUDE_DIR=${CLAUDE_CONFIG_DIR:-$HOME/.claude}

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
err()  { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; }

bold "claude-hud-combo install"

# --- 1. Dependencies ---
bold "Checking dependencies"

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "missing: $1"
    exit 1
  fi
  ok "$1"
}

require mise
require bun
require ccline

if [[ ! -d "$CLAUDE_DIR/plugins/cache/claude-hud" ]]; then
  err "claude-hud plugin not installed. Run: /plugin install claude-hud in Claude Code first."
  exit 1
fi
ok "claude-hud plugin present"

# --- 2. Copy configs (with backup) ---
bold "Installing configs"

backup() {
  [[ -f "$1" && ! -L "$1" ]] && cp "$1" "$1.bak.$(date +%Y%m%d%H%M%S)" && warn "backed up $1"
  return 0
}

install_file() {
  local src=$1 dst=$2
  mkdir -p "$(dirname "$dst")"
  backup "$dst"
  cp "$src" "$dst"
  ok "wrote $dst"
}

install_file "$REPO_DIR/config/claude-hud.config.json" "$CLAUDE_DIR/plugins/claude-hud/config.json"
install_file "$REPO_DIR/config/ccline.config.toml" "$CLAUDE_DIR/ccline/config.toml"

mkdir -p "$CLAUDE_DIR/bin"
install -m 0755 "$REPO_DIR/bin/statusline.sh" "$CLAUDE_DIR/bin/statusline.sh"
ok "wrote $CLAUDE_DIR/bin/statusline.sh"

# --- 3. Patch claude-hud source (todos-line.ts) ---
bold "Applying todos-line patch"

latest_plugin=$(ls -d "$CLAUDE_DIR"/plugins/cache/claude-hud/claude-hud/*/ 2>/dev/null \
  | awk -F/ '{ print $(NF-1) "\t" $(0) }' \
  | sort -t. -k1,1n -k2,2n -k3,3n -k4,4n | tail -1 | cut -f2-)

if [[ -z "$latest_plugin" ]]; then
  err "could not locate installed claude-hud version directory"
  exit 1
fi

target="$latest_plugin/src/render/todos-line.ts"
if grep -q "All todos complete" "$target" 2>/dev/null; then
  (cd "$latest_plugin" && patch -p1 < "$REPO_DIR/patches/todos-line.ts.patch")
  ok "patched $target"
else
  ok "todos-line already patched (skipping)"
fi

# --- 4. Wire settings.json ---
bold "Wiring statusLine into settings.json"

settings="$CLAUDE_DIR/settings.json"
cmd="$CLAUDE_DIR/bin/statusline.sh"

if [[ ! -f "$settings" ]]; then
  echo '{}' > "$settings"
fi

if command -v jq >/dev/null 2>&1; then
  tmp=$(mktemp)
  jq --arg cmd "$cmd" '.statusLine = {type: "command", command: $cmd}' "$settings" > "$tmp" && mv "$tmp" "$settings"
  ok "statusLine -> $cmd"
else
  warn "jq not found; edit $settings manually:"
  echo "  \"statusLine\": { \"type\": \"command\", \"command\": \"$cmd\" }"
fi

bold "Done. Restart Claude Code to apply."
