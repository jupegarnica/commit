import $ from "@david/dax";
import * as colors from "@std/fmt/colors";
import { parseArgs } from "@std/cli";
import { askLLM } from "./gpt.ts";
import { PROVIDERS, VALID_PROVIDERS } from "./providers.ts";
import { confirmCommit } from "./ui/prompt.tsx";
import {
  formatCommitMessageIssues,
  validateCommitMessage,
} from "./validate.ts";
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
    You should use conventional commit notation to create a commit message for this git diff.
    And follow this conventional commits rules:
    - 'feat:' for new features where the code behavior changes
    - 'fix:' for bug fixes where the code behavior changes
    - 'refactor:' for code refactoring where the code behavior does not change,
    - 'docs:' for documentation changes,
    - 'style:' for changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc),
    - 'test:' for adding tests,
    - 'chore:' for changes to the build process or auxiliary tools and libraries such as documentation generation.
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
  const DEFAULTS = `{
  "max-words": 10000,
  "commits-to-learn": 10,
  "unified": 10,
  "debug": false,
  "provider": "openai",
  "co-author": "",
  "commit-language": "",
  "commit-style": "",
  "providers": {
    "openai": { "api-key": "", "model": "", "base-URL": "", "co-author-email": "" },
    "google": { "api-key": "", "model": "", "base-URL": "", "co-author-email": "" },
    "anthropic": { "api-key": "", "model": "", "base-URL": "", "co-author-email": "" },
    "ollama": { "api-key": "", "model": "", "base-URL": "", "co-author-email": "" },
    "ollama-cloud": { "api-key": "", "model": "", "base-URL": "", "co-author-email": "" }
  }
  }`;
  const DEFAULT_CONFIG_KEY = "DEFAULT_CONFIG";
  const configSaved = JSON.parse(
    localStorage.getItem(DEFAULT_CONFIG_KEY) || DEFAULTS,
  );

  // Migration for legacy config
  if (!configSaved.providers) {
    configSaved.providers = JSON.parse(DEFAULTS).providers;
    if (configSaved["api-key"]) {
      configSaved.providers.openai["api-key"] = configSaved["api-key"];
      delete configSaved["api-key"];
    }
    if (configSaved["model"]) {
      configSaved.providers.openai["model"] = configSaved["model"];
      delete configSaved["model"];
    }
    if (configSaved["base-URL"]) {
      configSaved.providers.openai["base-URL"] = configSaved["base-URL"];
      delete configSaved["base-URL"];
    }
    localStorage.setItem(DEFAULT_CONFIG_KEY, JSON.stringify(configSaved));
  }

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
--commit-style <style>: Extra style instructions for the commit message (e.g. "imperative mood"). Overrides the saved config.
--hint <text>: Additional context to guide the commit message generation (e.g. "fixes #123").
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
    const defaultConfig = JSON.parse(DEFAULTS);
    const configChanged = Object.keys(configSaved).some(
      (key) => configSaved[key] !== defaultConfig[key],
    );

    if (configChanged) {
      const reset = await $.select({
        message: "Would you like to change config or reset to default?",
        options: ["change", "default"],
      });

      if (reset === 1) {
        localStorage.setItem(DEFAULT_CONFIG_KEY, DEFAULTS);
        console.info("All settings have been reset to default.");
        return;
      }
    }

    const selectedProvider = await prompt(
      `Enter provider (${VALID_PROVIDERS.join(", ")})`,
      {
        default: configSaved["provider"] || "openai",
      },
    );

    const providerConfigToEdit = configSaved.providers[selectedProvider] || {
      "api-key": "",
      model: "",
      "base-URL": "",
      "co-author-email": "",
    };

    const providerDefaultModel = PROVIDERS[selectedProvider]?.defaultModel ||
      "";
    const providerEnvVar = PROVIDERS[selectedProvider]?.envVar || "";

    const selectedProviderConfig = PROVIDERS[selectedProvider];
    const requiresApiKey = selectedProviderConfig?.requiresApiKey ?? true;
    const requiresBaseUrl = selectedProviderConfig?.requiresBaseUrl ?? false;
    const providerBaseURLEnvVar = selectedProviderConfig?.baseURLEnvVar || "";
    const providerDefaultBaseURL = selectedProviderConfig?.baseURL || "";

    const coAuthorPattern = await prompt(
      "Enter co-author pattern (use {model} and {email} placeholders, leave empty to disable)",
      {
        default: configSaved["co-author"] || "",
      },
    );
    const coAuthorEmail = await prompt(
      `Enter co-author email for ${selectedProvider} (used by the {email} placeholder, leave empty to disable)`,
      {
        default: providerConfigToEdit["co-author-email"] || "",
      },
    );

    const newProviderConfig = {
      "api-key": requiresApiKey
        ? await prompt(
          `Enter API key for ${selectedProvider}${
            providerEnvVar
              ? ` or leave empty to read from ${providerEnvVar}`
              : ""
          }`,
          {
            default: providerConfigToEdit["api-key"],
            mask: true,
          },
        )
        : providerConfigToEdit["api-key"],
      model: await prompt(
        `Enter model for ${selectedProvider} (leave empty to use provider default, currently: ${providerDefaultModel})`,
        {
          default: providerConfigToEdit["model"],
        },
      ),
      "base-URL": requiresBaseUrl
        ? await prompt(
          `Enter base URL for ${selectedProvider}${
            providerBaseURLEnvVar
              ? ` or leave empty to read from ${providerBaseURLEnvVar}`
              : ""
          }`,
          {
            default: providerConfigToEdit["base-URL"] || providerDefaultBaseURL,
          },
        )
        : providerConfigToEdit["base-URL"],
      "co-author-email": coAuthorEmail,
    };

    const newConfig = {
      provider: selectedProvider,
      "max-words": Number(
        await prompt("Enter max-words", { default: configSaved["max-words"] }),
      ),
      "commits-to-learn": Number(
        await prompt("Enter commits-to-learn", {
          default: configSaved["commits-to-learn"],
        }),
      ),
      unified: Number(
        await prompt("Enter unified (lines of context in diff)", {
          default: configSaved["unified"],
        }),
      ),
      debug:
        (await $.select({
          message: "Debug mode? (prints extra information)",
          options: ["no", "yes"],
          initialIndex: configSaved["debug"] ? 1 : 0,
        })) === 1,
      "co-author": coAuthorPattern,
      "commit-language": await prompt(
        "Enter commit language (e.g. English, Spanish; leave empty for English)",
        { default: configSaved["commit-language"] || "" },
      ),
      "commit-style": await prompt(
        "Enter commit style (e.g. 'imperative mood, max 72 chars'; leave empty for default)",
        { default: configSaved["commit-style"] || "" },
      ),
      providers: {
        ...configSaved.providers,
        [selectedProvider]: newProviderConfig,
      },
    };

    localStorage.setItem(DEFAULT_CONFIG_KEY, JSON.stringify(newConfig));
    console.info("Config saved.");
    args.debug && console.debug({ newConfig });
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
    finalApiKey = await $.prompt(
      `No API key found. Enter ${providerName} API key (won't be saved, use --config to save it)`,
      {
        mask: true,
      },
    );
  }

  let finalBaseURL = baseURL;
  if (!finalBaseURL && provider.requiresBaseUrl) {
    if (!mode.interactive) {
      console.error(
        `No base URL for ${providerName}. Set ${provider.baseURLEnvVar} or pass --base-URL when running non-interactively.`,
      );
      Deno.exit(1);
    }
    finalBaseURL = await $.prompt(
      `No base URL found. Enter ${providerName} base URL (won't be saved, use --config to save it)`,
    );
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
      coAuthorEmail = await prompt(
        `Enter co-author email for ${providerName} (leave empty to skip signature)`,
        { default: `noreply@${providerName}.com` },
      );
      if (coAuthorEmail) {
        configSaved.providers[providerName] = {
          ...providerConfig,
          "co-author-email": coAuthorEmail,
        };
        localStorage.setItem(DEFAULT_CONFIG_KEY, JSON.stringify(configSaved));
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
  console.info(
    colors.gray(
      `ℹ️  Using provider: ${colors.blue(providerName)}, model: ${
        colors.blue(model)
      }, API key source: ${colors.blue(readApiKeyFrom)}`,
    ),
  );
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
    configSaved["commit-style"] || "";
  if (commitLanguage) {
    console.info(
      colors.gray(`ℹ️  Commit language: ${colors.blue(commitLanguage)}`),
    );
  }
  if (commitStyle) {
    console.info(colors.gray(`ℹ️  Commit style: ${colors.blue(commitStyle)}`));
  }
  const systemContent = buildSystemPrompt({
    commits,
    ticket,
    language: commitLanguage,
    style: commitStyle,
    hint: args.hint,
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

async function prompt(
  message: string,
  options: { default?: string; mask?: boolean; noClear?: boolean } = {},
): Promise<string> {
  options.noClear = true;
  options.default = String(options.default);
  const result = await $.prompt(`${message}`, options);
  return String(result).trim();
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
