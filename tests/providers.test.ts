import { describe, expect, it } from "vitest";
import {
  defaultProvider,
  getProvider,
  parseRegistry,
  providerAuthHeaders,
  providerChatUrl,
  providerModelsUrl,
  providerRegistry,
} from "../extension/src/lib/providers";
import rawRegistry from "../providers.json";

describe("provider registry", () => {
  it("parses the shipped registry without errors", () => {
    const parsed = parseRegistry(rawRegistry);
    expect(parsed.errors).toEqual([]);
    expect(parsed.registry?.providers.length).toBeGreaterThan(10);
  });

  it("has a valid default provider", () => {
    expect(getProvider(providerRegistry.defaultProvider)).toBeDefined();
    expect(defaultProvider().id).toBe("openrouter");
  });

  it("has unique provider ids", () => {
    const ids = providerRegistry.providers.map((provider) => provider.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rejects malformed registries", () => {
    const parsed = parseRegistry({
      version: 1,
      defaultProvider: "missing",
      providers: [{ id: "x", name: "X", protocol: "nope", baseUrl: "x", chatPath: "x", auth: {} }],
    });
    expect(parsed.errors.length).toBeGreaterThan(0);
  });

  it("builds chat and model URLs", () => {
    const provider = getProvider("openrouter");
    expect(provider).toBeDefined();
    if (!provider) return;
    expect(providerChatUrl(provider)).toBe(
      "https://openrouter.ai/api/v1/chat/completions",
    );
    expect(providerModelsUrl(provider)).toBe("https://openrouter.ai/api/v1/models");
  });

  it("builds auth headers per provider", () => {
    const anthropic = getProvider("anthropic");
    const gemini = getProvider("gemini");
    expect(anthropic).toBeDefined();
    expect(gemini).toBeDefined();
    if (!anthropic || !gemini) return;
    expect(providerAuthHeaders(anthropic, "key")).toMatchObject({
      "x-api-key": "key",
      "anthropic-version": "2023-06-01",
    });
    expect(providerAuthHeaders(gemini, "key")).toMatchObject({
      Authorization: "Bearer key",
    });
    expect(providerChatUrl(gemini)).toBe(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    );
  });
});