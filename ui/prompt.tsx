import React from "react";
import { Box, useApp, useBoxMetrics, render, Text, type DOMElement } from "ink";
import {
    formatCommitMessageIssues,
    validateCommitMessage,
} from "../validate.ts";
import {
    Textarea,
    Form,
    Label,
    Input,
    Button,
    Div,
    useInkInput,
} from "@garn/ink-html";

type ConfirmCommitAction = "commit" | "regenerate" | "cancel";

type ConfirmCommitResult = {
    action: ConfirmCommitAction;
    value: string;
};

const DEFAULT_TEXTAREA_WIDTH = 40;
const DEFAULT_TEXTAREA_MIN_ROWS = 1;
const DEFAULT_TEXTAREA_MAX_ROWS = 12;

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

function useAutoGrowingTextareaRows(
    value: string,
    { minRows = DEFAULT_TEXTAREA_MIN_ROWS, maxRows = DEFAULT_TEXTAREA_MAX_ROWS } = {},
) {
    const ref = React.useRef<DOMElement | null>(null);
    const { width, hasMeasured } = useBoxMetrics(ref);
    const measuredWidth = hasMeasured ? width : DEFAULT_TEXTAREA_WIDTH;
    const rows = clamp(countWrappedRows(value, measuredWidth), minRows, maxRows);

    return { ref, rows };
}

async function renderPrompt<T>(node: React.ReactElement, fallbackValue: T, result: { value: T }) {
    const { waitUntilExit, clear } = render(node);
    try {
        await waitUntilExit();
    } catch (_error) {
        clear();
        await new Promise((resolve) => setTimeout(resolve, 100));
        return fallbackValue;
    }
    clear();
    await new Promise((resolve) => setTimeout(resolve, 100));

    return result.value;
}

async function renderCommittedPrompt<T>(node: React.ReactElement, result: { value: T }) {
    const { waitUntilExit, clear } = render(node);
    await waitUntilExit();
    clear();
    await new Promise((resolve) => setTimeout(resolve, 100));

    return result.value;
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
    const result = { value: "" };
    if (type === "input" || type === "password") {
        return await renderPrompt(
            <InputPrompt
                label={question}
                placeholder={placeholder}
                onSubmit={(value) => {
                    result.value = value;
                }}
                defaultValue={defaultValue}
                type={type}
                validate={validate}
            />,
            defaultValue,
            result,
        );
    } else if (type === "textarea") {
        return await renderPrompt(
            <TextareaPrompt
                label={question}
                placeholder={placeholder}
                onSubmit={(value) => {
                    result.value = value;
                }}
                defaultValue={defaultValue}
            />,
            defaultValue,
            result,
        );
    }
    throw new Error(`Unsupported prompt type: ${type}`);
}

export async function confirmCommit({
    question,
    defaultValue = "",
}: {
    question: string;
    defaultValue?: string;
}): Promise<ConfirmCommitResult> {
    const result = {
        value: {
            action: "cancel" as ConfirmCommitAction,
            value: defaultValue,
        },
    };

    return await renderCommittedPrompt(
        <ConfirmCommitPrompt
            label={question}
            defaultValue={defaultValue}
            onSubmit={(value) => {
                result.value = value;
            }}
        />,
        result,
    );
}

function TextareaPrompt({
    label,
    placeholder,
    onSubmit,
    defaultValue,
}: {
    label: string;
    placeholder: string;
    onSubmit: (value: string) => void;
    defaultValue: string;
}) {
    const { exit } = useApp();
    const [value, setValue] = React.useState(defaultValue);
    const inputId = React.useId();
    const { ref, rows } = useAutoGrowingTextareaRows(value, { minRows: 1 });

    return (

        <Form
            onSubmit={() => {
                onSubmit(value);
                exit();
            }}
            style={{ flexDirection: "column" }}
        >
            {label && <Label>{label}</Label>}
            <Box ref={ref} width="100%">
                <Textarea
                    id={inputId}
                    tabIndex={0}
                    hidden={false}
                    // deno-lint-ignore jsx-no-children-prop -- required by @garn/ink-html types
                    children=""
                    rows={rows}
                    style={{
                        width: "100%",
                        borderLeftStyle: "none",
                        borderRightStyle: "none",
                    }}
                    autoFocus
                    placeholder={placeholder}
                    value={value}
                    onChange={(e: any) => setValue(e.target.value)}
                    onKeyDown={(e: any) => {
                        if (e.key === "Enter") {
                            onSubmit(value);
                            exit();
                        }
                    }}
                ></Textarea>
            </Box>
            <Button
                id={`${inputId}-submit`}
                tabIndex={0}
                hidden={false}
                autoFocus={false}
                onClick={() => {
                    onSubmit(value);
                    exit();
                }}
            >
                Submit
            </Button>
        </Form>

    );
}

function ConfirmCommitPrompt({
    label,
    defaultValue,
    onSubmit,
}: {
    label: string;
    defaultValue: string;
    onSubmit: (value: ConfirmCommitResult) => void;
}) {
    const { exit } = useApp();
    const [value, setValue] = React.useState(defaultValue);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [isTextareaFocused, setIsTextareaFocused] = React.useState(false);
    const isSubmittingRef = React.useRef(false);
    const inputId = React.useId();
    const { ref, rows } = useAutoGrowingTextareaRows(value, { minRows: 1, maxRows: 16 });

    const submit = (action: ConfirmCommitAction) => {
        if (isSubmittingRef.current) {
            return;
        }
        isSubmittingRef.current = true;
        setIsSubmitting(true);
        onSubmit({ action, value });
        setTimeout(() => {
            exit();
        }, 100);
    };

    useInkInput(
        (input) => {
            if (input === "c" || input === "C") {
                submit("commit");
            }
        },
        { isActive: !isSubmitting && !isTextareaFocused },
    );

    useInkInput(
        (_input, key) => {
            if (key.escape) {
                submit("cancel");
            }
        },
        { isActive: !isSubmitting },
    );

    useInkInput(
        (input) => {
            if (input === "r" || input === "R") {
                submit("regenerate");
            }
        },
        { isActive: !isSubmitting && !isTextareaFocused },
    );

    return (
        <Form style={{ flexDirection: "column", gap: 0 }}>
            {label && <Label>{label}</Label>}
            <Box ref={ref} width="100%">
                <Textarea
                    id={inputId}
                    tabIndex={isSubmitting ? -1 : 0}
                    hidden={false}
                    autoFocus={false}
                    // deno-lint-ignore jsx-no-children-prop -- required by @garn/ink-html types
                    children=""
                    rows={rows}
                    style={{
                        width: "100%",
                        borderLeftStyle: "none",
                        borderRightStyle: "none",
                    }}
                    value={value}
                    onChange={(e: any) => setValue(e.target.value)}
                    onFocus={() => setIsTextareaFocused(true)}
                    onBlur={() => setIsTextareaFocused(false)}
                ></Textarea>
            </Box>
            {!isSubmitting && (
                <Div
                    id={`${inputId}-actions`}
                    tabIndex={-1}
                    hidden={false}
                    autoFocus={false}
                    style={{ flexDirection: "row", gap: 1 }}
                >
                    <Button
                        id={`${inputId}-commit`}
                        autoFocus
                        tabIndex={0}
                        hidden={false}
                        onClick={() => submit("commit")}
                    >
                        Commit (c)
                    </Button>
                    <Button
                        id={`${inputId}-regenerate`}
                        tabIndex={0}
                        hidden={false}
                        autoFocus={false}
                        onClick={() => submit("regenerate")}
                    >
                        Regenerate (r)
                    </Button>
                    <Button
                        id={`${inputId}-cancel`}
                        tabIndex={0}
                        hidden={false}
                        autoFocus={false}
                        onClick={() => submit("cancel")}
                    >
                        Cancel (esc)
                    </Button>
                </Div>
            )}
            {!isSubmitting && (() => {
                const subject = value.split("\n", 1)[0] || "";
                const issues = validateCommitMessage(value);
                const issueWarning = formatCommitMessageIssues(issues, subject);
                const counter = `subject length: ${subject.length}/72`;
                return (
                    <Div
                        id={`${inputId}-issues`}
                        tabIndex={-1}
                        hidden={false}
                        autoFocus={false}
                        style={{ flexDirection: "column", gap: 0 }}
                    >
                        <Text color={issues.tooLong ? "yellow" : "gray"}>
                            {issueWarning ? `${issueWarning} · ` : ""}{counter}
                        </Text>
                    </Div>
                );
            })()}
        </Form>
    );
}

function InputPrompt({
    label,
    placeholder,
    onSubmit,
    defaultValue,
    type,
    validate,
}: {
    label: string;
    placeholder: string;
    onSubmit: (value: string) => void;
    defaultValue: string;
    type?: "input" | "password";
    validate?: (value: string) => string | null;
}) {
    const { exit } = useApp();
    const [value, setValue] = React.useState(defaultValue);
    const [error, setError] = React.useState<string | null>(null);
    const inputId = React.useId();

    const submit = () => {
        const message = validate?.(value) ?? null;
        if (message) {
            setError(message);
            return;
        }
        onSubmit(value);
        exit();
    };

    return (
        <Form
            onSubmit={submit}
            style={{ flexDirection: "column", gap: 0 }}
        >
            <Box flexDirection="row" gap={1}>
                {label && <Label style={{ color: "blue" }}>{label}</Label>}
                <Input
                    id={inputId}
                    tabIndex={0}
                    hidden={false}
                    // deno-lint-ignore jsx-no-children-prop -- required by @garn/ink-html types
                    children=""
                    style={{
                        flexGrow: 1,
                        borderLeftStyle: "none",
                        borderRightStyle: "none",
                    }}
                    type={type === "password" ? "password" : "text"}
                    autoFocus
                    placeholder={placeholder}
                    value={value}
                    onChange={(e: any) => {
                        setValue(e.target.value);
                        if (error) setError(null);
                    }}
                    onKeyDown={(e: any) => {
                        if (e.key === "Enter") {
                            submit();
                        } else if (e.key === "Escape") {
                            onSubmit(defaultValue);
                            exit();
                        }
                    }}
                ></Input>
            </Box>
            {error && (
                <Box flexDirection="row">
                    <Text color="red">{`✗ ${error}`}</Text>
                </Box>
            )}
        </Form>
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
    const result = { value: clamp(initialIndex, 0, options.length - 1) };
    return await renderCommittedPrompt(
        <SelectPrompt
            label={question}
            options={options}
            initialIndex={result.value}
            onSubmit={(value) => {
                result.value = value;
            }}
        />,
        result,
    );
}

function SelectPrompt({
    label,
    options,
    initialIndex,
    onSubmit,
}: {
    label: string;
    options: string[];
    initialIndex: number;
    onSubmit: (index: number) => void;
}) {
    const { exit } = useApp();
    const [index, setIndex] = React.useState(initialIndex);

    const submit = () => {
        onSubmit(index);
        exit();
    };

    useInkInput((_input, key) => {
        if (key.upArrow) {
            setIndex((current) => (current - 1 + options.length) % options.length);
        } else if (key.downArrow) {
            setIndex((current) => (current + 1) % options.length);
        } else if (key.return) {
            submit();
        } else if (key.escape) {
            onSubmit(-1);
            exit();
        }
    });

    return (
        <Form onSubmit={submit} style={{ flexDirection: "column", gap: 0 }}>
            {label && <Label style={{ color: "blue" }}>{label}</Label>}
            <Box flexDirection="column">
                {options.map((option, optionIndex) => (
                    <Box key={`${option}-${optionIndex}`} flexDirection="row">
                        <Text color={optionIndex === index ? "cyan" : undefined}>
                            {`${optionIndex === index ? "▶" : " "} ${option}`}
                        </Text>
                    </Box>
                ))}
            </Box>
            <Box flexDirection="row">
                <Text color="gray">↑/↓ to move · Enter to select · Esc to cancel</Text>
            </Box>
        </Form>
    );
}

export async function confirm({
    question,
    defaultValue = false,
}: {
    question: string;
    defaultValue?: boolean;
}): Promise<boolean> {
    const result = { value: defaultValue };
    return await renderPrompt(
        <ConfirmPrompt
            label={question}
            defaultValue={defaultValue}
            onSubmit={(value) => {
                result.value = value;
            }}
        />,
        defaultValue,
        result,
    );
}

function ConfirmPrompt({
    label,
    defaultValue,
    onSubmit,
}: {
    label: string;
    defaultValue: boolean;
    onSubmit: (value: boolean) => void;
}) {
    const { exit } = useApp();
    const [value, setValue] = React.useState(defaultValue);

    useInkInput((input, key) => {
        if (input === "y" || input === "Y") {
            onSubmit(true);
            exit();
        } else if (input === "n" || input === "N") {
            onSubmit(false);
            exit();
        } else if (key.escape) {
            onSubmit(false);
            exit();
        } else if (key.return) {
            onSubmit(value);
            exit();
        } else if (key.leftArrow || key.rightArrow) {
            setValue((current) => !current);
        }
    });

    return (
        <Form
            onSubmit={() => {
                onSubmit(value);
                exit();
            }}
            style={{ flexDirection: "column", gap: 0 }}
        >
            {label && <Label style={{ color: "blue" }}>{label}</Label>}
            <Box flexDirection="row" gap={1}>
                <Text color={value ? "cyan" : undefined}>{`${value ? "●" : "○"} Yes`}</Text>
                <Text color={!value ? "cyan" : undefined}>{`${!value ? "●" : "○"} No`}</Text>
                <Text color="gray">(←/→, y/n, Enter)</Text>
            </Box>
        </Form>
    );
}

