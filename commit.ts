import $ from "jsr:@david/dax@0.40.1";
import OpenAI from 'npm:openai@4.38.3';
import { parseArgs } from "jsr:@std/cli@0.223.0"


async function dax(strings: TemplateStringsArray, ...values: any[]) {

    try {
        return await $.raw(strings, ...values);
    } catch (error) {
        // console.error(error.message);
        Deno.exit(1);

    }
}


export async function commit(): Promise<void> {
    const args = parseArgs(Deno.args, {
        boolean: ['add', 'push', 'ollama', 'debug', 'config'],
        string: ['apiKey', 'model', 'baseURL', 'maxWords'],
    });
    const MAX_TOKENS = Number(args.maxWords) || 6_000;
    let debug = args.debug || false;
    let model = args.model || 'gpt-4-turbo-preview';
    let baseURL: string | undefined = undefined;
    let apiKey = args.apiKey || Deno.env.get('OCO_OPENAI_API_KEY') || Deno.env.get('OPENAI_API_KEY') || localStorage.getItem('OPENAI_API_KEY');

    if (!apiKey || args.config) {
        apiKey = await $.prompt('Enter OpenAI API Key or set OPENAI_API_KEY env variable');
        localStorage.setItem('OPENAI_API_KEY', apiKey);
    }



    if (args.add) {
        await $`git add .`;
    }

    if (args.ollama) {
        model = args.model || 'llama3';
        baseURL = args.baseURL || 'http://localhost:11434/v1';

    }
    const diff = await $.raw`git diff --unified=5 --staged -- . ':(exclude)*.lock'`.text();
    debug && console.debug({ diff });

    if (!diff) {
        console.error('No staged changes to commit. \n Use --add flag to add all changes to commit. or use git add for specific files.');
        return Deno.exit(1);
    }

    const openai = new OpenAI({
        apiKey,
        baseURL,
    });



    const words = diff.split(' ').length;
    debug && console.debug({ words });
    if (words > MAX_TOKENS) {
        console.error(`Input is too long: ${words} words`);
        Deno.exit(1);
    }


    const chatCompletion = await openai.chat.completions.create({
        model,
        messages: [
            {
                role: "system",
                content: "You are a expert in git diffs. You are helping a user to create a commit message for a git diff. You should use conventional commit notation to create a commit message for this git diff. do not use any markdown markup, only text. If the git diff is empty return only zero characters. Only include the commit message, do not include anything els, just the commit message without any quotes or backticks."
            },
            {
                role: "user",
                content: diff
            }
        ],
        temperature: 0,
        stream: false,
    });
    let commitMessage: string = chatCompletion.choices[0].message.content || "";
    commitMessage = commitMessage?.trim().replace(/(^['"`]|$['"`])/, "").replace(/`/g, "'");
    debug && console.debug({ commitMessage });
    if (!commitMessage) {
        console.error('No commitMessage');
        Deno.exit(1);
    }


    await dax`git commit --edit -m "${commitMessage}"`;

    if (args.push) {
        await $`git push`;
    }


}


if (import.meta.main) {
    await commit();
}