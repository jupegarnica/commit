import { assertEquals } from "jsr:@std/assert@1.0.7";
import {
  appendCoAuthor,
  collectExtraCommitArgs,
  countWords,
  extractTicketFromBranch,
  hasNoVerifyFlag,
  KNOWN_BOOLEAN_LONG,
  KNOWN_BOOLEAN_SHORT,
  KNOWN_STRING_LONG,
  KNOWN_STRING_SHORT,
  splitDiffIntoBoundedChunks,
  splitDiffIntoChunks,
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

Deno.test("splitDiffIntoBoundedChunks respects budget and keeps big chunks whole", () => {
  const small = (name: string) =>
    `diff --git a/${name} b/${name}\n+${"word ".repeat(50)}`;
  const diff = [small("a"), small("b"), small("c"), small("d")].join("\n");
  const chunks = splitDiffIntoBoundedChunks(diff, 600);
  assertEquals(chunks.length, 2);
  const huge = `diff --git a/huge b/huge\n+${"word ".repeat(1000)}`;
  const withHuge = splitDiffIntoBoundedChunks(`${small("a")}\n${huge}`, 600);
  assertEquals(withHuge.length, 2);
});

Deno.test("extractTicketFromBranch detects common ticket patterns", () => {
  assertEquals(extractTicketFromBranch("feat/PROJ-123-add-login"), "PROJ-123");
  assertEquals(extractTicketFromBranch("fix/AB-42-handle-null"), "AB-42");
  assertEquals(extractTicketFromBranch("PROJ-999_direct"), "PROJ-999");
  assertEquals(extractTicketFromBranch("hotfix/TEAM_7-bug"), "TEAM-7");
  assertEquals(extractTicketFromBranch("feature/myproj-12-x"), "MYPROJ-12");
});

Deno.test("extractTicketFromBranch ignores non-ticket branches", () => {
  assertEquals(extractTicketFromBranch("main"), null);
  assertEquals(extractTicketFromBranch("develop"), null);
  assertEquals(extractTicketFromBranch("feat/add-login"), null);
  assertEquals(extractTicketFromBranch("v2-upgrade"), null);
  assertEquals(extractTicketFromBranch("hotfix1"), null);
  assertEquals(extractTicketFromBranch(""), null);
  assertEquals(extractTicketFromBranch(null), null);
  assertEquals(extractTicketFromBranch(undefined), null);
});

Deno.test("extractTicketFromBranch is case-insensitive and uppercases", () => {
  assertEquals(extractTicketFromBranch("feat/proj-123-x"), "PROJ-123");
  assertEquals(extractTicketFromBranch("release/ab-7"), "AB-7");
});

Deno.test("buildKnownSets derives expected flag sets from CLI_FLAGS", () => {
  assertEquals(KNOWN_BOOLEAN_LONG.has("add"), true);
  assertEquals(KNOWN_STRING_LONG.has("co-author"), true);
  assertEquals(KNOWN_BOOLEAN_SHORT.has("A"), true);
  assertEquals(KNOWN_STRING_SHORT.has("K"), true);
  assertEquals(KNOWN_BOOLEAN_SHORT.has("Y"), true);
  assertEquals(KNOWN_BOOLEAN_LONG.size, 9);
  assertEquals(KNOWN_STRING_LONG.size, 9);
  assertEquals(KNOWN_BOOLEAN_SHORT.size, 11);
  assertEquals(KNOWN_STRING_SHORT.size, 7);
});
