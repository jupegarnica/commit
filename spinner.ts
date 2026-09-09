import * as colors from "jsr:/@std/fmt@1/colors";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const INTERVAL_MS = 80;

let timer: ReturnType<typeof setInterval> | undefined;

export function startSpinner(text: string): void {
  if (!Deno.stdin.isTerminal()) {
    return;
  }
  stopSpinner();
  let frame = 0;
  Deno.stdout.writeSync(
    new TextEncoder().encode(`${colors.gray(FRAMES[0])} ${text}`),
  );
  timer = setInterval(() => {
    frame = (frame + 1) % FRAMES.length;
    Deno.stdout.writeSync(
      new TextEncoder().encode(
        `\r${colors.gray(FRAMES[frame])} ${text}`,
      ),
    );
  }, INTERVAL_MS);
}

export function stopSpinner(): void {
  if (timer !== undefined) {
    clearInterval(timer);
    timer = undefined;
    Deno.stdout.writeSync(new TextEncoder().encode("\r\x1b[K"));
  }
}

export function isSpinnerActive(): boolean {
  return timer !== undefined;
}