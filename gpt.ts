import OpenAI from 'npm:openai';
const MAX_TOKENS = 2048;

const openai = new OpenAI({
    apiKey: Deno.env.get('OCO_OPENAI_API_KEY'),
});

let content = Deno.args.join(' ') + '\n';
if (!Deno.stdin.isTerminal()) {
    const decoder = new TextDecoder();
    for await (const chunk of Deno.stdin.readable) {
        content += decoder.decode(chunk);
    }
}


const words = content.split(' ').length;
// console.warn({ words });
if (words > MAX_TOKENS) {
    console.error(`Input is too long: ${words} words`);
    Deno.exit(1);
}


const chatCompletion = await openai.chat.completions.create({
    model: "gpt-4-turbo-preview",
    messages: [
        {
            role: "system",
            content: "You are a expert in git diffs. You are helping a user to create a commit message for a git diff. You should use conventional commit notation to create a commit message for this git diff. do not use any markdown markup, only text. If the git diff is empty return only zero characters."
        },
        {
            role: "user",
            content
        }
    ],
    temperature: 0,
    stream: false,
});
const response = chatCompletion.choices[0].message.content;

// const model = chatCompletion.model;
//console.error(model);

console.log(response);
