import Anthropic from "npm:@anthropic-ai/sdk@0.80.0";

export async function anthropicComplete({
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
