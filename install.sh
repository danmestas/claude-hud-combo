#!/usr/bin/env bash
# Installs claude-hud-combo: a self-contained Deno statusline for Claude Code.
# Idempotent.

set -euo pipefail

REPO_DIR=$(cd "$(dirname "$0")" && pwd)
CLAUDE_DIR=${CLAUDE_CONFIG_DIR:-$HOME/.claude}
INSTALL_DIR="$CLAUDE_DIR/bin"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
err()  { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; }

bold "claude-hud-combo install"

# --- 1. Dependencies ---
bold "Checking dependencies"
if ! command -v deno >/dev/null 2>&1 && \
   [[ ! -x "$HOME/.deno/bin/deno" ]] && \
   [[ ! -x /usr/local/bin/deno ]] && \
   [[ ! -x /opt/homebrew/bin/deno ]]; then
  err "deno not found. Install: curl -fsSL https://deno.land/install.sh | sh"
  exit 1
fi
ok "deno"

# --- 2. Copy files (with backup) ---
bold "Installing files"

backup() {
  [[ -f "$1" && ! -L "$1" ]] && cp "$1" "$1.bak.$(date +%Y%m%d%H%M%S)" && warn "backed up $1"
  return 0
}

install_file() {
  local src=$1 dst=$2 mode=${3:-0644}
  mkdir -p "$(dirname "$dst")"
  backup "$dst"
  install -m "$mode" "$src" "$dst"
  ok "wrote $dst"
}

install_file "$REPO_DIR/bin/statusline.sh" "$INSTALL_DIR/statusline.sh" 0755
install_file "$REPO_DIR/src/statusline.ts" "$INSTALL_DIR/statusline.ts" 0644

# --- 3. Wire settings.json ---
bold "Wiring statusLine into settings.json"

settings="$CLAUDE_DIR/settings.json"
cmd="$INSTALL_DIR/statusline.sh"

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
