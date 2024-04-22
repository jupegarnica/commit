import * as mod from "jsr:@david/dax";
import OpenAI from 'npm:openai';
const MAX_TOKENS = 6_000;

const $ = mod.default;

export async function commit() {
    let model = 'gpt-4-turbo-preview';
    let baseURL: string | undefined = undefined;

    if (Deno.args.includes('--add')) {
        await $`git add .`;
    }

    if (Deno.args.includes('--ollama')) {
        model = 'llama3';
        baseURL = 'http://localhost:11434/v1';

    }
    const diff = await $`git diff --unified=5 --staged -- . ':(exclude)*.lock'`.text();
    if (!diff) {
        console.error('No changes');
        Deno.exit(1);
        return;
    }

    const openai = new OpenAI({
        apiKey: Deno.env.get('OCO_OPENAI_API_KEY'),
        baseURL,
    });



    const words = diff.split(' ').length;
    // console.warn({ words });
    if (words > MAX_TOKENS) {
        console.error(`Input is too long: ${words} words`);
        Deno.exit(1);
    }


    const chatCompletion = await openai.chat.completions.create({
        // model: "gpt-4-turbo-preview",
        model,
        messages: [
            {
                role: "system",
                content: "You are a expert in git diffs. You are helping a user to create a commit message for a git diff. You should use conventional commit notation to create a commit message for this git diff. do not use any markdown markup, only text. If the git diff is empty return only zero characters."
            },
            {
                role: "user",
                content: diff
            }
        ],
        temperature: 0,
        stream: false,
    });
    const commitMessage = chatCompletion.choices[0].message.content;

    if (!commitMessage) {
        console.error('No commitMessage');
        Deno.exit(1);
    }

    // console.log(commitMessage);

    await $.raw`git commit --edit -m "${commitMessage}"`;

    if (Deno.args.includes('--push')) {
        await $`git push`;
    }


}


if (import.meta.main) {
    await commit();
}