export interface ProviderConfig {
  defaultModel: string;
  envVar: string;
  requiresApiKey: boolean;
  requiresBaseUrl?: boolean;
  baseURL?: string;
  baseURLEnvVar?: string;
  sdk: "openai" | "anthropic" | "ollama" | "gemini";
}

export const PROVIDERS: Record<string, ProviderConfig> = {
  openai: {
    defaultModel: "gpt-5-nano",
    envVar: "OPENAI_API_KEY",
    requiresApiKey: true,
    sdk: "openai",
  },
  gemini: {
    defaultModel: "gemini-3-flash",
    envVar: "GEMINI_API_KEY",
    requiresApiKey: true,
    sdk: "gemini",
  },
  ollama: {
    defaultModel: "kimi-k2.5:cloud",
    envVar: "",
    requiresApiKey: false,
    requiresBaseUrl: true,
    baseURLEnvVar: "OLLAMA_BASE_URL",
    baseURL: "http://127.0.0.1:11434",
    sdk: "ollama",
  },
  "ollama-cloud": {
    defaultModel: "kimi-k2.5:cloud",
    envVar: "OLLAMA_API_KEY",
    requiresApiKey: true,
    baseURL: "https://ollama.com",
    sdk: "ollama",
  },
  anthropic: {
    defaultModel: "claude-haiku-4-5",
    envVar: "ANTHROPIC_API_KEY",
    requiresApiKey: true,
    sdk: "anthropic",
  },
};

export const VALID_PROVIDERS = Object.keys(PROVIDERS);
