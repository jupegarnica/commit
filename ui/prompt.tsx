import React from "react";
import { useApp, render } from "ink";
import { Textarea, Form, Label, Input, Button } from "@garn/ink-html";

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
        const { waitUntilExit, clear } = render(
            <InputPrompt
                label={question}
                placeholder={placeholder}
                onSubmit={(value) => {
                    result.value = value;
                }}
                defaultValue={defaultValue}
                type={type}
            />,
        );

        await waitUntilExit();
        clear();
        return result.value;
    } else if (type === "textarea") {
        const { waitUntilExit, clear } = render(
            <TextareaPrompt
                label={question}
                placeholder={placeholder}
                onSubmit={(value) => {
                    result.value = value;
                }}
                defaultValue={defaultValue}
            />,
        );

        await waitUntilExit();
        clear();
        return result.value;
    }
    throw new Error(`Unsupported prompt type: ${type}`);
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

    return (
        <Form
            onSubmit={() => {
                onSubmit(value);
                exit();
            }}
            style={{ flexDirection: "column" }}
        >
            {label && <Label>{label}</Label>}
            <Textarea
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
            />
            <Button
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
            />
        </Form>
    );
}