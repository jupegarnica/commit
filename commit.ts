import $ from "jsr:@david/dax@0.40.1";
import OpenAI from 'npm:openai@4.38.3';
import { parseArgs } from "jsr:@std/cli@0.223.0"
import { gpt } from "./gpt.ts";


async function dax(strings: TemplateStringsArray, ...values: any[]) {

    try {
        return await $.raw(strings, ...values);
    } catch (error) {
        // console.error(error.message);
        Deno.exit(1);

    }
}

async function daxSilent(strings: TemplateStringsArray, ...values: any[]) {

    try {
        return await $.raw(strings, ...values).text();
    } catch (error) {
        console.error(error);
        Deno.exit(1);
    }
}



export async function commit(): Promise<void> {
    const args = parseArgs(Deno.args, {
        boolean: ['add', 'push', 'ollama', 'debug', 'config', 'skipEdit', 'noCommit', 'help'],
        string: ['apiKey', 'model', 'baseURL', 'maxWords'],
    });
    const MAX_TOKENS = Number(args.maxWords) || 6_000;
    let debug = args.debug || false;
    let model = args.model || 'gpt-4o-mini';
    let baseURL: string | undefined = undefined;
    let apiKey = args.apiKey || Deno.env.get('OCO_OPENAI_API_KEY') || Deno.env.get('OPENAI_API_KEY') || localStorage.getItem('OPENAI_API_KEY');

    if (args.help) {
        console.log(`Usage: commit [options]

--add: Runsgit add . before creating the commit message.
--push: Runsgit push after creating the commit.
--skipEdit: Skips the editing of the commit message before creating the commit.
--noCommit: Skips the creation of the commit.Just prints the commit message.
--model<model>: Specifies the model to use for generating the commit message.The default is gpt-4o.
--config: Ask for the OpenAI API key and save it.
--apiKey<apiKey>: Specifies the OpenAI API key to use.This will override the value set in theOPENAI_API_KEY environment variable.
--baseURL<baseURL>: Specifies the base URL to use for the OpenAI API.This will override the default base URL.
--debug: Enables debug mode, which will print additional information to the console.
--maxWords<maxWords>: Specifies the maximum number of words to call the api.The default is 6000. Is useful to no incur in extra charges.
--ollama: Uses the llama3 model and sets the base URL to 'http://localhost:11434/v1'.
--help: Prints the help message.

       `);
        return;
    }

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
    debug && console.debug({ args,  model, baseURL });
    const diff = await daxSilent`git diff --unified=5 --staged -- . ':(exclude)*.lock'`
    debug && console.debug({ diff });

    if (!diff) {
        console.error('No staged changes to commit. \nUse --add flag to add all changes to commit, or use git add for specific files.');
        return Deno.exit(1);
    }




    const words = diff.split(' ').length;
    debug && console.debug({ words });
    if (words > MAX_TOKENS) {
        console.error(`Input is too long: ${words} words`);
        Deno.exit(1);
    }
    const commitsToLearn = Number(args.commitsToLearn) || 10;
    if (isNaN(commitsToLearn)) {
        console.error(`Invalid commitsToLearn: ${commitsToLearn}`);
        Deno.exit(1);
    }
    let commits = '';
    if (commitsToLearn > 0) {
        commits = await daxSilent`git log --oneline -n ${commitsToLearn}`;
        debug && console.debug({commits});
    }


    let systemContent = "You are a expert in git diffs. You are helping a user to create a commit message for a git diff. You should use conventional commit notation to create a commit message for this git diff. Do not use any markdown markup, only text. If the git diff is empty return only zero characters. Only include the commit message, do not include anything else, just the commit message without any quotes or backticks."
    if (commits) {
        systemContent += `\nYou should follow the commit style of this commits:\n${commits}`;
    }
    let commitMessage: string = await gpt({
        model,
        apiKey,
        baseURL,
        content: diff,
        systemContent,
    })
    commitMessage = commitMessage?.trim().replace(/(^['"`]|$['"`])/, "").replace(/`/g, "'");
    debug && console.debug({ commitMessage });
    if (!commitMessage) {
        console.error('No commitMessage');
        Deno.exit(1);
    }

    if (args.noCommit) {
        console.log(commitMessage);
        return;

    }
    const edit = args.skipEdit ? '' : ' --edit';
    await dax`git commit ${edit} -m "${commitMessage}"`;

    if (args.push) {
        await $`git push`;
    }


}


if (import.meta.main) {
    await commit();
}