export interface ProviderConfig {
    defaultModel: string;
    envVar: string;
    requiresApiKey: boolean;
    requiresBaseUrl?: boolean;
    baseURL?: string;
    baseURLEnvVar?: string;
    sdk: "openai" | "anthropic" | "ollama" | "google";
}

export const PROVIDERS: Record<string, ProviderConfig> = {
    openai: {
        defaultModel: "gpt-5-nano",
        envVar: "OPENAI_API_KEY",
        requiresApiKey: true,
        sdk: "openai",
    },
    google: {
        defaultModel: "gemini-3-flash-preview",
        envVar: "GEMINI_API_KEY",
        requiresApiKey: true,
        sdk: "google",
    },
    ollama: {
        defaultModel: "gemma4:e4b",
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
