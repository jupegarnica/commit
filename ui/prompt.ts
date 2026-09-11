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

const STYLES = `
    .prompt { display: flex; flex-direction: column; }
    .prompt-label { color: #5fafff; }
    .prompt-row { display: flex; flex-direction: row; gap: 1ch; }
    .prompt-error { color: #ff5f5f; }
    .prompt-hint { color: #808080; }
    .prompt-option { color: #ffffff; }
    .prompt-option.selected { color: #00d7ff; }
    .prompt-actions { display: flex; flex-direction: row; gap: 1ch; }
    .prompt-issues { color: #808080; }
    .prompt-issues.warning { color: #ffd75f; }
    input, textarea {
        border: none;
        padding: 0;
        flex-grow: 1;
    }
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
                const row = document.createElement("div");
                row.className = "prompt-row";
                const textarea = document.createElement("textarea");
                textarea.placeholder = placeholder;
                textarea.value = defaultValue;
                const initialRows = clamp(
                    countWrappedRows(defaultValue, window.innerWidth),
                    DEFAULT_TEXTAREA_MIN_ROWS,
                    DEFAULT_TEXTAREA_MAX_ROWS,
                );
                textarea.setAttribute("rows", String(initialRows));
                row.appendChild(textarea);
                root.appendChild(row);
                textarea.focus();

                textarea.addEventListener("input", () => {
                    const rows = clamp(
                        countWrappedRows(textarea.value, window.innerWidth),
                        DEFAULT_TEXTAREA_MIN_ROWS,
                        DEFAULT_TEXTAREA_MAX_ROWS,
                    );
                    textarea.setAttribute("rows", String(rows));
                });

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
            const row = document.createElement("div");
            row.className = "prompt-row";
            const input = document.createElement("input");
            input.type = type === "password" ? "password" : "text";
            input.placeholder = placeholder;
            input.value = defaultValue;
            row.appendChild(input);
            root.appendChild(row);
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

            const row = document.createElement("div");
            row.className = "prompt-row";
            const textarea = document.createElement("textarea");
            textarea.value = defaultValue;
            const initialRows = clamp(
                countWrappedRows(defaultValue, window.innerWidth),
                DEFAULT_TEXTAREA_MIN_ROWS,
                16,
            );
            textarea.setAttribute("rows", String(initialRows));
            row.appendChild(textarea);
            root.appendChild(row);

            const actions = document.createElement("div");
            actions.className = "prompt-actions";
            const commitButton = document.createElement("button");
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

            textarea.addEventListener("input", () => {
                const rows = clamp(
                    countWrappedRows(textarea.value, window.innerWidth),
                    DEFAULT_TEXTAREA_MIN_ROWS,
                    16,
                );
                textarea.setAttribute("rows", String(rows));
                refreshIssues();
            });

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
            list.className = "prompt";
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
            row.className = "prompt-row";
            const yes = document.createElement("span");
            const no = document.createElement("span");
            const hint = document.createElement("span");
            hint.className = "prompt-hint";
            hint.textContent = "(←/→, y/n, Enter)";
            row.append(yes, no, hint);
            root.appendChild(row);

            let value = defaultValue;
            const paint = () => {
                yes.className = value ? "prompt-option selected" : "prompt-option";
                no.className = value ? "prompt-option" : "prompt-option selected";
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
