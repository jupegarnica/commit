import OpenAI from 'npm:openai';

const openai = new OpenAI({
    apiKey: Deno.env.get('OCO_OPENAI_API_KEY'),
});


const chatCompletion = await openai.chat.completions.create({
    model: "gpt-4-turbo-preview",
    messages: [
        {
            role: "system",
            content: "You are a expert in git diffs. You are helping a user to create a commit message for a git diff. You should use conventional commit notation to create a commit message for this git diff. do not use any markdown markup, only text. If the git diff is empty return only zero characters."
        },
        {
            role: "user",
            content: Deno.args.join('')
        }
    ],
    temperature: 0,
    stream: false,
});
const response = chatCompletion.choices[0].message.content;

// const model = chatCompletion.model;
//console.error(model);

console.log(response);
