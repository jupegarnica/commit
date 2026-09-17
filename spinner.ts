import { TermDOM } from "@b9g/termdom";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const INTERVAL_MS = 80;

let timer: ReturnType<typeof setInterval> | undefined;
let term: TermDOM | undefined;
let labelNode: HTMLDivElement | undefined;

export async function startSpinner(text: string): Promise<void> {
  await stopSpinner();
  if (!Deno.stdin.isTerminal()) return;

  term = new TermDOM();
  labelNode = term.document.createElement("div");
  labelNode.textContent = `${FRAMES[0]} ${text}`;
  term.document.body.appendChild(labelNode);
  await term.attach();

  let frame = 0;
  timer = setInterval(() => {
    frame = (frame + 1) % FRAMES.length;
    if (labelNode) labelNode.textContent = `${FRAMES[frame]} ${text}`;
  }, INTERVAL_MS);
}

export async function stopSpinner(): Promise<void> {
  if (timer !== undefined) {
    clearInterval(timer);
    timer = undefined;
  }
  if (term) {
    const activeTerm = term;
    term = undefined;
    labelNode = undefined;
    await activeTerm.dispose();
  }
}

export function isSpinnerActive(): boolean {
  return timer !== undefined;
}
