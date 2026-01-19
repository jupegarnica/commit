import { assertEquals } from "jsr:@std/assert@1.0.7";
import { collectExtraCommitArgs, hasNoVerifyFlag } from "./commit.ts";

Deno.test("collectExtraCommitArgs ignores known flags and forwards unknown", () => {
  const args = ["--add", "--push", "--no-verify"];
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
