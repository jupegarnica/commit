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

        const code = await waitUntilExit();
        clear();
        await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for the UI to clear before returning the result
        if (code !== 0) {
            return defaultValue;
        }
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

        const code = await waitUntilExit();
        clear();
        await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for the UI to clear before returning the result
        if (code !== 0) {
            return defaultValue;
        }
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
    const inputId = React.useId();

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
                id={inputId}
                tabIndex={0}
                hidden={false}
                children=""
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
