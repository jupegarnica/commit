# Commit

## Requirements

This script requires Deno to run. If you don't have Deno installed, you can
install it by following the instructions on the
[official Deno website](https://deno.land/).

It needs git to be installed and configured in your system. You can install git
by following the instructions on the
[official git website](https://git-scm.com/).

You will also need an OpenAI API key to use this script. You can sign up for an
account and get an API key on the
[OpenAI website](https://platform.openai.com/).

# Install

```sh
deno install -Agrfn commit  jsr:@garn/commit
```

## Usage

```sh
commit [OPTIONS]
```

- `--add`: Runs `git add .` before creating the commit message.
- `--push`: Runs `git push` after creating the commit.
- `--amend`: Runs `git commit --amend` instead of `git commit`.
- `--commits-to-learn <number>`: Specifies the number of commits to learn from.
  The default is 10.
- `--skip-edit`: Skips the editing of the commit message before creating the
  commit.
- `--no-commit`: Skips the creation of the commit. Just prints the commit
  message.
- `--model <model>`: Specifies the model to use for generating the commit
  message. The default is `gpt-4o`.
- `--config`: Prompts for the default options and saves them.
- `--api-key <apiKey>`: Specifies the OpenAI API key to use. This will override
  the value set in the `OPENAI_API_KEY` environment variable.
- `--max-words <maxWords>`: Specifies the maximum number of words to call the
  api. The default is 6000. Is useful to no incur in extra charges.
- `--base-URL <baseURL>`: Specifies the base URL to use for the OpenAI API. This
  will override the default base URL.
- `--ollama`: Uses the `llama3` model and sets the base URL to
  'http://localhost:11434/v1'.
- `--debug`: Enables debug mode, which will print additional information to the
  console.
- `--help`: Prints the help message.
- `--version`: Prints the version number.

### Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key. This is required to interact with the
  OpenAI API.

## Example

Here's an example of how you can use `commit`:

```sh
OPENAI_API_KEY=your_api_key_here commit --add --push
```

This will add all changes, create a commit with a message generated by the
OpenAI API, and push the changes to the current branch.
