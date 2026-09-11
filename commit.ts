import $ from "@david/dax";
import * as colors from "@std/fmt/colors";
import { parseArgs } from "@std/cli";
import { askLLM } from "./gpt.ts";
import { PROVIDERS, VALID_PROVIDERS } from "./providers.ts";
import { confirm, confirmCommit, prompt, select } from "./ui/prompt.ts";
import { startSpinner, stopSpinner } from "./spinner.ts";

async function daxSilent(strings: TemplateStringsArray, ...values: unknown[]) {
  try {
    return await $.raw(strings, ...values.map(String)).text();
  } catch (error) {
    console.error(error);
    Deno.exit(1);
  }
}

// Extra single-char aliases that behave like a boolean but are not unique
// flags (documented as synonyms of --skip-edit).
const EXTRA_ALIASES: Record<string, string[]> = {
  "skip-edit": ["Y", "y"],
};

export type FlagDef = {
  name: string;
  short?: string;
  type: "boolean" | "string";
};

export const CLI_FLAGS: FlagDef[] = [
  { name: "add", short: "A", type: "boolean" },
  { name: "push", short: "P", type: "boolean" },
  { name: "amend", short: "E", type: "boolean" },
  { name: "debug", short: "D", type: "boolean" },
  { name: "config", short: "C", type: "boolean" },
  { name: "skip-edit", short: "S", type: "boolean" },
  { name: "no-commit", short: "N", type: "boolean" },
  { name: "help", short: "H", type: "boolean" },
  { name: "version", short: "V", type: "boolean" },
  { name: "api-key", short: "K", type: "string" },
  { name: "model", short: "M", type: "string" },
  { name: "base-URL", short: "B", type: "string" },
  { name: "max-words", short: "W", type: "string" },
  { name: "commits-to-learn", short: "L", type: "string" },
  { name: "unified", short: "U", type: "string" },
  { name: "provider", short: "p", type: "string" },
  { name: "co-author", type: "string" },
  { name: "co-author-email", type: "string" },
  { name: "commit-language", type: "string" },
  { name: "commit-style", type: "string" },
  { name: "hint", type: "string" },
  { name: "body", type: "boolean" },
  { name: "dry-run", type: "boolean" },
];

// parseArgs treats extra aliases as booleans, so single-char aliases of
// string flags need special handling in collectExtraCommitArgs.
function buildKnownSets(flags: FlagDef[]): {
  booleanLong: Set<string>;
  stringLong: Set<string>;
  booleanShort: Set<string>;
  stringShort: Set<string>;
} {
  const booleanLong = new Set<string>();
  const stringLong = new Set<string>();
  const booleanShort = new Set<string>();
  const stringShort = new Set<string>();
  for (const flag of flags) {
    if (flag.type === "boolean") {
      booleanLong.add(flag.name);
      for (const short of [flag.short, ...(EXTRA_ALIASES[flag.name] || [])]) {
        if (short) booleanShort.add(short);
      }
    } else {
      stringLong.add(flag.name);
      if (flag.short) stringShort.add(flag.short);
    }
  }
  return { booleanLong, stringLong, booleanShort, stringShort };
}

const knownSets: {
  booleanLong: Set<string>;
  stringLong: Set<string>;
  booleanShort: Set<string>;
  stringShort: Set<string>;
} = buildKnownSets(CLI_FLAGS);

export const KNOWN_BOOLEAN_LONG = knownSets.booleanLong;
export const KNOWN_STRING_LONG = knownSets.stringLong;
export const KNOWN_BOOLEAN_SHORT = knownSets.booleanShort;
export const KNOWN_STRING_SHORT = knownSets.stringShort;

export function buildParseArgsOptions(flags: FlagDef[]): {
  boolean: string[];
  string: string[];
  alias: Record<string, string | string[]>;
} {
  const boolean: string[] = [];
  const string: string[] = [];
  const alias: Record<string, string | string[]> = {};
  for (const flag of flags) {
    if (flag.type === "boolean") {
      boolean.push(flag.name);
    } else {
      string.push(flag.name);
    }
    const shorts = [flag.short, ...(EXTRA_ALIASES[flag.name] || [])].filter(
      (s): s is string => Boolean(s),
    );
    if (shorts.length > 0) {
      alias[flag.name] = shorts.length === 1 ? shorts[0] : shorts;
    }
  }
  return { boolean, string, alias };
}

export function collectExtraCommitArgs(argv: string[]): string[] {
  const extras: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--") {
      extras.push(...argv.slice(i + 1));
      break;
    }

    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=", 2);
      if (KNOWN_BOOLEAN_LONG.has(key) || KNOWN_STRING_LONG.has(key)) {
        if (!arg.includes("=") && KNOWN_STRING_LONG.has(key)) {
          i++;
        }
        continue;
      }

      extras.push(arg);
      if (!arg.includes("=") && value === undefined) {
        const next = argv[i + 1];
        if (next && !next.startsWith("-")) {
          extras.push(next);
          i++;
        }
      }
      continue;
    }

    if (arg.startsWith("-") && arg !== "-") {
      const short = arg.slice(1);

      if (short.length === 1) {
        const key = short;
        if (KNOWN_BOOLEAN_SHORT.has(key) || KNOWN_STRING_SHORT.has(key)) {
          if (KNOWN_STRING_SHORT.has(key)) {
            i++;
          }
          continue;
        }
        extras.push(arg);
        const next = argv[i + 1];
        if (next && !next.startsWith("-")) {
          extras.push(next);
          i++;
        }
        continue;
      }

      if (short.includes("=")) {
        const [key] = short.split("=", 2);
        if (KNOWN_BOOLEAN_SHORT.has(key) || KNOWN_STRING_SHORT.has(key)) {
          continue;
        }
        extras.push(arg);
        continue;
      }

      const chars = short.split("");
      const hasKnownString = chars.some((c) => KNOWN_STRING_SHORT.has(c));
      const hasUnknown = chars.some((c) => !KNOWN_BOOLEAN_SHORT.has(c));

      if (!hasUnknown) {
        continue;
      }

      extras.push(arg);
      if (hasKnownString) {
        const next = argv[i + 1];
        if (next && !next.startsWith("-")) {
          extras.push(next);
          i++;
        }
      }
      continue;
    }

    extras.push(arg);
  }

  return extras;
}

export function hasNoVerifyFlag(extraCommitArgs: string[]): boolean {
  return extraCommitArgs.some((arg) => {
    if (arg === "--no-verify" || arg === "-n") {
      return true;
    }
    if (arg.startsWith("-") && !arg.startsWith("--")) {
      return arg.slice(1).includes("n");
    }
    return false;
  });
}

export function appendCoAuthor(
  message: string,
  pattern: string,
  values: { model: string; email?: string },
): string {
  const trimmedPattern = pattern.trim();
  if (!trimmedPattern) {
    return message;
  }
  let signature = trimmedPattern;
  if (signature.includes("{model}")) {
    if (!values.model) {
      return message;
    }
    signature = signature.replaceAll("{model}", values.model);
  }
  if (signature.includes("{email}")) {
    if (!values.email) {
      return message;
    }
    signature = signature.replaceAll("{email}", values.email);
  }
  if (message.includes(signature)) {
    return message;
  }
  return `${message}\n\n${signature}`;
}

async function getPreCommitHookPath(): Promise<string | null> {
  const hookPath = (
    await daxSilent`git rev-parse --git-path hooks/pre-commit`
  ).trim();
  if (!hookPath) {
    return null;
  }
  try {
    const stat = await Deno.stat(hookPath);
    if (stat.isFile) {
      return hookPath;
    }
  } catch (_error) {
    return null;
  }
  return null;
}

async function runCommand(command: string, args: string[]): Promise<number> {
  const cmd = new Deno.Command(command, {
    args,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const { code } = await cmd.output();
  if (code !== 0) {
    Deno.exit(code);
  }
  return code;
}

async function runCommandCapture(
  command: string,
  args: string[],
): Promise<number> {
  const cmd = new Deno.Command(command, {
    args,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const { code } = await cmd.output();
  return code;
}

export function buildRetryHint(messagePath: string): string {
  return `git commit --no-verify -F ${messagePath}`;
}

export function extractTicketFromBranch(
  branch: string | null | undefined,
): string | null {
  if (!branch) {
    return null;
  }
  const match = branch.match(
    /(?:^|[\/._-])((?:[A-Za-z]{2,10})[-_]?\d{1,6})(?:$|[^0-9a-z])/i,
  );
  if (!match) {
    return null;
  }
  const ticket = match[1].replace("_", "-").toUpperCase();
  // Require a letter prefix of at least 2 chars and a number: avoids matching words like "v2" or "hotfix1".
  return /^[A-Z]{2,10}-\d{1,6}$/.test(ticket) ? ticket : null;
}

export const DEFAULT_COMMIT_STYLE =
  "conventional commits: use a type prefix — 'feat:' for new features where the code behavior changes, 'fix:' for bug fixes where the code behavior changes, 'refactor:' for code refactoring where the code behavior does not change, 'docs:' for documentation changes, 'style:' for changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc), 'test:' for adding tests, 'chore:' for changes to the build process or auxiliary tools and libraries such as documentation generation.";

export function buildSystemPrompt(options: {
  commits?: string;
  ticket?: string | null;
  language?: string;
  style?: string;
  hint?: string;
  body?: boolean;
}): string {
  let systemContent = `You are an expert in git diffs.
    You are helping a user to create a commit message for a git diff.
    Do not use any markdown markup, only text.
    Only describe the changes in the code, do not include any other information like purpose of the changes or which file has been modified.
    Do not output any file names or line numbers.
    If the git diff is empty return an empty string with zero characters.
    Only include the commit message, do not include anything else, just the commit message without any quotes or backticks.
    `;
  if (options.commits) {
    systemContent +=
      `\nYou should follow the commit style of these commits:\n${options.commits}`;
  }
  if (options.language) {
    systemContent += `\nWrite the commit message in ${options.language}.`;
  }
  if (options.style) {
    systemContent += `\nUse this commit style: ${options.style}.`;
  } else {
    systemContent += `\nUse this commit style: ${DEFAULT_COMMIT_STYLE}`;
  }
  if (options.hint) {
    systemContent +=
      `\nAdditional context from the user. Reflect it in the message if relevant:\n${options.hint}`;
  }
  if (options.body) {
    systemContent +=
      `\nAfter the subject line, add an empty line and 3-6 bullet lines starting with "- " describing the main changes by topic.`;
  }
  if (options.ticket) {
    systemContent +=
      `\nThis work relates to ticket ${options.ticket} (inferred from the git branch name).\nInclude it as the conventional commit scope, e.g. "type(${options.ticket.toLowerCase()}): subject".`;
  }
  return systemContent;
}

// Rough token estimate: ~4 chars per token for code/diffs.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Backwards-compatible limit: --max-words semantics kept, expressed in tokens.
export function maxWordsToTokens(maxWords: number): number {
  return Math.round(maxWords * 1.3);
}

export const LLM_TIMEOUT_MS = 120_000;

export function isTransientLLMError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error);
  if (/401|403|unauthorized|429|rate.?limit|404|not.?found|no such model/i.test(
    raw,
  )) {
    return false;
  }
  return /timed? ?out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|fetch failed|network/i
    .test(raw);
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "Operation",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export type InteractiveMode = {
  interactive: boolean;
  skipEdit: boolean;
  noCommit: boolean;
};

export type ProviderSettings = {
  "api-key": string;
  model: string;
  "base-URL": string;
  "co-author-email": string;
};

export type CommitConfig = {
  "max-words": number;
  "commits-to-learn": number;
  unified: number;
  debug: boolean;
  provider: string;
  "co-author": string;
  "commit-language": string;
  "commit-style": string;
  hint: string;
  "show-commit-language": boolean;
  "show-commit-style": boolean;
  "show-provider": boolean;
  providers: Record<string, ProviderSettings>;
};

export const DEFAULT_CONFIG_KEY = "DEFAULT_CONFIG";

export function defaultConfig(): CommitConfig {
  const emptyProvider = (): ProviderSettings => ({
    "api-key": "",
    model: "",
    "base-URL": "",
    "co-author-email": "",
  });
  const providers: Record<string, ProviderSettings> = {};
  for (const name of VALID_PROVIDERS) {
    providers[name] = emptyProvider();
  }
  return {
    "max-words": 10000,
    "commits-to-learn": 10,
    unified: 10,
    debug: false,
    provider: "openai",
    "co-author": "",
    "commit-language": "",
    "commit-style": DEFAULT_COMMIT_STYLE,
    hint: "",
    "show-commit-language": false,
    "show-commit-style": false,
    "show-provider": true,
    providers,
  };
}

export function validateIntegerInput(
  raw: string,
  { min = 0, label = "value" }: { min?: number; label?: string } = {},
): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return `${label} cannot be empty`;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return `${label} must be a number`;
  }
  if (!Number.isInteger(value)) {
    return `${label} must be a whole number`;
  }
  if (value < min) {
    return `${label} must be at least ${min}`;
  }
  return null;
}

export function validateProviderName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Provider cannot be empty";
  }
  if (!VALID_PROVIDERS.includes(trimmed)) {
    return `Unknown provider. Valid options: ${VALID_PROVIDERS.join(", ")}`;
  }
  return null;
}

export function migrateLegacyConfig(raw: Record<string, unknown>): CommitConfig {
  const base = defaultConfig();
  const config: CommitConfig = {
    ...base,
    ...raw,
    providers: {
      ...base.providers,
      ...((raw.providers as Record<string, ProviderSettings>) || {}),
    },
  } as CommitConfig;

  // Legacy flat keys lived at the top level before providers existed.
  const legacyApiKey = raw["api-key"];
  const legacyModel = raw["model"];
  const legacyBaseURL = raw["base-URL"];
  if (typeof legacyApiKey === "string" && legacyApiKey) {
    config.providers.openai["api-key"] = legacyApiKey;
  }
  if (typeof legacyModel === "string" && legacyModel) {
    config.providers.openai.model = legacyModel;
  }
  if (typeof legacyBaseURL === "string" && legacyBaseURL) {
    config.providers.openai["base-URL"] = legacyBaseURL;
  }
  delete (config as Record<string, unknown>)["api-key"];
  delete (config as Record<string, unknown>)["model"];
  delete (config as Record<string, unknown>)["base-URL"];
  return config;
}

export function loadConfig(): CommitConfig {
  const stored = localStorage.getItem(DEFAULT_CONFIG_KEY);
  if (!stored) {
    return defaultConfig();
  }
  try {
    return migrateLegacyConfig(JSON.parse(stored));
  } catch (_error) {
    console.warn(
      colors.yellow(
        "⚠️  Saved config is corrupted; falling back to defaults.",
      ),
    );
    return defaultConfig();
  }
}

export function saveConfig(config: CommitConfig): void {
  localStorage.setItem(DEFAULT_CONFIG_KEY, JSON.stringify(config));
}

type ConfigEditorResult =
  | { action: "save"; config: CommitConfig }
  | { action: "reset" }
  | { action: "cancel" };

function providerSummary(config: CommitConfig, name: string): string {
  const settings = config.providers[name] || {};
  const provider = PROVIDERS[name];
  const model = settings.model || provider?.defaultModel || "(none)";
  const modelOrigin = settings.model ? "saved" : "default";
  const keyState = settings["api-key"]
    ? "key saved"
    : provider?.requiresApiKey
    ? "no key"
    : "no key needed";
  return `${name} · model ${model} (${modelOrigin}) · ${keyState}`;
}

async function editProviderSection(
  config: CommitConfig,
): Promise<CommitConfig> {
  const providerChoice = await select({
    question: "Select provider:",
    options: VALID_PROVIDERS.map((name) =>
      name === config.provider
        ? `${name}  (current)  ${providerSummary(config, name)}`
        : `${name}  ${providerSummary(config, name)}`
    ),
    initialIndex: Math.max(0, VALID_PROVIDERS.indexOf(config.provider)),
  });
  if (providerChoice < 0) {
    return config;
  }
  const selectedProvider = VALID_PROVIDERS[providerChoice];

  const provider = PROVIDERS[selectedProvider];
  const settings: ProviderSettings = {
    ...defaultConfig().providers[selectedProvider],
    ...(config.providers[selectedProvider] || {}),
  };

  const requiresApiKey = provider?.requiresApiKey ?? true;
  const requiresBaseUrl = provider?.requiresBaseUrl ?? false;

  if (requiresApiKey) {
    const keyState = settings["api-key"] ? "●●● saved" : "(empty)";
    const keyAction = await select({
      question: `API key for ${selectedProvider} (${keyState}):`,
      options: [
        `Keep current ${keyState}`,
        "Replace with a new value",
        "Clear saved key",
      ],
    });
    if (keyAction < 0) {
      return config;
    }
    if (keyAction === 1) {
      const newKey = await prompt({
        question: `Enter API key for ${selectedProvider}${
          provider?.envVar ? ` or leave empty to read from ${provider.envVar}` : ""
        }`,
        type: "password",
      });
      if (newKey) {
        settings["api-key"] = newKey;
      }
    } else if (keyAction === 2) {
      settings["api-key"] = "";
    }
  }

  const defaultModel = provider?.defaultModel || "";
  settings.model = await prompt({
    question:
      `Model for ${selectedProvider} (leave empty for provider default: ${defaultModel})`,
    defaultValue: settings.model,
  });

  if (requiresBaseUrl) {
    const baseURLFallback = provider?.baseURLEnvVar
      ? ` (env ${provider.baseURLEnvVar})`
      : "";
    settings["base-URL"] = await prompt({
      question:
        `Base URL for ${selectedProvider}${baseURLFallback} (leave empty for default)`,
      defaultValue: settings["base-URL"] || provider?.baseURL || "",
    });
  }

  return {
    ...config,
    provider: selectedProvider,
    providers: {
      ...config.providers,
      [selectedProvider]: settings,
    },
  };
}

async function editGenerationSection(
  config: CommitConfig,
): Promise<CommitConfig> {
  const next = { ...config };

  const maxWords = await prompt({
    question: "Max words to send to the API:",
    defaultValue: String(config["max-words"]),
    validate: (value) =>
      validateIntegerInput(value, { min: 1, label: "max-words" }),
  });
  next["max-words"] = Number(maxWords.trim());

  const commitsToLearn = await prompt({
    question: "Number of recent commits to learn style from:",
    defaultValue: String(config["commits-to-learn"]),
    validate: (value) =>
      validateIntegerInput(value, { min: 0, label: "commits-to-learn" }),
  });
  next["commits-to-learn"] = Number(commitsToLearn.trim());

  const unified = await prompt({
    question: "Lines of context in the diff (unified):",
    defaultValue: String(config.unified),
    validate: (value) =>
      validateIntegerInput(value, { min: 0, label: "unified" }),
  });
  next.unified = Number(unified.trim());

  next["commit-language"] = await prompt({
    question:
      "Commit language (e.g. English, Spanish; leave empty for English):",
    defaultValue: config["commit-language"] || "",
  });

  next["commit-style"] = await prompt({
    question:
      "Commit style (e.g. 'imperative mood, max 72 chars'; leave empty for default):",
    defaultValue: config["commit-style"] || DEFAULT_COMMIT_STYLE,
    type: "textarea",
  });

  next.hint = await prompt({
    question:
      "Default hint (extra context, e.g. 'make a concise subject, add a body with bullets'; leave empty for none):",
    defaultValue: config.hint || "",
    type: "textarea",
  });

  return next;
}

async function editCoAuthorSection(
  config: CommitConfig,
): Promise<CommitConfig> {
  const pattern = await prompt({
    question:
      "Co-author pattern ({model} and {email} placeholders; leave empty to disable):",
    defaultValue: config["co-author"] || "",
    type: "textarea",
  });

  const next: CommitConfig = { ...config, "co-author": pattern };
  if (!pattern.trim() || !pattern.includes("{email}")) {
    return next;
  }

  const provider = config.provider;
  const settings: ProviderSettings = {
    ...defaultConfig().providers[provider],
    ...(config.providers[provider] || {}),
  };
  settings["co-author-email"] = await prompt({
    question:
      `Co-author email for ${provider} (used by {email}; leave empty to disable):`,
    defaultValue: settings["co-author-email"] || `noreply@${provider}.com`,
  });
  return {
    ...next,
    providers: { ...config.providers, [provider]: settings },
  };
}

async function editDisplaySection(
  config: CommitConfig,
): Promise<CommitConfig> {
  const next = { ...config };

  next["show-provider"] = await confirm({
    question: "Show the 'Using provider' info line?",
    defaultValue: config["show-provider"],
  });
  next["show-commit-language"] = await confirm({
    question: "Show the 'Commit language' info line?",
    defaultValue: config["show-commit-language"],
  });
  next["show-commit-style"] = await confirm({
    question: "Show the 'Commit style' info line?",
    defaultValue: config["show-commit-style"],
  });

  return next;
}

export async function runConfigEditor(
  initial: CommitConfig,
): Promise<ConfigEditorResult> {
  let config = initial;

  while (true) {
    const menu = [
      `Provider        ${providerSummary(config, config.provider)}`,
      `Generation      max-words ${config["max-words"]} · learn ${
        config["commits-to-learn"]
      } · unified ${config.unified} · ${
        config["commit-language"] || "English"
      } · ${config["commit-style"] === DEFAULT_COMMIT_STYLE ? "default style" : "custom style"} · hint ${
        config.hint ? "set" : "none"
      }`,
      `Co-author       ${config["co-author"] || "disabled"}`,
      `Display         provider ${
        config["show-provider"] ? "on" : "off"
      } · language ${config["show-commit-language"] ? "on" : "off"} · style ${
        config["show-commit-style"] ? "on" : "off"
      }`,
      `Debug           ${config.debug ? "on" : "off"}`,
      "Save and exit",
      "Reset to defaults",
      "Cancel",
    ];
    const choice = await select({
      question: "Commit configuration:",
      options: menu,
      initialIndex: 5,
    });
    if (choice < 0) {
      return { action: "cancel" };
    }

    switch (choice) {
      case 0:
        config = await editProviderSection(config);
        break;
      case 1:
        config = await editGenerationSection(config);
        break;
      case 2:
        config = await editCoAuthorSection(config);
        break;
      case 3:
        config = await editDisplaySection(config);
        break;
      case 4:
        config = { ...config, debug: !config.debug };
        break;
      case 5:
        return { action: "save", config };
      case 6: {
        const confirmed = await confirm({
          question: "Reset all settings to defaults? This cannot be undone.",
          defaultValue: false,
        });
        if (confirmed) {
          return { action: "reset" };
        }
        break;
      }
      default:
        return { action: "cancel" };
    }
  }
}


function maskSecret(value: string): string {
  return value ? "●●●" : "(empty)";
}

function displayValue(value: string): string {
  return value || "(empty)";
}

export function diffConfig(
  before: CommitConfig,
  after: CommitConfig,
): string[] {
  const changes: string[] = [];
  const topKeys: (keyof CommitConfig)[] = [
    "provider",
    "max-words",
    "commits-to-learn",
    "unified",
    "debug",
    "co-author",
    "commit-language",
    "commit-style",
    "hint",
    "show-commit-language",
    "show-commit-style",
    "show-provider",
  ];
  for (const key of topKeys) {
    const beforeValue = before[key];
    const afterValue = after[key];
    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      changes.push(
        `${key}: ${displayValue(String(beforeValue))} → ${
          displayValue(String(afterValue))
        }`,
      );
    }
  }
  const providerNames = new Set([
    ...Object.keys(before.providers),
    ...Object.keys(after.providers),
  ]);
  for (const name of providerNames) {
    const beforeProvider = before.providers[name];
    const afterProvider = after.providers[name];
    const fields: (keyof ProviderSettings)[] = [
      "api-key",
      "model",
      "base-URL",
      "co-author-email",
    ];
    for (const field of fields) {
      const beforeValue = beforeProvider?.[field] ?? "";
      const afterValue = afterProvider?.[field] ?? "";
      if (beforeValue === afterValue) {
        continue;
      }
      const beforeShown = field === "api-key"
        ? maskSecret(beforeValue)
        : displayValue(beforeValue);
      const afterShown = field === "api-key"
        ? maskSecret(afterValue)
        : displayValue(afterValue);
      changes.push(`${name}.${field}: ${beforeShown} → ${afterShown}`);
    }
  }
  return changes;
}

export function resolveInteractiveMode(
  isTTY: boolean,
  args: Record<string, unknown>,
): InteractiveMode {
  const interactive = isTTY;
  return {
    interactive,
    skipEdit: !interactive || Boolean(args["skip-edit"]),
    noCommit: Boolean(args["no-commit"]),
  };
}

async function commit(): Promise<void> {
  const passthroughIndex = Deno.args.indexOf("--");
  const argsToParse = passthroughIndex === -1
    ? Deno.args
    : Deno.args.slice(0, passthroughIndex);
  const passthroughArgs = passthroughIndex === -1
    ? []
    : Deno.args.slice(passthroughIndex + 1);

  const args = parseArgs(argsToParse, buildParseArgsOptions(CLI_FLAGS));
  const extraCommitArgs = [
    ...collectExtraCommitArgs(argsToParse),
    ...(passthroughIndex === -1 ? [] : ["--", ...passthroughArgs]),
  ];
  const configSaved = loadConfig();

  const MAX_WORD = Number(args["max-words"]) || configSaved["max-words"];
  const unified = Number(args.unified) || configSaved.unified || 10;
  const debug = args.debug || configSaved.debug;

  const isTTY = Deno.stdin.isTerminal();
  const noCommitFlag = args["no-commit"] || (args as Record<string, unknown>)["dry-run"] === true;
  const mode = resolveInteractiveMode(isTTY, {
    "skip-edit": args["skip-edit"],
    "no-commit": noCommitFlag,
  });
  if (noCommitFlag) {
    console.info(
      colors.gray("ℹ️  Dry run: commit message will be printed, not committed."),
    );
  }
  if (!mode.interactive) {
    console.warn(
      colors.yellow(
        "⚠️  Non-interactive terminal detected: skipping message review (--skip-edit).",
      ),
    );
  }

  // Provider resolution
  let providerName: string = args.provider || configSaved.provider || "openai";
  if (!VALID_PROVIDERS.includes(providerName)) {
    providerName = "openai";
  }
  const provider = PROVIDERS[providerName];

  const providerConfig = configSaved.providers[providerName] || {};

  const model = args.model || providerConfig.model || provider.defaultModel;

  const baseURL: string | undefined = args["base-URL"] ||
    (provider.baseURLEnvVar
      ? Deno.env.get(provider.baseURLEnvVar)
      : undefined) ||
    providerConfig["base-URL"] ||
    provider.baseURL ||
    undefined;

  if (args.help) {
    console.info(`Usage: commit [options]

Note: Options can be combined, e.g., -AP for add and push.
Extra options not recognized by this CLI are passed to git commit.
Use -- to pass options that may conflict with this CLI.

-A, --add: Runs git add . before creating the commit message.
-P, --push: Runs git push after the commit creation.
-E, --amend: Runs git commit --amend instead of git commit.
-L, --commits-to-learn: default is 10. Number of commits to learn from.
-S, -Y, -y, --skip-edit: Skips the interactive preview and the editing of the commit message before creating the commit.
-N, --no-commit, --dry-run: Skips the creation of the commit. Just prints the commit message.
-M, --model <model>: Specifies the model to use. Defaults to the provider's default model.
-U, --unified <lines>: Specifies the number of lines of context to show in the diff. The default is 10.
-C, --config: Prompts for the default options and saves them.
-p, --provider <provider>: Specifies the AI provider. Options: openai (default), google, ollama, ollama-cloud, anthropic.
-K, --api-key <apiKey>: Specifies the API key. Overrides the provider's env var (OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY, OLLAMA_API_KEY).
-B, --base-URL <baseURL>: Specifies a custom base URL for the provider API. For ollama, can also be set via OLLAMA_BASE_URL env var.
-W, --max-words <maxWords>: Specifies the maximum number of words to call the api. The default is 10000.
--co-author <pattern>: Appends a signature to the commit message. Placeholders: {model} (resolved model id), {email} (co-author email for the provider, prompted and saved on first use). Example: "Co-Authored-By: {model} <{email}>". Leave empty in --config to disable.
--co-author-email <email>: Overrides the co-author email for this run (resolves the {email} placeholder). Overrides the saved provider config.
--commit-language <lang>: Language for the commit message (e.g. "Spanish"). Overrides the saved config.
--commit-style <style>: Extra style instructions for the commit message (e.g. "imperative mood"). Defaults to conventional commits rules; overrides the saved config.
--hint <text>: Additional context to guide the commit message generation (e.g. "fixes #123"). Overrides the saved config (set it with --config).
--body: Also generate a body with bullet points after the subject line.
-D, --debug: Enables debug mode, which will print additional information to the console.
-H, --help: Prints the help message.
-V, --version: Prints the version number.

       `);
    return;
  }

  if (args.version) {
    let version: string | undefined;
    if (import.meta.url.startsWith("http")) {
      const response = await fetch(new URL("./deno.json", import.meta.url));
      const json = await response.json();
      version = json.version;
    } else {
      version = JSON.parse(
        await Deno.readTextFile(new URL("./deno.json", import.meta.url)),
      ).version;
    }
    debug && console.debug("import.meta.url", import.meta.url);
    console.info(version);
    return;
  }
  const apiKey = args["api-key"] ||
    providerConfig["api-key"] ||
    (provider.envVar ? Deno.env.get(provider.envVar) : undefined);

  const readApiKeyFrom = args["api-key"]
    ? "--api-key CLI argument"
    : providerConfig["api-key"]
    ? "saved config"
    : provider.envVar
    ? `env var ${provider.envVar}`
    : "(no API)";

  if (args.config) {
    if (!mode.interactive) {
      console.error(
        "✗ --config requires an interactive terminal. Run it directly in a TTY.",
      );
      Deno.exit(1);
    }

    const result = await runConfigEditor(configSaved);
    if (result.action === "cancel") {
      console.info("Config unchanged.");
      return;
    }
    if (result.action === "reset") {
      saveConfig(defaultConfig());
      console.info("All settings have been reset to default.");
      return;
    }

    const changes = diffConfig(configSaved, result.config);
    if (changes.length === 0) {
      console.info("No changes to save.");
      return;
    }

    console.info(colors.gray("Pending changes:"));
    for (const change of changes) {
      console.info(colors.gray(`  • ${change}`));
    }
    const confirmed = await confirm({
      question: "Save these changes?",
      defaultValue: true,
    });
    if (!confirmed) {
      console.info("Config unchanged.");
      return;
    }

    saveConfig(result.config);
    console.info("Config saved.");
    args.debug && console.debug({ config: result.config });
    return;
  }

  let finalApiKey = apiKey;
  if (!finalApiKey && provider.requiresApiKey) {
    if (!mode.interactive) {
      console.error(
        `No API key for ${providerName}. Set ${provider.envVar} or pass --api-key when running non-interactively.`,
      );
      Deno.exit(1);
    }
    finalApiKey = await prompt({
      question:
        `No API key found. Enter ${providerName} API key (won't be saved, use --config to save it)`,
      type: "password",
    });
  }

  let finalBaseURL = baseURL;
  if (!finalBaseURL && provider.requiresBaseUrl) {
    if (!mode.interactive) {
      console.error(
        `No base URL for ${providerName}. Set ${provider.baseURLEnvVar} or pass --base-URL when running non-interactively.`,
      );
      Deno.exit(1);
    }
    finalBaseURL = await prompt({
      question:
        `No base URL found. Enter ${providerName} base URL (won't be saved, use --config to save it)`,
    });
  }

  const coAuthorPattern = args["co-author"] || configSaved["co-author"] || "";
  let coAuthorEmail = args["co-author-email"] ||
    providerConfig["co-author-email"] || "";
  if (
    coAuthorPattern.trim() && coAuthorPattern.includes("{email}") &&
    !coAuthorEmail
  ) {
    if (!mode.interactive) {
      console.warn(
        colors.yellow(
          "⚠️  Co-author email not set: signature skipped. Set --co-author-email or --config.",
        ),
      );
    } else {
      coAuthorEmail = await prompt({
        question:
          `Enter co-author email for ${providerName} (leave empty to skip signature)`,
        defaultValue: `noreply@${providerName}.com`,
      });
      if (coAuthorEmail) {
        configSaved.providers[providerName] = {
          ...providerConfig,
          "co-author-email": coAuthorEmail,
        };
        saveConfig(configSaved);
        console.info("Co-author email saved.");
      }
    }
  }

  if (args.add) {
    await $`git add .`;
  }

  const skipPreCommit = args["no-commit"] || hasNoVerifyFlag(extraCommitArgs);
  if (!skipPreCommit) {
    const hookPath = await getPreCommitHookPath();
    if (hookPath) {
      await runCommand("git", ["hook", "run", "pre-commit"]);
    }
  }
  if (configSaved["show-provider"]) {
    console.info(
      colors.gray(
        `ℹ️  Using provider: ${colors.blue(providerName)}, model: ${
          colors.blue(model)
        }, API key source: ${colors.blue(readApiKeyFrom)}`,
      ),
    );
  }
  debug &&
    console.debug({ args, providerName, model, baseURL, extraCommitArgs });
  debug && console.time("git diff");
  let diff =
    await daxSilent`git diff --unified=${unified} --staged -- . ':(exclude)*.lock'`;
  // Added: append last commit diff if --amend flag is provided
  if (args.amend) {
    const lastCommitDiff =
      await daxSilent`git show --unified=${unified} --pretty=format: HEAD`;
    diff += "\n" + lastCommitDiff;
  }
  debug && console.timeEnd("git diff");
  debug && console.debug({ diff });

  if (!diff) {
    console.error(
      "No staged changes to commit. \nUse --add flag to add all changes to commit, or use git add for specific files.",
    );
    return Deno.exit(1);
  }

  const words = diff.split(" ").length;
  const tokens = estimateTokens(diff);
  debug && console.debug({ words, tokens });

  const commitsToLearn = Number(args["commits-to-learn"]) || 10;
  if (isNaN(commitsToLearn)) {
    console.error(`Invalid commitsToLearn: ${commitsToLearn}`);
    Deno.exit(1);
  }
  let commits = "";
  if (commitsToLearn > 0) {
    debug && console.time("git log");
    try {
      commits = await $.raw`git log --oneline -n ${commitsToLearn}`.text();
    } catch (_error) {
      // Fresh repo with no commits yet, or unreadable history: proceed without learning examples.
      commits = "";
    }
    debug && console.timeEnd("git log");
    debug && console.debug({ commits });
  }

  let branchName = "";
  try {
    branchName = await $`git rev-parse --abbrev-ref HEAD`.text();
  } catch (_error) {
    branchName = "";
  }
  const ticket = extractTicketFromBranch(branchName.trim());
  if (ticket) {
    console.info(
      colors.gray(
        `ℹ️  Detected ticket ${colors.blue(ticket)} from branch ${colors.blue(branchName.trim())}`,
      ),
    );
  }
  const commitLanguage = args["commit-language"] ||
    configSaved["commit-language"] || "";
  const commitStyle = args["commit-style"] ||
    configSaved["commit-style"] ||
    DEFAULT_COMMIT_STYLE;
  if (commitLanguage && configSaved["show-commit-language"]) {
    console.info(
      colors.gray(`ℹ️  Commit language: ${colors.blue(commitLanguage)}`),
    );
  }
  if (
    commitStyle !== DEFAULT_COMMIT_STYLE && configSaved["show-commit-style"]
  ) {
    console.info(colors.gray(`ℹ️  Commit style: ${colors.blue(commitStyle)}`));
  }
  const systemContent = buildSystemPrompt({
    commits,
    ticket,
    language: commitLanguage,
    style: commitStyle,
    hint: args.hint || configSaved["hint"] || "",
    body: args.body,
  });

  let commitMessage = "";
  const stagedDiffStat =
    await daxSilent`git diff --color=always --stat --staged -- . ':(exclude)*.lock'`;
  let hasShownStagedDiffStat = false;

  while (true) {
    try {
      commitMessage = await generateCommitMessage({
        provider,
        model,
        apiKey: finalApiKey || "",
        baseURL: finalBaseURL,
        diff,
        systemContent,
        debug,
      });
    } catch (error) {
      console.error(
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }

    if (!commitMessage) {
      console.error("No commitMessage");
      Deno.exit(1);
    }

    commitMessage = appendCoAuthor(commitMessage, coAuthorPattern, {
      model,
      email: coAuthorEmail,
    });

    if (mode.noCommit) {
      console.info(commitMessage);
      return;
    }

    if (mode.skipEdit) {
      if (stagedDiffStat && !hasShownStagedDiffStat) {
        console.info(stagedDiffStat);
        hasShownStagedDiffStat = true;
      }
      break;
    }

    if (stagedDiffStat && !hasShownStagedDiffStat) {
      console.info(stagedDiffStat);
      hasShownStagedDiffStat = true;
    }

    const confirmation = await confirmCommit({
      question: "Review commit message:",
      defaultValue: commitMessage,
    });

    if (confirmation.action === "commit") {
      commitMessage = confirmation.value.trim();
      if (!commitMessage) {
        console.error("No commitMessage");
        Deno.exit(1);
      }
      break;
    } else if (confirmation.action === "regenerate") {
      continue;
    } else {
      console.info("Commit aborted.");
      return;
    }
  }

  const commitArgs = [
    "commit",
    "--no-verify", // Skip pre-commit hooks since we've already run them (if they exist) and to prevent potential infinite loops with hooks that modify the commit message or staged files.
    ...extraCommitArgs,
  ];
  if (args.amend) {
    commitArgs.push("--amend");
  }

  commitArgs.push("-m", commitMessage);
  const code = await runCommandCapture("git", commitArgs);
  if (code !== 0) {
    const messagePath = await daxSilent`git rev-parse --git-path COMMIT_MSG_AI`;
    const trimmedPath = messagePath.trim();
    try {
      await Deno.writeTextFile(trimmedPath, `${commitMessage}\n`);
      console.error(
        `✗ Commit failed (exit ${code}). Your approved message is saved at:\n  ${trimmedPath}\n  Retry with: ${buildRetryHint(trimmedPath)}`,
      );
    } catch (_writeError) {
      console.error(`✗ Commit failed (exit ${code}).`);
    }
    Deno.exit(code);
  }

  if (args.push) {
    await $`git push`;
  }
}

async function generateCommitMessage(opts: {
  provider: { sdk: "openai" | "anthropic" | "ollama" | "google" };
  model: string;
  apiKey: string;
  baseURL: string | undefined;
  diff: string;
  systemContent: string;
  debug: boolean;
}): Promise<string> {
  const { provider, model, apiKey, baseURL, diff, systemContent, debug } = opts;
  startSpinner("Generating commit message...");
  debug && console.time("askLLM");
  try {
    let commitMessage = await withTimeout(
      askLLM({
        model,
        apiKey,
        baseURL,
        content: diff,
        systemContent,
        sdk: provider.sdk,
      }),
      LLM_TIMEOUT_MS,
      "LLM request",
    );
    debug && console.timeEnd("askLLM");
    commitMessage = commitMessage
      ?.trim()
      .replace(/(^['"`]|$['"`])/, "")
      .replace(/`/g, "'");
    debug && console.debug({ commitMessage });
    return commitMessage;
  } catch (error) {
    stopSpinner();
    debug && console.debug({ llmError: error });
    if (isTransientLLMError(error)) {
      console.warn(
        colors.yellow(
          `⚠️  Attempt 1 failed (${
            error instanceof Error ? error.message : String(error)
          }). Retrying...`,
        ),
      );
      startSpinner("Retrying commit message generation...");
      try {
        const retryMessage = await withTimeout(
          askLLM({
            model,
            apiKey,
            baseURL,
            content: diff,
            systemContent,
            sdk: provider.sdk,
          }),
          LLM_TIMEOUT_MS,
          "LLM request (retry)",
        );
        debug && console.timeEnd("askLLM");
        return retryMessage
          ?.trim()
          .replace(/(^['"`]|$['"`])/, "")
          .replace(/`/g, "'");
      } catch (retryError) {
        stopSpinner();
        debug && console.debug({ retryError });
        debug && console.timeEnd("askLLM");
        throw new Error(
          friendlyLLMError(provider.sdk, model, baseURL, retryError),
          { cause: retryError },
        );
      }
    }
    debug && console.debug({ llmError: error });
    debug && console.timeEnd("askLLM");
    throw new Error(friendlyLLMError(provider.sdk, model, baseURL, error), {
      cause: error,
    });
  } finally {
    stopSpinner();
  }
}

function friendlyLLMError(
  sdk: string,
  model: string,
  baseURL: string | undefined,
  error: unknown,
): string {
  const raw = error instanceof Error ? error.message : String(error);
  const target = `${sdk} (${model})${baseURL ? ` at ${baseURL}` : ""}`;
  if (/401|403|unauthorized|invalid.{0,20}(api.?|token|key)/i.test(raw)) {
    return `The API key for ${target} was rejected. Check OPENAI_API_KEY / GEMINI_API_KEY / ANTHROPIC_API_KEY / OLLAMA_API_KEY or --api-key.`;
  }
  if (/429|rate.?limit/i.test(raw)) {
    return `Rate limited by ${target}. Wait a moment and try again.`;
  }
  if (/404|not.?found|no such model|model.*not.*exist/i.test(raw)) {
    return `Model not found on ${target}. Check the --model value.`;
  }
  if (
    /ECONNREFUSED|ECONNRESET|fetch failed|fetch timed|connect(ion)?|refused|ENOTFOUND|ETIMEDOUT/i
      .test(raw)
  ) {
    return `Could not reach ${target}. ${
      sdk === "ollama"
        ? "Is your Ollama server running (ollama serve) and is OLLAMA_BASE_URL correct?"
        : "Check your network or --base-URL."
    }`;
  }
  return `LLM request failed for ${target}: ${raw}`;
}

if (import.meta.main) {
  await commit();
}
