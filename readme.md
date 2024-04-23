# Commit

## Requirements

This script requires Deno to run. If you don't have Deno installed, you can install it by following the instructions on the [official Deno website](https://deno.land/).

You will also need an OpenAI API key to use this script. You can sign up for an account and get an API key on the [OpenAI website](https://platform.openai.com/).

# Install

```sh
deno install -A -fn commit  jsr:@garn/commit
```

## Usage

```sh
commit [OPTIONS]
```

- `--add`: Runs `git add .` before creating the commit message.
- `--push`: Runs `git push` after creating the commit.
- `--ollama`: Uses the `llama3` model and sets the base URL to 'http://localhost:11434/v1'.
- `--debug`: Enables debug mode, which will print additional information to the console.

### Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key. This is required to interact with the OpenAI API.

## Example

Here's an example of how you can use `commit`:

```sh
OPENAI_API_KEY=your_api_key_here commit --add --push
```

This will add all changes, create a commit with a message generated by the OpenAI API, and push the changes to the current branch.