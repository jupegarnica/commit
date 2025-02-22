import $ from "jsr:@david/dax@0.42.0";
import { parseArgs } from "jsr:@std/cli@1.0.6";
import { join } from "jsr:@std/path@1.0.6";
import { gpt } from "./gpt.ts";

async function dax(strings: TemplateStringsArray, ...values: unknown[]) {
  try {
    return await $.raw(strings, ...values.map(String));
  } catch (_error) {
    // console.error(error.message);
    Deno.exit(1);
  }
}

async function daxSilent(strings: TemplateStringsArray, ...values: unknown[]) {
  try {
    return await $.raw(strings, ...values.map(String)).text();
  } catch (error) {
    console.error(error);
    Deno.exit(1);
  }
}

export async function commit(): Promise<void> {
  const args = parseArgs(Deno.args, {
    boolean: [
      "add",
      "push",
      "ollama",
      "debug",
      "config",
      "skip-edit",
      "no-commit",
      "help",
    ],
    string: ["api-key", "model", "base-URL", "max-words", "commits-to-learn"],
  });
  const DEFAULTS = `{
  "api-key": "",
  "model": "gpt-4o",
  "max-words": 6000,
  "base-URL": "",
  "commits-to-learn": 10,
  "debug": false
  }`;
  const DEFAULT_CONFIG_KEY = "DEFAULT_CONFIG";
  const configSaved = JSON.parse(
    localStorage.getItem(DEFAULT_CONFIG_KEY) || DEFAULTS
  );
  const MAX_WORD = Number(args["max-words"]) || configSaved.maxWords;
  const debug = args.debug || configSaved.debug;
  let model = args.model || configSaved.model; // || 'gpt-4o-mini';
  let baseURL: string | undefined = args["base-URL"] || configSaved.baseURL;

  if (args.help) {
    console.info(`Usage: commit [options]

--add: Runs git add . before creating the commit message.
--push: Runs git push after the commit creation.
--amend: Runs git commit --amend instead of git commit.
--commits-to-learn: default is 10. Number of commits to learn from.
--skip-edit: Skips the editing of the commit message before creating the commit.
--no-commit: Skips the creation of the commit.Just prints the commit message.
--model <model>: Specifies the model to use for generating the commit message.The default is gpt-4o.
--config: Prompts for the default options and saves them.
--api-key <apiKey>: Specifies the OpenAI API key to use. This will override the value set in the OPENAI_API_KEY environment variable.
--max-words <maxWords>: Specifies the maximum number of words to call the api.The default is 6000. Is useful to no incur in extra charges.
--base-URL <baseURL>: Specifies the base URL to use for the OpenAI API.This will override the default base URL.
--ollama: Uses the llama3 model and sets the base URL to 'http://localhost:11434/v1'.
--debug: Enables debug mode, which will print additional information to the console.
--help: Prints the help message.
--version: Prints the version number.

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
        await Deno.readTextFile(new URL("./deno.json", import.meta.url))
      ).version;
    }
    debug && console.debug("import.meta.url", import.meta.url);
    console.info(version);
    return;
  }
  const apiKey =
    args["api-key"] || configSaved["api-key"] || Deno.env.get("OPENAI_API_KEY");
  configSaved["api-key"] = apiKey;

  if (args.config) {
    const defaultConfig = JSON.parse(DEFAULTS);
    const configChanged = Object.keys(configSaved).some(
      (key) => configSaved[key] !== defaultConfig[key]
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

    const newConfig = {
      "api-key": await prompt(
        "Enter openai api key\nhttps://platform.openai.com/api-keys\n",
        { default: configSaved["api-key"], mask: true }
      ),
      model: await prompt("Enter model", { default: configSaved["model"] }),
      "max-words": Number(
        await prompt("Enter max-words", { default: configSaved["max-words"] })
      ),
      "base-URL": await prompt("Enter base-URL", {
        default: configSaved["base-URL"],
      }),
      "commits-to-learn": Number(
        await prompt("Enter commits-to-learn", {
          default: configSaved["commits-to-learn"],
        })
      ),
      debug:
        (await prompt("Enter debug", { default: configSaved["debug"] })) ===
        "true",
    };

    localStorage.setItem(DEFAULT_CONFIG_KEY, JSON.stringify(newConfig));
    console.info("Config saved.");
    args.debug && console.debug({ newConfig });
    return;
  }

  if (!apiKey) {
    configSaved["api-key"] = await $.prompt(
      "Not api-key found. Enter OpenAI API Key",
      {
        mask: true,
      }
    );
    localStorage.setItem(DEFAULT_CONFIG_KEY, JSON.stringify(configSaved));
    console.info("API Key saved, use --config to change it.");
  }

  if (args.add) {
    await $`git add .`;
  }

  if (args.ollama) {
    model = args.model || "llama3";
    baseURL = args["base-URL"] || "http://localhost:11434/v1";
  }
  debug && console.debug({ args, model, baseURL });
  let diff =
    await daxSilent`git diff --unified=5 --staged -- . ':(exclude)*.lock'`;
  // Added: append last commit diff if --amend flag is provided
  if (args.amend) {
    const lastCommitDiff = await daxSilent`git show --unified=5 --pretty=format: HEAD`;
    diff += "\n" + lastCommitDiff;
  }
  debug && console.debug({ diff });

  if (!diff) {
    console.error(
      "No staged changes to commit. \nUse --add flag to add all changes to commit, or use git add for specific files."
    );
    return Deno.exit(1);
  }

  const words = diff.split(" ").length;
  debug && console.debug({ words });
  if (words > MAX_WORD) {
    console.error(`Input is too long: ${words} words`);
    Deno.exit(1);
  }

  const commitsToLearn = Number(args["commits-to-learn"]) || 10;
  if (isNaN(commitsToLearn)) {
    console.error(`Invalid commitsToLearn: ${commitsToLearn}`);
    Deno.exit(1);
  }
  let commits = "";
  if (commitsToLearn > 0) {
    commits = await daxSilent`git log --oneline -n ${commitsToLearn}`;
    debug && console.debug({ commits });
  }

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
  if (commits) {
    systemContent += `\nYou should follow the commit style of these commits:\n${commits}`;
  }

  let commitMessage: string = await gpt({
    model,
    apiKey,
    baseURL,
    content: diff,
    systemContent,
  });
  commitMessage = commitMessage
    ?.trim()
    .replace(/(^['"`]|$['"`])/, "")
    .replace(/`/g, "'");
  debug && console.debug({ commitMessage });
  if (!commitMessage) {
    console.error("No commitMessage");
    Deno.exit(1);
  }

  if (args["no-commit"]) {
    console.info(commitMessage);
    return;
  }
  const edit = args["skip-edit"] ? "" : " --edit";
  const amend = args.amend ? " --amend" : "";
  await dax`git commit ${amend} ${edit} -m "${commitMessage}"`;

  if (args.push) {
    await $`git push`;
  }
}

if (import.meta.main) {
  await commit();
}

async function prompt(
  message: string,
  options: { default?: string; mask?: boolean; noClear?: boolean } = {}
): Promise<string> {
  options.noClear = true;
  options.default = String(options.default);
  const result = await $.prompt(`${message}`, options);
  return String(result).trim();
}
