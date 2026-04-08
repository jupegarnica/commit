import React from "react";
import { useApp, render, } from "ink";
import { Input, Label, Form } from "@garn/ink-html";


export async function prompt(label: string, placeholder = ""): Promise<string> {
    const result = { value: "" }
    const { waitUntilExit, clear } = render(
        <Prompt label={label} placeholder={placeholder} onSubmit={(value) => { result.value = value; }} />
    );

    await waitUntilExit();
    clear();
    return result.value;

};

function Prompt({ label, placeholder, onSubmit }: { label: string, placeholder: string, onSubmit: (value: string) => void }) {
    const { exit } = useApp();
    const [value, setValue] = React.useState("hello");

    return (
        <Form onSubmit={() => {
            onSubmit(value);
            exit();
        }}>
            <Label >
                {label}
            </Label>
            <Input
                autoFocus
                placeholder={placeholder}
                value={value}
                onChange={(e: any) => setValue(e.target.value)}
            />
        </Form>
    );
}

console.log(await prompt("name? ", "garn"));