import OpenAI from "npm:openai@4.38.3";

export async function gpt({
  model,
  apiKey,
  baseURL,
  content,
  systemContent,
}: {
  model: string;
  apiKey: string;
  content: string;
  systemContent: string;
  baseURL?: string;
}): Promise<string> {
  const openai = new OpenAI({
    apiKey,
    baseURL,
  });

  const chatCompletion = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: systemContent,
      },
      {
        role: "user",
        content: content,
      },
    ],
    temperature: 0,
    stream: false,
  });

  return chatCompletion.choices[0].message.content || "";
}

if (import.meta.main) {
  let content = Deno.args.join(" ") + "\n";
  if (!Deno.stdin.isTerminal()) {
    const decoder = new TextDecoder();
    for await (const chunk of Deno.stdin.readable) {
      content += decoder.decode(chunk);
    }
  }

  const MAX_TOKENS = 6_000;
  const words = content.split(" ").length;
  // console.warn({ words });
  if (words > MAX_TOKENS) {
    console.warn({ content, words });
    console.error(`Input is too long: ${words} words`);
    Deno.exit(1);
  }
  const response = await gpt({
    model: "gpt-4o-mini",
    apiKey: Deno.env.get("OCO_OPENAI_API_KEY")!,
    baseURL: undefined,
    content: content,
    systemContent:
      "You are a expert programmer. You are helping a user to write a code snippet. You should use the best practices and idiomatic code to write a code snippet for the given problem. If the code snippet is empty return only zero characters.",
  });

  console.log(response);
}
