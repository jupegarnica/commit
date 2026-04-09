import React from "react";
import { render, useFocusManager } from "ink";
// import { Input, Label, Form } from "@garn/ink-html";
import { Div, Form, Input, Label } from "../../ink-html/src/index.ts";

export async function input(
  { label, placeholder, helpText, defaultValue, type }: {
    label: string;
    placeholder?: string;
    defaultValue?: string;
    type?: "text" | "password";
    helpText?: string;
  },
): Promise<string> {
  const result = { value: "" };
  const { waitUntilExit, clear, unmount } = render(
    <Prompt
      label={label}
      placeholder={placeholder}
      defaultValue={defaultValue}
      type={type}
      onSubmit={(value) => {
        result.value = value;
        clear();
        unmount();
      }}
      helpText={helpText}
    />,
  );

  await waitUntilExit();
  return result.value;
}

function Prompt({
  label,
  placeholder,
  defaultValue,
  type,
  onSubmit,
  helpText,
}: {
  label: string;
  placeholder?: string;
  helpText?: string;
  defaultValue?: string;
  type?: "text" | "password";
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
        <Input
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
          placeholder={placeholder}
          value={value}
          type={type}
          onChange={(e: any) => setValue(e.target.value)}
        />
      </Div>
      {helpText && (
        <Div style={{ color: "gray" }}>
          {helpText}
        </Div>
      )}
    </Form>
  );
}
