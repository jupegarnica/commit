import React from "react";
import { render, useFocusManager } from "ink";
// import { Input, Label, Form } from "@garn/ink-html";
import { Div, Form, Select, Option, Label } from "../../ink-html/src/index.ts";

export async function select(
    { label, helpText, defaultValue,  items }: {
        label: string;
        defaultValue?: string;
        helpText?: string;
        items: string[];

    },
): Promise<string> {
    const result = { value: "" };
    const { waitUntilExit, clear, unmount } = render(
        <Prompt
            label={label}
            defaultValue={defaultValue}
            onSubmit={(value) => {
                result.value = value;
                clear();
                unmount();
            }}
            helpText={helpText}
            items={items}
        />,
    );

    await waitUntilExit();
    return result.value;
}

function Prompt({
    label,
    defaultValue,
    onSubmit,
    helpText,
    items,
}: {
    label: string;
    helpText?: string;
    defaultValue?: string;
    items: string[];
    onSubmit: (value: string) => void;
}) {
    const [value, setValue] = React.useState(defaultValue ?? "");
    const focusManager = useFocusManager();

    return (
        <Form
            onSubmit={async () => {
                onSubmit(value);
            }}
        >
            <Div
                style={{ flexDirection: "row", gap: 1, alignItems: "flex-start" }}
            >
                <Label style={{ color: "cyan" }} tabIndex={0}>
                    {label}
                </Label>
                <Select
                    style={{
                        borderLeftStyle: "none",
                        borderRightStyle: "none",
                        flexGrow: 1,
                    }}
                    autoFocus
                    tabIndex={1}
                    onBlur={() => {
                        focusManager.focusPrevious();
                    }}
                    value={value}
                    onChange={(e: any) => setValue(e.target.value)}
                >
                    {items.map((item) => (
                        <Option key={item} value={item}>
                            {item}
                        </Option>
                    ))}
                </Select>
            </Div>
            {helpText && (
                <Div style={{ color: "gray" }}>
                    {helpText}
                </Div>
            )}
        </Form>
    );
}

console.log(
    await select({
        label: "Select an option:",
        defaultValue: "Option 2",
        helpText: "Use arrow keys to navigate and Enter to select.",
        items: ["Option 1", "Option 2", "Option 3"],
    }),
);
