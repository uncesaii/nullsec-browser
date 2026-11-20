import type { ProviderConfig } from "./types";
import { providerAuthHeaders, providerChatUrl } from "./providers";
import { isPlainObject, truncate, uid } from "./util";

export interface AiToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  rawArguments?: string;
}

export interface AiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: AiToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface AiTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatOptions {
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ChatResult {
  ok: boolean;
  text: string;
  toolCalls: AiToolCall[];
  status?: number;
  error?: string;
}

const DEFAULT_MAX_TOKENS = 4096;

export async function chatCompletion(
  provider: ProviderConfig,
  apiKey: string,
  model: string,
  messages: AiMessage[],
  tools: AiTool[],
  options: ChatOptions = {},
): Promise<ChatResult> {
  if (!model.trim()) {
    return { ok: false, text: "", toolCalls: [], error: "Choose a model first." };
  }
  const url = chatUrl(provider, apiKey);
  const headers: Record<string, string> = {
    ...providerAuthHeaders(provider, apiKey),
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  let body: Record<string, unknown>;
  if (provider.protocol === "anthropic-messages") {
    body = anthropicBody(model, messages, tools, options);
  } else {
    body = openAiBody(model, messages, tools, options);
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: options.signal,
    });
    if (!response.ok) {
      const detail = await readError(response, apiKey);
      return {
        ok: false,
        text: "",
        toolCalls: [],
        status: response.status,
        error: `HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
      };
    }
    const raw = (await response.json()) as unknown;
    if (provider.protocol === "anthropic-messages") {
      return parseAnthropic(raw);
    }
    return parseOpenAi(raw);
  } catch (error) {
    return {
      ok: false,
      text: "",
      toolCalls: [],
      error:
        error instanceof DOMException && error.name === "AbortError"
          ? "Request cancelled."
          : error instanceof Error
            ? error.message
            : "Provider request failed.",
    };
  }
}

function chatUrl(provider: ProviderConfig, apiKey: string): string {
  const url = providerChatUrl(provider);
  if (provider.auth.type !== "query-key") return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}key=${encodeURIComponent(apiKey)}`;
}

function openAiBody(
  model: string,
  messages: AiMessage[],
  tools: AiTool[],
  options: ChatOptions,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: messages.map((message) => {
      if (message.role === "assistant" && message.toolCalls?.length) {
        return {
          role: "assistant",
          content: message.content || null,
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id,
            type: "function",
            function: {
              name: call.name,
              arguments: JSON.stringify(call.arguments),
            },
          })),
        };
      }
      if (message.role === "tool") {
        return {
          role: "tool",
          tool_call_id: message.toolCallId ?? "",
          content: message.content,
        };
      }
      return { role: message.role, content: message.content };
    }),
    stream: false,
    max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
  };
  if (tools.length > 0) {
    body.tools = tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
    body.tool_choice = "auto";
  }
  return body;
}

function anthropicBody(
  model: string,
  messages: AiMessage[],
  tools: AiTool[],
  options: ChatOptions,
): Record<string, unknown> {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const converted: Array<Record<string, unknown>> = [];
  let index = 0;
  while (index < messages.length) {
    const message = messages[index];
    if (!message || message.role === "system") {
      index += 1;
      continue;
    }
    if (message.role === "tool") {
      const blocks: Array<Record<string, unknown>> = [];
      while (index < messages.length && messages[index]?.role === "tool") {
        const toolMessage = messages[index];
        if (toolMessage) {
          blocks.push({
            type: "tool_result",
            tool_use_id: toolMessage.toolCallId ?? "",
            content: toolMessage.content,
          });
        }
        index += 1;
      }
      converted.push({ role: "user", content: blocks });
      continue;
    }
    if (message.role === "assistant") {
      const blocks: Array<Record<string, unknown>> = [];
      if (message.content) blocks.push({ type: "text", text: message.content });
      for (const call of message.toolCalls ?? []) {
        blocks.push({
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: call.arguments,
        });
      }
      converted.push({
        role: "assistant",
        content: blocks.length > 0 ? blocks : [{ type: "text", text: "" }],
      });
      index += 1;
      continue;
    }
    converted.push({
      role: "user",
      content: [{ type: "text", text: message.content }],
    });
    index += 1;
  }
  const body: Record<string, unknown> = {
    model,
    max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: converted,
  };
  if (system) body.system = system;
  if (tools.length > 0) {
    body.tools = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }
  return body;
}

function parseOpenAi(value: unknown): ChatResult {
  if (!isPlainObject(value)) {
    return { ok: false, text: "", toolCalls: [], error: "Provider returned invalid JSON." };
  }
  if (isPlainObject(value.error)) {
    return {
      ok: false,
      text: "",
      toolCalls: [],
      error: typeof value.error.message === "string" ? value.error.message : "Provider error.",
    };
  }
  const choices = Array.isArray(value.choices) ? value.choices : [];
  const choice = choices[0];
  const message = isPlainObject(choice) ? choice.message : undefined;
  if (!isPlainObject(message)) {
    return { ok: false, text: "", toolCalls: [], error: "Provider returned no message." };
  }
  const toolCalls = Array.isArray(message.tool_calls)
    ? message.tool_calls.flatMap((item) => {
        if (!isPlainObject(item)) return [];
        const fn = isPlainObject(item.function) ? item.function : undefined;
        const name = typeof fn?.name === "string" ? fn.name : "";
        if (!name) return [];
        const rawArguments =
          typeof fn?.arguments === "string"
            ? fn.arguments
            : fn?.arguments !== undefined
              ? JSON.stringify(fn.arguments)
              : "";
        return [
          {
            id: typeof item.id === "string" ? item.id : uid("call"),
            name,
            arguments: parseArguments(rawArguments),
            rawArguments,
          },
        ];
      })
    : [];
  return {
    ok: true,
    text: contentText(message.content),
    toolCalls,
  };
}

function parseAnthropic(value: unknown): ChatResult {
  if (!isPlainObject(value)) {
    return { ok: false, text: "", toolCalls: [], error: "Provider returned invalid JSON." };
  }
  if (isPlainObject(value.error)) {
    return {
      ok: false,
      text: "",
      toolCalls: [],
      error: typeof value.error.message === "string" ? value.error.message : "Provider error.",
    };
  }
  const blocks = Array.isArray(value.content) ? value.content : [];
  const text: string[] = [];
  const toolCalls: AiToolCall[] = [];
  for (const block of blocks) {
    if (!isPlainObject(block)) continue;
    if (block.type === "text" && typeof block.text === "string") {
      text.push(block.text);
    }
    if (block.type === "tool_use" && typeof block.name === "string") {
      const input = isPlainObject(block.input) ? block.input : {};
      toolCalls.push({
        id: typeof block.id === "string" ? block.id : uid("call"),
        name: block.name,
        arguments: input,
        rawArguments: JSON.stringify(input),
      });
    }
  }
  return { ok: true, text: text.join("\n").trim(), toolCalls };
}

function contentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((part) => {
      if (typeof part === "string") return part;
      if (isPlainObject(part) && typeof part.text === "string") return part.text;
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function parseArguments(value: string): Record<string, unknown> {
  if (!value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function readError(response: Response, apiKey: string): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return "";
    let detail = truncate(text, 1200);
    try {
      const parsed = JSON.parse(text) as unknown;
      if (isPlainObject(parsed) && isPlainObject(parsed.error)) {
        if (typeof parsed.error.message === "string") detail = parsed.error.message;
        else if (typeof parsed.error.type === "string") detail = parsed.error.type;
      }
    } catch {
      // Keep the truncated text response.
    }
    if (apiKey.length > 3) detail = detail.split(apiKey).join("[redacted]");
    return detail.replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}