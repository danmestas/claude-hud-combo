#!/usr/bin/env bash
# Combines ccline (powerline line 1) with claude-hud (lines 2+, usage bar).
# Reads Claude Code's JSON stdin once, fans it out to both tools.
#
# Claude Code doesn't pass COLUMNS to the statusline subprocess, so we read the
# real terminal width via /dev/tty and truncate each line to fit — otherwise
# ccline's 100+ char output wraps on narrow terminals and eats the statusline
# budget, hiding claude-hud's lines entirely.

set -u

find_bin() {
  local name=$1
  if command -v mise >/dev/null 2>&1 && mise which "$name" >/dev/null 2>&1; then
    mise which "$name"
    return
  fi
  command -v "$name" 2>/dev/null
}

CCLINE=${CCLINE_BIN:-$(find_bin ccline)}
BUN=${BUN_BIN:-$(find_bin bun)}

if [[ -z "${CCLINE:-}" || -z "${BUN:-}" ]]; then
  echo "claude-hud-combo: missing ccline or bun on PATH (mise not active?)" >&2
  cat >/dev/null
  exit 0
fi

input=$(cat)

width=$( (stty size </dev/tty | awk '{print $2}') 2>/dev/null )
width=${width:-500}

PERL_TRUNC='
use strict;
my $max = shift;
while (my $line = <STDIN>) {
  chomp $line;
  my ($out, $vis, $i, $n) = ("", 0, 0, length $line);
  while ($i < $n) {
    my $c = substr($line, $i, 1);
    if ($c eq "\e" and substr($line, $i+1, 1) eq "[") {
      my $e = index($line, "m", $i+2);
      if ($e >= 0) { $out .= substr($line, $i, $e-$i+1); $i = $e+1; next; }
    }
    last if $vis >= $max;
    $out .= $c; $vis++; $i++;
  }
  print $out, "\e[0m\n";
}
'

printf '%s' "$input" | "$CCLINE" | perl -CS -e "$PERL_TRUNC" "$width"

plugin_dir=$(ls -d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/claude-hud/claude-hud/*/ 2>/dev/null \
  | awk -F/ '{ print $(NF-1) "\t" $(0) }' \
  | sort -t. -k1,1n -k2,2n -k3,3n -k4,4n | tail -1 | cut -f2-)

if [[ -z "$plugin_dir" ]]; then
  exit 0
fi

printf '%s' "$input" | COLUMNS=500 "$BUN" --env-file /dev/null "${plugin_dir}src/index.ts" \
  | tail -n +2 \
  | perl -CS -e "$PERL_TRUNC" "$width"
