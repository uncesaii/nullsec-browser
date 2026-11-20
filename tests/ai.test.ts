import { afterEach, describe, expect, it, vi } from "vitest";
import { chatCompletion } from "../extension/src/lib/ai";
import type { AiMessage, AiTool } from "../extension/src/lib/ai";
import { getProvider } from "../extension/src/lib/providers";

const tools: AiTool[] = [
  {
    name: "decode_text",
    description: "Decode text locally.",
    parameters: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAI-compatible chat adapter", () => {
  it("sends messages and tools, then parses text and tool calls", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "Try this.",
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: {
                      name: "decode_text",
                      arguments: '{"text":"QQ=="}',
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = getProvider("openrouter");
    expect(provider).toBeDefined();
    if (!provider) return;
    const messages: AiMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "decode QQ==" },
    ];
    const result = await chatCompletion(provider, "secret-key", "auto", messages, tools);
    expect(result.ok).toBe(true);
    expect(result.text).toBe("Try this.");
    expect(result.toolCalls).toEqual([
      {
        id: "call_1",
        name: "decode_text",
        arguments: { text: "QQ==" },
        rawArguments: '{"text":"QQ=="}',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(String(call[1].body)) as Record<string, unknown>;
    expect(body.model).toBe("auto");
    expect(body.stream).toBe(false);
    expect(body.tool_choice).toBe("auto");
    expect(body.tools).toEqual([
      {
        type: "function",
        function: {
          name: "decode_text",
          description: "Decode text locally.",
          parameters: tools[0]?.parameters,
        },
      },
    ]);
    const headers = call[1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-key");
  });

  it("returns a redacted provider error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({ error: { message: "bad key secret-key" } }),
          { status: 401, headers: { "content-type": "application/json" } },
        );
      }),
    );
    const provider = getProvider("openai");
    expect(provider).toBeDefined();
    if (!provider) return;
    const result = await chatCompletion(
      provider,
      "secret-key",
      "gpt-test",
      [{ role: "user", content: "hi" }],
      [],
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toContain("bad key [redacted]");
  });
});

describe("Anthropic messages adapter", () => {
  it("uses the native schema and parses tool_use blocks", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          content: [
            { type: "text", text: "Let me decode that." },
            { type: "tool_use", id: "toolu_1", name: "decode_text", input: { text: "QQ==" } },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = getProvider("anthropic");
    expect(provider).toBeDefined();
    if (!provider) return;
    const result = await chatCompletion(
      provider,
      "anthropic-key",
      "claude-test",
      [
        { role: "system", content: "system" },
        { role: "user", content: "decode QQ==" },
      ],
      tools,
    );
    expect(result.ok).toBe(true);
    expect(result.text).toBe("Let me decode that.");
    expect(result.toolCalls[0]?.name).toBe("decode_text");
    expect(result.toolCalls[0]?.arguments).toEqual({ text: "QQ==" });
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe("https://api.anthropic.com/v1/messages");
    const body = JSON.parse(String(call[1].body)) as Record<string, unknown>;
    expect(body.system).toBe("system");
    expect(body.max_tokens).toBe(4096);
    expect(body.tools).toEqual([
      {
        name: "decode_text",
        description: "Decode text locally.",
        input_schema: tools[0]?.parameters,
      },
    ]);
    const headers = call[1].headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("anthropic-key");
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
  });
});