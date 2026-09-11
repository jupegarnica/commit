import { TermDOM } from "@b9g/termdom";
import {
    formatCommitMessageIssues,
    validateCommitMessage,
} from "../validate.ts";

type ConfirmCommitAction = "commit" | "regenerate" | "cancel";

type ConfirmCommitResult = {
    action: ConfirmCommitAction;
    value: string;
};

const DEFAULT_TEXTAREA_MIN_ROWS = 1;
const DEFAULT_TEXTAREA_MAX_ROWS = 12;
// The bordered field adds 1 cell per side for the border and 1ch per side for
// the padding, so the text wraps 4 cells before the terminal width.
const FIELD_CHROME_WIDTH = 4;

const STYLES = `
    .prompt { display: flex; flex-direction: column; gap: 0; }
    .prompt-label {
        color: #5fafff;
        font-weight: bold;
        margin-bottom: 1px;
    }
    .prompt-field {
        border: 1px solid #333333;
        border-radius: 1px;
        padding: 0 1ch;
    }
    .prompt-field:focus-within { border-color: #5fafff; }
    .prompt-field > input,
    .prompt-field > textarea {
        border: none;
        outline: none;
        padding: 0;
        width: 100%;
        flex-grow: 1;
    }
    .prompt-field > input:focus,
    .prompt-field > textarea:focus { text-decoration: none; }
    .prompt-field > textarea { white-space: pre-wrap; }
    .prompt-error { color: #ff5f5f; }
    .prompt-hint { color: #808080; margin-top: 1px; }
    .prompt-actions .prompt-hint { margin-top: 0; }
    .prompt-list {
        border: 1px solid #333333;
        border-radius: 1px;
        padding: 0 1ch;
        display: flex;
        flex-direction: column;
    }
    .prompt-option { color: #999999; }
    .prompt-option.selected {
        background-color: #1c2b3a;
        color: #00d7ff;
        font-weight: bold;
    }
    .prompt-actions { display: flex; flex-direction: row; gap: 1ch; margin-top: 1px; }
    .prompt-chip {
        border: 1px solid #333333;
        border-radius: 1px;
        padding: 0 1ch;
        color: #999999;
    }
    .prompt-chip.selected {
        border-color: #00d7ff;
        color: #00d7ff;
        font-weight: bold;
    }
    button {
        border: 1px solid #333333;
        border-radius: 1px;
        padding: 0 1ch;
        color: #bbbbbb;
        background-color: transparent;
        outline: none;
    }
    button::before,
    button::after { content: none; }
    button.primary {
        border-color: #5fafff;
        color: #5fafff;
        font-weight: bold;
    }
    button:focus {
        border-color: #00d7ff;
        color: #00d7ff;
        text-decoration: none;
    }
    .prompt-issues { color: #808080; margin-top: 1px; }
    .prompt-issues.warning { color: #ffd75f; }
`;

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function countWrappedRows(value: string, width: number) {
    const safeWidth = Math.max(1, width);
    const lines = value.length > 0 ? value.split("\n") : [""];

    return lines.reduce((total, line) => {
        const lineLength = Math.max(1, line.length);
        return total + Math.ceil(lineLength / safeWidth);
    }, 0);
}

function fieldContentWidth(window: TermDOM["window"]) {
    return Math.max(1, window.innerWidth - FIELD_CHROME_WIDTH);
}

function autoGrowTextarea(
    window: TermDOM["window"],
    textarea: HTMLTextAreaElement,
    maxRows: number,
) {
    const recalc = () => {
        const rows = clamp(
            countWrappedRows(textarea.value, fieldContentWidth(window)),
            DEFAULT_TEXTAREA_MIN_ROWS,
            maxRows,
        );
        textarea.setAttribute("rows", String(rows));
    };
    textarea.addEventListener("input", recalc);
    window.addEventListener("resize", recalc);
    recalc();
    return recalc;
}

function addStyles(document: Document) {
    const style = document.createElement("style");
    style.textContent = STYLES;
    document.head.appendChild(style);
}

function createPromptRoot(document: Document, label: string) {
    const root = document.createElement("div");
    root.className = "prompt";
    if (label) {
        const labelNode = document.createElement("div");
        labelNode.className = "prompt-label";
        labelNode.textContent = label;
        root.appendChild(labelNode);
    }
    document.body.appendChild(root);
    return root;
}

function createField(document: Document, control: HTMLInputElement | HTMLTextAreaElement) {
    const field = document.createElement("div");
    field.className = "prompt-field";
    field.appendChild(control);
    return field;
}

type PromptSession<T> = {
    document: TermDOM["document"];
    window: TermDOM["window"];
    finish: (value: T) => void;
};

async function runPrompt<T>(
    fallback: T,
    mount: (session: PromptSession<T>) => void,
): Promise<T> {
    if (!Deno.stdin.isTerminal()) {
        return fallback;
    }

    let term: TermDOM | null = null;
    let settled = false;
    let resolveDone!: (value: T) => void;
    const done = new Promise<T>((resolve) => {
        resolveDone = resolve;
    });
    const finish = (value: T) => {
        if (settled) {
            return;
        }
        settled = true;
        resolveDone(value);
    };

    try {
        term = new TermDOM();
        mount({
            document: term.document,
            window: term.window,
            finish,
        });
        await term.attach();
        const value = await done;
        await term.dispose();
        return value;
    } catch (_error) {
        try {
            await term?.dispose();
        } catch (_disposeError) {
            // The terminal is already gone; nothing left to restore.
        }
        return fallback;
    }
}

export async function prompt({
    question,
    placeholder = "",
    defaultValue = "",
    type = "input",
    validate,
}: {
    question: string;
    placeholder?: string;
    defaultValue?: string;
    type?: "input" | "textarea" | "password";
    validate?: (value: string) => string | null;
}) {
    if (type === "textarea") {
        return await runPrompt<string>(
            defaultValue,
            ({ document, window, finish }) => {
                addStyles(document);
                const root = createPromptRoot(document, question);
                const textarea = document.createElement("textarea");
                textarea.placeholder = placeholder;
                textarea.value = defaultValue;
                root.appendChild(createField(document, textarea));
                autoGrowTextarea(window, textarea, DEFAULT_TEXTAREA_MAX_ROWS);
                textarea.focus();

                document.addEventListener("keydown", (event) => {
                    const e = event as KeyboardEvent;
                    if (e.key === "Enter") {
                        e.preventDefault();
                        finish(textarea.value);
                    } else if (e.key === "Escape") {
                        e.preventDefault();
                        finish(defaultValue);
                    }
                });
            },
        );
    }

    if (type !== "input" && type !== "password") {
        throw new Error(`Unsupported prompt type: ${type}`);
    }

    return await runPrompt<string>(
        defaultValue,
        ({ document, finish }) => {
            addStyles(document);
            const root = createPromptRoot(document, question);
            const input = document.createElement("input");
            input.type = type === "password" ? "password" : "text";
            input.placeholder = placeholder;
            input.value = defaultValue;
            root.appendChild(createField(document, input));
            const error = document.createElement("div");
            error.className = "prompt-error";
            root.appendChild(error);
            input.focus();

            const submit = () => {
                const message = validate?.(input.value) ?? null;
                if (message) {
                    error.textContent = `✗ ${message}`;
                    return;
                }
                finish(input.value);
            };

            document.addEventListener("keydown", (event) => {
                const e = event as KeyboardEvent;
                if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    finish(defaultValue);
                }
            });

            input.addEventListener("input", () => {
                if (error.textContent) {
                    error.textContent = "";
                }
            });
        },
    );
}

export async function confirmCommit({
    question,
    defaultValue = "",
}: {
    question: string;
    defaultValue?: string;
}): Promise<ConfirmCommitResult> {
    const fallback: ConfirmCommitResult = {
        action: "cancel",
        value: defaultValue,
    };

    return await runPrompt<ConfirmCommitResult>(
        fallback,
        ({ document, window, finish }) => {
            addStyles(document);
            const root = createPromptRoot(document, question);

            const textarea = document.createElement("textarea");
            textarea.value = defaultValue;
            root.appendChild(createField(document, textarea));
            autoGrowTextarea(window, textarea, 16);

            const actions = document.createElement("div");
            actions.className = "prompt-actions";
            const commitButton = document.createElement("button");
            commitButton.className = "primary";
            commitButton.textContent = "Commit (c)";
            const regenerateButton = document.createElement("button");
            regenerateButton.textContent = "Regenerate (r)";
            const cancelButton = document.createElement("button");
            cancelButton.textContent = "Cancel (esc)";
            actions.append(commitButton, regenerateButton, cancelButton);
            root.appendChild(actions);

            const issuesNode = document.createElement("div");
            issuesNode.className = "prompt-issues";
            root.appendChild(issuesNode);

            const submit = (action: ConfirmCommitAction) => {
                finish({ action, value: textarea.value });
            };

            const refreshIssues = () => {
                const subject = textarea.value.split("\n", 1)[0] || "";
                const issues = validateCommitMessage(textarea.value);
                const issueWarning = formatCommitMessageIssues(issues, subject);
                const counter = `subject length: ${subject.length}/72`;
                issuesNode.textContent = `${
                    issueWarning ? `${issueWarning} · ` : ""
                }${counter}`;
                issuesNode.classList.toggle("warning", issues.tooLong);
            };

            textarea.addEventListener("input", refreshIssues);

            commitButton.addEventListener("click", () => submit("commit"));
            regenerateButton.addEventListener("click", () =>
                submit("regenerate"));
            cancelButton.addEventListener("click", () => submit("cancel"));

            document.addEventListener("keydown", (event) => {
                const e = event as KeyboardEvent;
                const inTextarea = document.activeElement === textarea;
                if (e.key === "Escape") {
                    e.preventDefault();
                    submit("cancel");
                } else if (!inTextarea && (e.key === "c" || e.key === "C")) {
                    e.preventDefault();
                    submit("commit");
                } else if (!inTextarea && (e.key === "r" || e.key === "R")) {
                    e.preventDefault();
                    submit("regenerate");
                }
            }, true);

            refreshIssues();
            commitButton.focus();
        },
    );
}

export async function select({
    question,
    options,
    initialIndex = 0,
}: {
    question: string;
    options: string[];
    initialIndex?: number;
}): Promise<number> {
    if (options.length === 0) {
        throw new Error("Select prompt requires at least one option");
    }
    const start = clamp(initialIndex, 0, options.length - 1);

    return await runPrompt<number>(
        start,
        ({ document, finish }) => {
            addStyles(document);
            const root = createPromptRoot(document, question);
            const list = document.createElement("div");
            list.className = "prompt-list";
            const rows: HTMLDivElement[] = [];

            for (let index = 0; index < options.length; index++) {
                const row = document.createElement("div");
                row.className = "prompt-option";
                list.appendChild(row);
                rows.push(row);
            }
            root.appendChild(list);

            const hint = document.createElement("div");
            hint.className = "prompt-hint";
            hint.textContent = "↑/↓ to move · Enter to select · Esc to cancel";
            root.appendChild(hint);

            let index = start;
            const paint = () => {
                for (let i = 0; i < rows.length; i++) {
                    const selected = i === index;
                    rows[i].textContent = `${selected ? "▶" : " "} ${
                        options[i]
                    }`;
                    rows[i].classList.toggle("selected", selected);
                }
            };
            paint();

            document.addEventListener("keydown", (event) => {
                const e = event as KeyboardEvent;
                if (e.key === "ArrowUp") {
                    e.preventDefault();
                    index = (index - 1 + options.length) % options.length;
                    paint();
                } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    index = (index + 1) % options.length;
                    paint();
                } else if (e.key === "Enter") {
                    e.preventDefault();
                    finish(index);
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    finish(-1);
                }
            });
        },
    );
}

export async function confirm({
    question,
    defaultValue = false,
}: {
    question: string;
    defaultValue?: boolean;
}): Promise<boolean> {
    return await runPrompt<boolean>(
        defaultValue,
        ({ document, finish }) => {
            addStyles(document);
            const root = createPromptRoot(document, question);
            const row = document.createElement("div");
            row.className = "prompt-actions";
            const yes = document.createElement("div");
            const no = document.createElement("div");
            const hint = document.createElement("span");
            hint.className = "prompt-hint";
            hint.textContent = "(←/→, y/n, Enter)";
            row.append(yes, no, hint);
            root.appendChild(row);

            let value = defaultValue;
            const paint = () => {
                yes.className = value ? "prompt-chip selected" : "prompt-chip";
                no.className = value ? "prompt-chip" : "prompt-chip selected";
                yes.textContent = `${value ? "●" : "○"} Yes`;
                no.textContent = `${value ? "○" : "●"} No`;
            };
            paint();

            document.addEventListener("keydown", (event) => {
                const e = event as KeyboardEvent;
                if (e.key === "y" || e.key === "Y") {
                    finish(true);
                } else if (e.key === "n" || e.key === "N") {
                    finish(false);
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    finish(false);
                } else if (e.key === "Enter") {
                    e.preventDefault();
                    finish(value);
                } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    value = !value;
                    paint();
                }
            });
        },
    );
}
