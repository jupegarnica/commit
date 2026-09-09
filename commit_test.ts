import { assertEquals } from "jsr:@std/assert@1.0.7";
import {
  appendCoAuthor,
  collectExtraCommitArgs,
  hasNoVerifyFlag,
} from "./commit.ts";

Deno.test("collectExtraCommitArgs ignores known flags and forwards unknown", () => {
  const args = ["--add", "--push", "--no-verify"];
  assertEquals(collectExtraCommitArgs(args), ["--no-verify"]);
});

Deno.test("collectExtraCommitArgs skips --provider with value", () => {
  const args = ["--provider", "openai", "--no-verify"];
  assertEquals(collectExtraCommitArgs(args), ["--no-verify"]);
});

Deno.test("collectExtraCommitArgs skips -p with value", () => {
  const args = ["-p", "anthropic", "--no-verify"];
  assertEquals(collectExtraCommitArgs(args), ["--no-verify"]);
});

Deno.test("collectExtraCommitArgs forwards unknown short flags", () => {
  const args = ["-n", "--add", "-v"];
  assertEquals(collectExtraCommitArgs(args), ["-n", "-v"]);
});

Deno.test("collectExtraCommitArgs skips known short string value", () => {
  const args = ["-M", "gpt-4o", "--no-verify"];
  assertEquals(collectExtraCommitArgs(args), ["--no-verify"]);
});

Deno.test("collectExtraCommitArgs handles combined known booleans", () => {
  const args = ["-AP", "--no-verify"];
  assertEquals(collectExtraCommitArgs(args), ["--no-verify"]);
});

Deno.test("collectExtraCommitArgs forwards unknown long with value", () => {
  const args = ["--reuse-message=HEAD", "--add"];
  assertEquals(collectExtraCommitArgs(args), ["--reuse-message=HEAD"]);
});

Deno.test("collectExtraCommitArgs forwards passthrough after --", () => {
  const args = ["--add", "--", "--no-verify", "-n"];
  assertEquals(collectExtraCommitArgs(args), ["--no-verify", "-n"]);
});

Deno.test("hasNoVerifyFlag detects --no-verify", () => {
  const args = ["--no-verify"];
  assertEquals(hasNoVerifyFlag(args), true);
});

Deno.test("hasNoVerifyFlag detects -n", () => {
  const args = ["-n"];
  assertEquals(hasNoVerifyFlag(args), true);
});

Deno.test("hasNoVerifyFlag detects combined short flags with n", () => {
  const args = ["-an"];
  assertEquals(hasNoVerifyFlag(args), true);
});

Deno.test("hasNoVerifyFlag returns false when absent", () => {
  const args = ["--reuse-message=HEAD", "-v"];
  assertEquals(hasNoVerifyFlag(args), false);
});

Deno.test("appendCoAuthor replaces {model} and {email}", () => {
  const result = appendCoAuthor(
    "feat: add login",
    "Co-Authored-By: {model} <{email}>",
    {
      model: "claude-haiku-4-5",
      email: "noreply@anthropic.com",
    },
  );
  assertEquals(
    result,
    "feat: add login\n\nCo-Authored-By: claude-haiku-4-5 <noreply@anthropic.com>",
  );
});

Deno.test("appendCoAuthor replaces model without placeholder email", () => {
  const result = appendCoAuthor(
    "fix: handle null",
    "Co-Authored-By: {model} <noreply@anthropic.com>",
    { model: "claude-haiku-4-5" },
  );
  assertEquals(
    result,
    "fix: handle null\n\nCo-Authored-By: claude-haiku-4-5 <noreply@anthropic.com>",
  );
});

Deno.test("appendCoAuthor leaves message unchanged for empty pattern", () => {
  assertEquals(
    appendCoAuthor("feat: add login", "", { model: "m", email: "e" }),
    "feat: add login",
  );
});

Deno.test("appendCoAuthor leaves message unchanged when email is missing", () => {
  assertEquals(
    appendCoAuthor("feat: add login", "Co-Authored-By: {model} <{email}>", {
      model: "claude-haiku-4-5",
    }),
    "feat: add login",
  );
});

Deno.test("appendCoAuthor leaves message unchanged when model is missing", () => {
  assertEquals(
    appendCoAuthor("feat: add login", "Co-Authored-By: {model} <{email}>", {
      model: "",
      email: "noreply@anthropic.com",
    }),
    "feat: add login",
  );
});

Deno.test("appendCoAuthor does not duplicate existing signature", () => {
  const message =
    "feat: add login\n\nCo-Authored-By: claude-haiku-4-5 <noreply@anthropic.com>";
  assertEquals(
    appendCoAuthor(message, "Co-Authored-By: {model} <{email}>", {
      model: "claude-haiku-4-5",
      email: "noreply@anthropic.com",
    }),
    message,
  );
});

Deno.test("appendCoAuthor trims pattern", () => {
  const result = appendCoAuthor(
    "feat: add login",
    "  Co-Authored-By: {model}  ",
    {
      model: "gpt-5-nano",
    },
  );
  assertEquals(result, "feat: add login\n\nCo-Authored-By: gpt-5-nano");
});

Deno.test("collectExtraCommitArgs skips --co-author with value", () => {
  const args = [
    "--co-author",
    "Co-Authored-By: {model} <{email}>",
    "--no-verify",
  ];
  assertEquals(collectExtraCommitArgs(args), ["--no-verify"]);
});

Deno.test("collectExtraCommitArgs skips --co-author with = value", () => {
  const args = ["--co-author=Co-Authored-By: {model}", "--add"];
  assertEquals(collectExtraCommitArgs(args), []);
});

Deno.test("collectExtraCommitArgs skips --co-author-email with value", () => {
  const args = [
    "--co-author-email",
    "noreply@anthropic.com",
    "--no-verify",
  ];
  assertEquals(collectExtraCommitArgs(args), ["--no-verify"]);
});

Deno.test("collectExtraCommitArgs skips --co-author-email with = value", () => {
  const args = ["--co-author-email=noreply@openai.com", "--push"];
  assertEquals(collectExtraCommitArgs(args), []);
});
