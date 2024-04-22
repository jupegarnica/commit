import OpenAI from 'npm:openai';
const MAX_TOKENS = 6_000;

const isLlama3 = Deno.args.includes('--llama3');

const model = isLlama3 ? 'llama3' : "gpt-4-turbo-preview";
const baseURL = isLlama3 ? 'http://localhost:11434/v1' : undefined;
const openai = new OpenAI({
    apiKey: Deno.env.get('OCO_OPENAI_API_KEY'),
    baseURL,
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
    console.warn({ content, words });
    console.error(`Input is too long: ${words} words`);
    Deno.exit(1);
}


const chatCompletion = await openai.chat.completions.create({
    model,
    // model: 'llama3',
    messages: [
        {
            role: "system",
            content: "You are a expert programmer. You are helping a user to write a code snippet. You should use the best practices and idiomatic code to write a code snippet for the given problem. If the code snippet is empty return only zero characters."
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

if (!response) {
    console.error('No response');
    Deno.exit(1);
}
// const model = chatCompletion.model;
//console.error(model);

console.log(response);
