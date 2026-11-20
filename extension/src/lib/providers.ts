import rawRegistry from "../../../providers.json";
import type {
  ProviderConfig,
  ProviderRegistry,
  ProviderProtocol,
  AuthType,
} from "./types";
import { isPlainObject } from "./util";

const PROTOCOLS = new Set<ProviderProtocol>(["openai-chat", "anthropic-messages"]);
const AUTH_TYPES = new Set<AuthType>([
  "bearer",
  "x-api-key",
  "x-goog-api-key",
  "query-key",
]);

export function parseRegistry(value: unknown): {
  registry?: ProviderRegistry;
  errors: string[];
} {
  const errors: string[] = [];
  if (!isPlainObject(value)) return { errors: ["Provider registry must be an object"] };
  const version = value.version;
  const defaultProvider = value.defaultProvider;
  const providers = value.providers;
  if (typeof version !== "number") errors.push("version must be a number");
  if (typeof defaultProvider !== "string" || !defaultProvider) {
    errors.push("defaultProvider must be a non-empty string");
  }
  if (!Array.isArray(providers)) {
    return { errors: [...errors, "providers must be an array"] };
  }
  const parsedProviders: ProviderConfig[] = [];
  const ids = new Set<string>();
  for (const [index, provider] of providers.entries()) {
    const parsed = parseProvider(provider, index);
    errors.push(...parsed.errors);
    if (parsed.provider) {
      if (ids.has(parsed.provider.id)) {
        errors.push(`duplicate provider id: ${parsed.provider.id}`);
      } else {
        ids.add(parsed.provider.id);
        parsedProviders.push(parsed.provider);
      }
    }
  }
  if (typeof defaultProvider === "string" && !ids.has(defaultProvider)) {
    errors.push(`defaultProvider "${defaultProvider}" does not exist`);
  }
  if (errors.length > 0) return { errors };
  return {
    registry: {
      version: version as number,
      defaultProvider: defaultProvider as string,
      providers: parsedProviders,
    },
    errors: [],
  };
}

function parseProvider(
  value: unknown,
  index: number,
): { provider?: ProviderConfig; errors: string[] } {
  const errors: string[] = [];
  const prefix = `providers[${index}]`;
  if (!isPlainObject(value)) return { errors: [`${prefix} must be an object`] };
  const id = value.id;
  const name = value.name;
  const protocol = value.protocol;
  const baseUrl = value.baseUrl;
  const chatPath = value.chatPath;
  const auth = value.auth;
  if (typeof id !== "string" || !/^[a-z0-9-]+$/.test(id)) {
    errors.push(`${prefix}.id must match ^[a-z0-9-]+$`);
  }
  if (typeof name !== "string" || !name) errors.push(`${prefix}.name is required`);
  if (typeof protocol !== "string" || !PROTOCOLS.has(protocol as ProviderProtocol)) {
    errors.push(`${prefix}.protocol is invalid`);
  }
  if (typeof baseUrl !== "string" || !/^https?:\/\//.test(baseUrl)) {
    errors.push(`${prefix}.baseUrl must be an http(s) URL`);
  }
  if (typeof chatPath !== "string" || !chatPath.startsWith("/")) {
    errors.push(`${prefix}.chatPath must start with /`);
  }
  if (!isPlainObject(auth)) {
    errors.push(`${prefix}.auth must be an object`);
  } else {
    if (typeof auth.type !== "string" || !AUTH_TYPES.has(auth.type as AuthType)) {
      errors.push(`${prefix}.auth.type is invalid`);
    }
    if (auth.header !== undefined && typeof auth.header !== "string") {
      errors.push(`${prefix}.auth.header must be a string`);
    }
    if (auth.scheme !== undefined && typeof auth.scheme !== "string") {
      errors.push(`${prefix}.auth.scheme must be a string`);
    }
  }
  if (errors.length > 0) return { errors };
  return {
    provider: {
      id: id as string,
      name: name as string,
      protocol: protocol as ProviderProtocol,
      baseUrl: baseUrl as string,
      chatPath: chatPath as string,
      modelsPath: typeof value.modelsPath === "string" ? value.modelsPath : undefined,
      auth: {
        type: (auth as Record<string, unknown>).type as AuthType,
        header:
          typeof (auth as Record<string, unknown>).header === "string"
            ? ((auth as Record<string, unknown>).header as string)
            : undefined,
        scheme:
          typeof (auth as Record<string, unknown>).scheme === "string"
            ? ((auth as Record<string, unknown>).scheme as string)
            : undefined,
      },
      defaultModel:
        typeof value.defaultModel === "string" ? value.defaultModel : undefined,
      supportsTools: value.supportsTools === true,
      supportsStreaming: value.supportsStreaming === true,
      docsUrl: typeof value.docsUrl === "string" ? value.docsUrl : "",
      extraHeaders: isPlainObject(value.extraHeaders)
        ? Object.fromEntries(
            Object.entries(value.extraHeaders).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string",
            ),
          )
        : undefined,
      notes: typeof value.notes === "string" ? value.notes : undefined,
    },
    errors: [],
  };
}

const parsed = parseRegistry(rawRegistry as unknown);
if (!parsed.registry) {
  throw new Error(`Invalid providers.json: ${parsed.errors.join("; ")}`);
}

export const providerRegistry: ProviderRegistry = parsed.registry;

export function getProvider(id: string): ProviderConfig | undefined {
  return providerRegistry.providers.find((provider) => provider.id === id);
}

export function defaultProvider(): ProviderConfig {
  return (
    getProvider(providerRegistry.defaultProvider) ??
    providerRegistry.providers[0] ??
    (() => {
      throw new Error("No providers configured");
    })()
  );
}

export function replaceVariables(value: string, variables: Record<string, string>): string {
  return value.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
    return variables[key] ?? match;
  });
}

export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export function providerChatUrl(
  provider: ProviderConfig,
  variables: Record<string, string> = {},
): string {
  return joinUrl(replaceVariables(provider.baseUrl, variables), provider.chatPath);
}

export function providerModelsUrl(
  provider: ProviderConfig,
  variables: Record<string, string> = {},
): string {
  if (!provider.modelsPath) return "";
  return joinUrl(replaceVariables(provider.baseUrl, variables), provider.modelsPath);
}

export function providerAuthHeaders(
  provider: ProviderConfig,
  apiKey: string,
): Record<string, string> {
  const headers: Record<string, string> = { ...(provider.extraHeaders ?? {}) };
  switch (provider.auth.type) {
    case "bearer":
      headers[provider.auth.header ?? "Authorization"] = `${provider.auth.scheme ?? "Bearer "}${apiKey}`;
      break;
    case "x-api-key":
      headers[provider.auth.header ?? "x-api-key"] = apiKey;
      break;
    case "x-goog-api-key":
      headers[provider.auth.header ?? "x-goog-api-key"] = apiKey;
      break;
    case "query-key":
      break;
  }
  return headers;
}

export function providerModelsUrlWithKey(
  provider: ProviderConfig,
  apiKey: string,
  variables: Record<string, string> = {},
): string {
  const url = providerModelsUrl(provider, variables);
  if (provider.auth.type === "query-key") {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}key=${encodeURIComponent(apiKey)}`;
  }
  return url;
}

export function redactSecret(value: string): string {
  if (value.length <= 8) return "[redacted]";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export interface ModelListResult {
  ok: boolean;
  models: string[];
  status?: number;
  error?: string;
}

export async function fetchModels(
  provider: ProviderConfig,
  apiKey: string,
  variables: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<ModelListResult> {
  const url = providerModelsUrlWithKey(provider, apiKey, variables);
  if (!url) return { ok: false, models: [], error: "Provider has no models endpoint" };
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: providerAuthHeaders(provider, apiKey),
      signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        models: [],
        status: response.status,
        error: `HTTP ${response.status} ${response.statusText}`,
      };
    }
    const body = (await response.json()) as unknown;
    return { ok: true, models: extractModels(body), status: response.status };
  } catch (error) {
    return {
      ok: false,
      models: [],
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

function extractModels(value: unknown): string[] {
  if (!isPlainObject(value)) return [];
  const data = value.data;
  if (Array.isArray(data)) {
    return data
      .map((item) => {
        if (typeof item === "string") return item;
        if (isPlainObject(item) && typeof item.id === "string") return item.id;
        return undefined;
      })
      .filter((item): item is string => Boolean(item))
      .sort();
  }
  const models = value.models;
  if (Array.isArray(models)) {
    return models
      .map((item) => {
        if (typeof item === "string") return item;
        if (isPlainObject(item) && typeof item.name === "string") {
          return item.name.replace(/^models\//, "");
        }
        return undefined;
      })
      .filter((item): item is string => Boolean(item))
      .sort();
  }
  return [];
}