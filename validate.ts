export const CONVENTIONAL_PREFIX_RE =
  /^(feat|fix|refactor|docs|style|test|chore|perf|build|ci|revert)(\(.+\))?:/;

export type CommitMessageIssues = {
  tooLong: boolean;
  missingPrefix: boolean;
  trailingPeriod: boolean;
};

export function validateCommitMessage(message: string): CommitMessageIssues {
  const subject = (message.split("\n", 1)[0] || "").trim();
  return {
    tooLong: subject.length > 72,
    missingPrefix: !CONVENTIONAL_PREFIX_RE.test(subject),
    trailingPeriod: subject.endsWith("."),
  };
}

export function formatCommitMessageIssues(
  issues: CommitMessageIssues,
  subject: string,
): string | null {
  const warnings: string[] = [];
  if (issues.tooLong) {
    warnings.push(`subject is ${subject.length} chars (> 72)`);
  }
  if (issues.missingPrefix) {
    warnings.push("missing conventional prefix (feat/fix/refactor/...)");
  }
  if (issues.trailingPeriod) {
    warnings.push("subject ends with a period");
  }
  if (warnings.length === 0) {
    return null;
  }
  return `⚠️  ${warnings.join("; ")}`;
}