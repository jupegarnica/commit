export interface ProviderConfig {
  defaultModel: string;
  envVar: string;
  requiresApiKey: boolean;
  requiresBaseUrl?: boolean;
  baseURL?: string;
  baseURLEnvVar?: string;
  sdk: "openai" | "anthropic";
}

export const PROVIDERS: Record<string, ProviderConfig> = {
  openai: {
    defaultModel: "gpt-5-nano",
    envVar: "OPENAI_API_KEY",
    requiresApiKey: true,
    sdk: "openai",
  },
  gemini: {
    defaultModel: "gemini-2.0-flash",
    envVar: "GEMINI_API_KEY",
    requiresApiKey: true,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    sdk: "openai",
  },
  ollama: {
    defaultModel: "llama3",
    envVar: "",
    requiresApiKey: false,
    requiresBaseUrl: true,
    baseURLEnvVar: "OLLAMA_BASE_URL",
    sdk: "openai",
  },
  "ollama-cloud": {
    defaultModel: "kimi-k2.5:cloud",
    envVar: "OLLAMA_API_KEY",
    requiresApiKey: true,
    baseURL: "https://api.ollama.ai/v1",
    sdk: "openai",
  },
  anthropic: {
    defaultModel: "claude-sonnet-4-20250514",
    envVar: "ANTHROPIC_API_KEY",
    requiresApiKey: true,
    sdk: "anthropic",
  },
};

export const VALID_PROVIDERS = Object.keys(PROVIDERS);
