#!/usr/bin/env bash
# Thin wrapper that hands stdin to the Deno statusline script.
# The sibling statusline.ts does the actual work.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATUSLINE_TS="$SCRIPT_DIR/statusline.ts"

find_deno() {
  if [[ -n "${DENO_BIN:-}" && -x "$DENO_BIN" ]]; then
    echo "$DENO_BIN"; return
  fi
  if command -v deno >/dev/null 2>&1; then
    command -v deno; return
  fi
  for p in "$HOME/.deno/bin/deno" /usr/local/bin/deno /opt/homebrew/bin/deno; do
    [[ -x "$p" ]] && echo "$p" && return
  done
}

DENO=$(find_deno)
if [[ -z "${DENO:-}" ]]; then
  echo "claude-hud-combo: deno not found. Install: curl -fsSL https://deno.land/install.sh | sh" >&2
  cat >/dev/null
  exit 0
fi

exec "$DENO" run --quiet --allow-read --allow-env --allow-run=sh,git "$STATUSLINE_TS"
