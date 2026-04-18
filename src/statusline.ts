#!/usr/bin/env -S deno run --quiet --allow-read --allow-env --allow-run=sh,git
// Claude Code statusline: powerline (line 1) + usage bars + config counts + active todo.
// Reads Claude Code's JSON from stdin, reads the terminal width from /dev/tty,
// emits up to 4 lines of ANSI-colored output, each truncated to fit the terminal.

// ─────────────────────────── Types ───────────────────────────

interface StatuslineInput {
  transcript_path?: string;
  model?: { display_name?: string; id?: string };
  workspace?: { current_dir?: string; project_dir?: string };
  session_id?: string;
  output_style?: { name?: string };
  cost?: {
    total_cost_usd?: number;
    total_duration_ms?: number;
    total_lines_added?: number;
    total_lines_removed?: number;
  };
  exceeds_200k_tokens?: boolean;
  context_window?: {
    context_window_size?: number;
    used_percentage?: number;
  };
  rate_limits?: {
    five_hour?: { used_percentage?: number; resets_at?: number };
    seven_day?: { used_percentage?: number; resets_at?: number };
  };
}

interface RGB { r: number; g: number; b: number }

interface Segment {
  icon?: string;
  text: string;
  fg: RGB;
  bg: RGB;
  /** extra inline ANSI (e.g. git diff +24 -4 with its own colors) */
  suffix?: string;
}

// ─────────────────────────── ANSI ───────────────────────────

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const BRIGHT_BLUE = "\x1b[94m";
const BRIGHT_MAGENTA = "\x1b[95m";
const YELLOW = "\x1b[33m";

const fg = ({ r, g, b }: RGB) => `\x1b[38;2;${r};${g};${b}m`;
const bg = ({ r, g, b }: RGB) => `\x1b[48;2;${r};${g};${b}m`;

const POWERLINE_SEP = "\ue0b0";

/** Count visible codepoints in a string, skipping ANSI SGR escapes. */
function visibleWidth(s: string): number {
  const chars = [...s];
  let w = 0;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === "\x1b" && chars[i + 1] === "[") {
      const end = chars.indexOf("m", i + 2);
      if (end >= 0) { i = end; continue; }
    }
    w++;
  }
  return w;
}

/** Truncate to at most `max` visible codepoints, preserving ANSI SGR escapes.
 *  Appends "…" when content is cut so narrow terminals show the loss explicitly
 *  rather than silently dropping tail info. */
function truncateAnsi(s: string, max: number): string {
  const chars = [...s]; // codepoint iteration
  const isSgrStart = (i: number) =>
    chars[i] === "\x1b" && chars[i + 1] === "[" && chars.indexOf("m", i + 2) >= 0;

  if (visibleWidth(s) <= max) return s + RESET;

  const target = Math.max(0, max - 1); // reserve 1 col for the ellipsis
  let out = "";
  let visible = 0;
  for (let i = 0; i < chars.length && visible < target; i++) {
    if (isSgrStart(i)) {
      const end = chars.indexOf("m", i + 2);
      out += chars.slice(i, end + 1).join("");
      i = end;
      continue;
    }
    out += chars[i];
    visible++;
  }
  return out + "…" + RESET;
}

// ─────────────────────────── Powerline renderer ───────────────────────────

function renderPowerline(segments: Segment[]): string {
  let out = "";
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const next = segments[i + 1];
    out += bg(seg.bg) + fg(seg.fg) + " ";
    if (seg.icon) out += seg.icon + " ";
    out += seg.text;
    if (seg.suffix) out += seg.suffix + fg(seg.fg);
    out += " ";
    if (next) {
      out += `\x1b[49m${bg(next.bg)}${fg(seg.bg)}${POWERLINE_SEP}${RESET}`;
    } else {
      out += `\x1b[49m${RESET}`;
    }
  }
  return out;
}

// ─────────────────────────── Segment builders ───────────────────────────

const COLORS = {
  model: { fg: { r: 255, g: 255, b: 255 }, bg: { r: 42, g: 42, b: 42 } },
  directory: { fg: { r: 90, g: 155, b: 207 }, bg: { r: 26, g: 46, b: 61 } },
  git: { fg: { r: 78, g: 201, b: 176 }, bg: { r: 26, g: 47, b: 44 } },
  context: { fg: { r: 232, g: 155, b: 48 }, bg: { r: 45, g: 34, b: 16 } },
  session: { fg: { r: 78, g: 201, b: 176 }, bg: { r: 26, g: 47, b: 44 } },
  output_style: { fg: { r: 123, g: 184, b: 232 }, bg: { r: 26, g: 38, b: 54 } },
};

function modelSegment(input: StatuslineInput): Segment {
  return {
    icon: "\u{f05a0}", //
    text: input.model?.display_name ?? "Claude",
    ...COLORS.model,
  };
}

function directorySegment(input: StatuslineInput): Segment {
  const cwd = input.workspace?.current_dir ?? Deno.cwd();
  const base = cwd.split("/").filter(Boolean).pop() ?? cwd;
  return {
    icon: "\u{f024b}", // 󰉋
    text: base,
    ...COLORS.directory,
  };
}

async function gitSegment(input: StatuslineInput): Promise<Segment | null> {
  const cwd = input.workspace?.current_dir ?? Deno.cwd();
  try {
    const proc = new Deno.Command("git", {
      args: ["-C", cwd, "branch", "--show-current"],
      stdout: "piped",
      stderr: "null",
    });
    const { code, stdout } = await proc.output();
    if (code !== 0) return null;
    const branch = new TextDecoder().decode(stdout).trim();
    if (!branch) return null;
    return { icon: "\u{e725}", text: branch, ...COLORS.git }; //
  } catch {
    return null;
  }
}

function contextSegment(input: StatuslineInput): Segment {
  const pct = input.context_window?.used_percentage;
  const size = input.context_window?.context_window_size;
  const text = pct != null && size != null
    ? `${pct.toFixed(1)}% · ${formatTokens(Math.round((pct / 100) * size))} tokens`
    : "- · - tokens";
  return { icon: "\u{f0e7}", text, ...COLORS.context }; //
}

function sessionSegment(input: StatuslineInput): Segment {
  const ms = input.cost?.total_duration_ms ?? 0;
  const duration = formatDuration(ms);
  const added = input.cost?.total_lines_added ?? 0;
  const removed = input.cost?.total_lines_removed ?? 0;
  const suffix = added || removed
    ? ` ${GREEN}+${added}${fg(COLORS.session.fg)} ${RED}-${removed}`
    : "";
  return {
    icon: "\u{f51b}", // ⏱-ish
    text: duration,
    suffix,
    ...COLORS.session,
  };
}

function outputStyleSegment(input: StatuslineInput): Segment {
  return {
    icon: "\u{f135d}", // 󱍝
    text: input.output_style?.name ?? "default",
    ...COLORS.output_style,
  };
}

// ─────────────────────────── Formatting helpers ───────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60}m`;
}

// ─────────────────────────── Usage bars (line 2) ───────────────────────────

const BAR_WIDTH = 10;

function quotaColor(percent: number): string {
  if (percent >= 90) return RED;
  if (percent >= 75) return BRIGHT_MAGENTA;
  return BRIGHT_BLUE;
}

function renderBar(percent: number): string {
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  const color = quotaColor(percent);
  return `${color}${"█".repeat(filled)}${DIM}${"░".repeat(empty)}${RESET}`;
}

function formatResetTime(unixSeconds: number): string {
  if (!Number.isFinite(unixSeconds)) return "";
  const now = Date.now();
  const then = unixSeconds * 1000;
  const diffMs = Math.max(0, then - now);
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const m = mins % 60;
    return m ? `${hours}h ${m}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const h = hours % 24;
  return h ? `${days}d ${h}h` : `${days}d`;
}

function renderUsageLine(input: StatuslineInput): string | null {
  const five = input.rate_limits?.five_hour;
  const seven = input.rate_limits?.seven_day;
  if (!five && !seven) return null;
  const parts: string[] = [];
  if (five?.used_percentage != null) {
    const pct = five.used_percentage;
    const bar = renderBar(pct);
    const color = quotaColor(pct);
    const resets = five.resets_at ? formatResetTime(five.resets_at) : "";
    const reset_label = resets ? ` ${DIM}(resets in ${resets})${RESET}` : "";
    parts.push(`${DIM}Usage${RESET} ${bar} ${color}${pct}%${RESET}${reset_label}`);
  }
  if (seven?.used_percentage != null) {
    const pct = seven.used_percentage;
    const bar = renderBar(pct);
    const color = quotaColor(pct);
    const resets = seven.resets_at ? formatResetTime(seven.resets_at) : "";
    const reset_label = resets ? ` ${DIM}(resets in ${resets})${RESET}` : "";
    parts.push(`${bar} ${color}${pct}%${RESET}${reset_label}`);
  }
  return parts.join(` ${DIM}|${RESET} `);
}

// ─────────────────────────── Config counts (line 3) ───────────────────────────

async function renderCountsLine(input: StatuslineInput): Promise<string> {
  const home = Deno.env.get("HOME") ?? "";
  const claudeDir = Deno.env.get("CLAUDE_CONFIG_DIR") ?? `${home}/.claude`;
  const cwd = input.workspace?.current_dir ?? Deno.cwd();

  const claudeMdCount = await countClaudeMd(cwd, claudeDir);
  const mcpCount = await countMcps(cwd, claudeDir);
  const hookCount = await countHooks(cwd, claudeDir);

  const parts: string[] = [];
  if (claudeMdCount) parts.push(`${claudeMdCount} CLAUDE.md`);
  if (mcpCount) parts.push(`${mcpCount} MCPs`);
  if (hookCount) parts.push(`${hookCount} hooks`);
  return parts.length ? `${DIM}${parts.join(" | ")}${RESET}` : "";
}

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function countClaudeMd(cwd: string, claudeDir: string): Promise<number> {
  const candidates = [
    `${claudeDir}/CLAUDE.md`,
    `${cwd}/CLAUDE.md`,
    `${cwd}/CLAUDE.local.md`,
    `${cwd}/.claude/CLAUDE.md`,
    `${cwd}/.claude/CLAUDE.local.md`,
  ];
  let count = 0;
  for (const p of candidates) if (await exists(p)) count++;
  return count;
}

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    const text = await Deno.readTextFile(path);
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function countMcps(cwd: string, claudeDir: string): Promise<number> {
  const home = Deno.env.get("HOME") ?? "";
  const sources = [
    `${claudeDir}/settings.json`,
    `${home}/.claude.json`,
    `${cwd}/.mcp.json`,
    `${cwd}/.claude/settings.json`,
    `${cwd}/.claude/settings.local.json`,
  ];
  const seen = new Set<string>();
  for (const src of sources) {
    const cfg = await readJson(src);
    if (!cfg) continue;
    const servers = cfg.mcpServers as Record<string, { disabled?: boolean }> | undefined;
    if (!servers) continue;
    for (const [name, val] of Object.entries(servers)) {
      if (val?.disabled) continue;
      seen.add(name);
    }
  }
  return seen.size;
}

async function countHooks(cwd: string, claudeDir: string): Promise<number> {
  const sources = [
    `${claudeDir}/settings.json`,
    `${cwd}/.claude/settings.json`,
    `${cwd}/.claude/settings.local.json`,
  ];
  const seen = new Set<string>();
  for (const src of sources) {
    const cfg = await readJson(src);
    if (!cfg) continue;
    const hooks = cfg.hooks as Record<string, unknown> | undefined;
    if (!hooks) continue;
    for (const k of Object.keys(hooks)) seen.add(k);
  }
  return seen.size;
}

// ─────────────────────────── Todos line (line 4, conditional) ───────────────────────────

interface Todo {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

async function renderTodosLine(input: StatuslineInput): Promise<string | null> {
  const path = input.transcript_path;
  if (!path) return null;
  let todos: Todo[] | null = null;
  try {
    const text = await Deno.readTextFile(path);
    const lines = text.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line || !line.includes("TodoWrite")) continue;
      const parsed = extractTodos(line);
      if (parsed) {
        todos = parsed;
        break;
      }
    }
  } catch {
    return null;
  }
  if (!todos) return null;
  const inProgress = todos.find((t) => t.status === "in_progress");
  if (!inProgress) return null;
  const completed = todos.filter((t) => t.status === "completed").length;
  const total = todos.length;
  const content = inProgress.content.length > 50
    ? inProgress.content.slice(0, 50) + "..."
    : inProgress.content;
  return `${YELLOW}▸${RESET} ${content} ${DIM}(${completed}/${total})${RESET}`;
}

function extractTodos(line: string): Todo[] | null {
  try {
    const obj = JSON.parse(line);
    const content = obj?.message?.content;
    if (!Array.isArray(content)) return null;
    for (const block of content) {
      if (block?.type === "tool_use" && block?.name === "TodoWrite") {
        const todos = block?.input?.todos;
        if (Array.isArray(todos)) return todos;
      }
    }
  } catch { /* non-JSON */ }
  return null;
}

// ─────────────────────────── Terminal width (via /dev/tty) ───────────────────────────

async function terminalWidth(): Promise<number> {
  try {
    const sh = new Deno.Command("sh", {
      args: ["-c", "stty size </dev/tty"],
      stdout: "piped",
      stderr: "null",
    });
    const { code, stdout } = await sh.output();
    if (code !== 0) return 500;
    const parts = new TextDecoder().decode(stdout).trim().split(/\s+/);
    const cols = parseInt(parts[1] ?? "", 10);
    return Number.isFinite(cols) && cols > 0 ? cols : 500;
  } catch {
    return 500;
  }
}

// ─────────────────────────── Progressive-drop powerline (line 1) ───────────────────────────

// Render order of the powerline. Segments flagged with `drop` are candidates
// for removal when the line doesn't fit.
// Drop priority (earliest removed first): output_style → directory → session → git.
// Model + context are mandatory — they remain even when the line still overflows.
type SegmentKey = "model" | "directory" | "git" | "context" | "session" | "output_style";
const DISPLAY_ORDER: SegmentKey[] = [
  "model",
  "directory",
  "git",
  "context",
  "session",
  "output_style",
];
const DROP_ORDER: SegmentKey[] = ["output_style", "directory", "session", "git"];

function buildLine1(
  all: Partial<Record<SegmentKey, Segment | null>>,
  maxCols: number,
): string {
  const dropped = new Set<SegmentKey>();
  for (;;) {
    const active = DISPLAY_ORDER
      .filter((k) => all[k] != null && !dropped.has(k))
      .map((k) => all[k]!);
    const rendered = renderPowerline(active);
    if (visibleWidth(rendered) <= maxCols) return rendered;
    const next = DROP_ORDER.find((k) => !dropped.has(k) && all[k] != null);
    if (!next) {
      // Nothing more to drop — truncate what remains with an ellipsis.
      return truncateAnsi(rendered, maxCols);
    }
    dropped.add(next);
  }
}

// ─────────────────────────── Main ───────────────────────────

async function readStdin(): Promise<string> {
  return await new Response(Deno.stdin.readable).text();
}

export async function main() {
  const raw = await readStdin();
  let input: StatuslineInput = {};
  try {
    input = JSON.parse(raw);
  } catch {
    // If stdin isn't JSON, render a degraded statusline
  }

  // CLAUDE_HUD_MAX_COLS overrides stty width — useful when Claude Code renders
  // into a pane narrower than the full TTY (sidebar/tree open). stty returns
  // the TTY width, not the pane width, so users with persistent sidebars can
  // set this to force more aggressive segment drops.
  const envCap = parseInt(Deno.env.get("CLAUDE_HUD_MAX_COLS") ?? "", 10);
  const width = Number.isFinite(envCap) && envCap > 0 ? envCap : await terminalWidth();

  const maybeGit = await gitSegment(input);

  const line1 = buildLine1({
    model: modelSegment(input),
    directory: directorySegment(input),
    git: maybeGit,
    context: contextSegment(input),
    session: sessionSegment(input),
    output_style: outputStyleSegment(input),
  }, width);

  const [usageLine, countsLine, todosLine] = await Promise.all([
    Promise.resolve(renderUsageLine(input)),
    renderCountsLine(input),
    renderTodosLine(input),
  ]);

  const lines = [
    line1,
    usageLine,
    countsLine,
    todosLine,
  ].filter((l): l is string => typeof l === "string" && l.length > 0);

  for (const line of lines) {
    console.log(truncateAnsi(line, width));
  }
}

if (import.meta.main) {
  await main();
}
