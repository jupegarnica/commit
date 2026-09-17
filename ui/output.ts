import { TermDOM } from "@b9g/termdom";

export type OutputLevel = "info" | "warn" | "error" | "debug";

const ANSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const timers = new Map<string, number>();

// Matches the dim gray used for hints elsewhere in the terminal UI
// (see ui/prompt.ts .prompt-hint), since ANSI colors from @std/fmt/colors
// are stripped before rendering through TermDOM.
const LEVEL_COLORS: Record<OutputLevel, string | undefined> = {
  info: "#808080",
  warn: undefined,
  error: undefined,
  debug: "#808080",
};

// Highlight color for values wrapped with hl(), matching the accent blue
// used for .prompt-label in ui/prompt.ts.
const HIGHLIGHT_COLOR = "#5fafff";

// Sentinel control chars (never produced by normal text) used to mark
// highlighted spans inside a message built with hl(). They pass through
// formatOutputText untouched (they aren't ANSI escape sequences) and are
// converted to styled <span> elements when rendering interactively, or
// stripped when falling back to plain stdout/stderr.
const HL_START = "\u0001";
const HL_END = "\u0002";
const HL_SPLIT_PATTERN = /(\u0001[^\u0002]*\u0002)/;

/** Wrap a value so it renders with a highlight color inside writeOutput. */
export function hl(value: unknown): string {
  return `${HL_START}${stringify(value)}${HL_END}`;
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatOutputText(...values: unknown[]): string {
  return values.map((value) => stringify(value).replace(ANSI_PATTERN, "")).join(
    " ",
  );
}

export function renderHtml(text: string): string {
  return text
    .split(HL_SPLIT_PATTERN)
    .map((segment) => {
      if (segment.startsWith(HL_START) && segment.endsWith(HL_END)) {
        const value = segment.slice(HL_START.length, -HL_END.length);
        return `<span style="color: ${HIGHLIGHT_COLOR};">${
          escapeHtml(value)
        }</span>`;
      }
      return escapeHtml(segment);
    })
    .join("");
}

export function stripHighlightMarkers(text: string): string {
  return text.replaceAll(HL_START, "").replaceAll(HL_END, "");
}

export async function writeOutput(
  level: OutputLevel,
  ...values: unknown[]
): Promise<void> {
  const text = formatOutputText(...values);
  if (Deno.stdin.isTerminal()) {
    const term = new TermDOM();
    const color = LEVEL_COLORS[level];
    const style = `white-space: pre-wrap;${color ? ` color: ${color};` : ""}`;
    try {
      await term.print(
        `<div class="output output-${level}" style="${style}">${
          renderHtml(text)
        }</div>`,
      );
    } finally {
      await term.dispose();
    }
    return;
  }

  const stream = level === "error" || level === "warn"
    ? Deno.stderr
    : Deno.stdout;
  await stream.write(
    new TextEncoder().encode(`${stripHighlightMarkers(text)}\n`),
  );
}

export async function startOutputTimer(label: string): Promise<void> {
  timers.set(label, performance.now());
}

export async function endOutputTimer(
  label: string,
  enabled: boolean,
): Promise<void> {
  const started = timers.get(label);
  timers.delete(label);
  if (enabled && started !== undefined) {
    await writeOutput(
      "debug",
      `${label}: ${(performance.now() - started).toFixed(1)}ms`,
    );
  }
}
