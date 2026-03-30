import OpenAI from "npm:openai@4.38.3";
import Anthropic from "npm:@anthropic-ai/sdk@0.80.0";
import { Ollama } from "npm:ollama@0.6.3";
import { GoogleGenAI } from "npm:@google/genai@1.47.0";

export async function askLLM({
  model,
  apiKey,
  baseURL,
  content,
  systemContent,
  sdk,
}: {
  model: string;
  apiKey: string;
  content: string;
  systemContent: string;
  baseURL?: string;
  sdk: "openai" | "anthropic" | "ollama" | "gemini";
}): Promise<string> {
  if (sdk === "anthropic") {
    const client = new Anthropic({ apiKey, baseURL });
    const message = await client.messages.create({
      model,
      max_tokens: 1024,
      system: systemContent,
      messages: [{ role: "user", content }],
    });
    const textBlock = message.content.find((b) => b.type === "text");
    return (textBlock && "text" in textBlock ? textBlock.text : "") || "";
  }

  if (sdk === "ollama") {
    const client = new Ollama({
      host: baseURL,
      ...(apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {}),
    });
    const response = await client.chat({
      model,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content },
      ],
    });
    return response.message.content;
  }

  if (sdk === "gemini") {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: `${systemContent}\n\n${content}`,
    });
    return response.text ?? "";
  }

  const openai = new OpenAI({ apiKey, baseURL });
  const chatCompletion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content },
    ],
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
  const response = await askLLM({
    model: "gpt-4o-mini",
    apiKey: Deno.env.get("OCO_OPENAI_API_KEY")!,
    baseURL: undefined,
    content: content,
    sdk: "openai",
    systemContent:
      "You are a expert programmer. You are helping a user to write a code snippet. You should use the best practices and idiomatic code to write a code snippet for the given problem. If the code snippet is empty return only zero characters.",
  });

  console.log(response);
}
