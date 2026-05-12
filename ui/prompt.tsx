import React from "react";
import { Box, useApp, useBoxMetrics, render } from "ink";
import { Textarea, Form, Label, Input, Button, Div } from "@garn/ink-html";

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
    const ref = React.useRef<any>(null);
    const { width, hasMeasured } = useBoxMetrics(ref);
    const measuredWidth = hasMeasured ? width : DEFAULT_TEXTAREA_WIDTH;
    const rows = clamp(countWrappedRows(value, measuredWidth), minRows, maxRows);

    return { ref, rows };
}

async function renderPrompt<T>(node: React.ReactElement, fallbackValue: T, result: { value: T }) {
    const { waitUntilExit, clear } = render(node);
    const code = await waitUntilExit();
    clear();
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (code !== 0) {
        return fallbackValue;
    }

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
}: {
    question: string;
    placeholder?: string;
    defaultValue?: string;
    type?: "input" | "textarea" | "password";
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
    const { ref, rows } = useAutoGrowingTextareaRows(value, { minRows: 3 });

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
    const inputId = React.useId();
    const { ref, rows } = useAutoGrowingTextareaRows(value, { minRows: 3, maxRows: 16 });

    const submit = (action: ConfirmCommitAction) => {
        onSubmit({ action, value });
        setTimeout(() => {
            exit();
        }, 100);
    };

    return (
        <Form style={{ flexDirection: "column", gap: 0 }}>
            {label && <Label>{label}</Label>}
            <Box ref={ref} width="100%">
                <Textarea
                    id={inputId}
                    tabIndex={0}
                    hidden={false}
                    autoFocus={false}
                    children=""
                    rows={rows}
                    style={{
                        width: "100%",
                        borderLeftStyle: "none",
                        borderRightStyle: "none",
                    }}
                    value={value}
                    onChange={(e: any) => setValue(e.target.value)}
                ></Textarea>
            </Box>
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
                    Commit
                </Button>
                <Button
                    id={`${inputId}-regenerate`}
                    tabIndex={0}
                    hidden={false}
                    autoFocus={false}
                    onClick={() => submit("regenerate")}
                >
                    Regenerate
                </Button>
                <Button
                    id={`${inputId}-cancel`}
                    tabIndex={0}
                    hidden={false}
                    autoFocus={false}
                    onClick={() => submit("cancel")}
                >
                    Cancel
                </Button>
            </Div>
        </Form>
    );
}

function InputPrompt({
    label,
    placeholder,
    onSubmit,
    defaultValue,
    type,
}: {
    label: string;
    placeholder: string;
    onSubmit: (value: string) => void;
    defaultValue: string;
    type?: "input" | "password";
}) {
    const { exit } = useApp();
    const [value, setValue] = React.useState(defaultValue);
    const inputId = React.useId();

    return (
        <Form
            onSubmit={() => {
                onSubmit(value);
                exit();
            }}
            style={{ flexDirection: "row", gap: 1 }}
        >
            {label && <Label style={{ color: "blue" }}>{label}</Label>}
            <Input
                id={inputId}
                tabIndex={0}
                hidden={false}
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
                onChange={(e: any) => setValue(e.target.value)}
                onKeyDown={(e: any) => {
                    if (e.key === "Enter") {
                        onSubmit(value);
                        exit();
                    }
                }}
            ></Input>
        </Form>
    );
}

// WIP

// export async function select({
//     question,
//     options,
// }: {
//     question: string;
//     options: string[];
// }) {
//     if (options.length === 0) {
//         throw new Error("Select prompt requires at least one option");
//     }

//     const result = { value: options[0] };
//     const { waitUntilExit, clear } = render(
//         <SelectPrompt
//             label={question}
//             options={options}
//             onSubmit={(value) => {
//                 result.value = value;
//             }}
//         />,
//     );

//     await waitUntilExit();
//     clear();
//     return result.value;
// }

// function SelectPrompt({
//     label,
//     options,
//     onSubmit,
// }: {
//     label: string;
//     options: string[];
//     onSubmit: (value: string) => void;
// }) {
//     const { exit } = useApp();
//     const [value, setValue] = React.useState(options[0]);
//     const name = React.useId();

//     const submit = () => {
//         onSubmit(value);
//         exit();
//     };

//     return (
//         <Form
//             onSubmit={submit}
//             style={{ flexDirection: "column", gap: 1 }}
//         >
//             {label && <Label>{label}</Label>}
//             <Div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
//             {options.map((option, index) => (
//                 <Input
//                     key={`${option}-${index}`}
//                     id={`${name}-${index}`}
//                     tabIndex={0}
//                     hidden={false}
//                     type="radio"
//                     autoFocus={index === 0}
//                     name={name}
//                     value={option}
//                     onChange={() => setValue(option)}
//                     checked={value === option}
//                     onKeyDown={(e: any) => {
//                         console.log('onKeyDown', e)
//                         if (e.key === "Enter") {
//                             submit();
//                         } else if (e.key === "ArrowDown") {
//                             setValue(options[(index + 1) % options.length]);
//                         } else if (e.key === "ArrowUp") {
//                             setValue(
//                                 options[
//                                     (index - 1 + options.length) % options.length
//                                 ],
//                             );
//                         }
//                     }}
//                 >
//                     {option}
//                 </Input>
//             ))}
//             </Div>
//             <Button
//                 id={`${name}-submit`}
//                 tabIndex={0}
//                 hidden={false}
//                 autoFocus={false}
//                 onClick={submit}
//             >
//                 Submit
//             </Button>
//         </Form>
//     );
// }
