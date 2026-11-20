import type { AiTool } from "./ai";
import type { BackgroundState, MessageResponse } from "./messaging";
import { sendMessage, sendRepeater } from "./messaging";
import type {
  CookieSummary,
  FlagMatch,
  RequestRecord,
  ScopedTab,
  Settings,
  StorageSnapshot,
} from "./types";
import {
  decodeBase64,
  decodeBase32,
  decodeBase58,
  decodeHex,
  decodeHtmlEntities,
  decodeJwt,
  decodeUrl,
  identifyHash,
} from "./decoders";
import { redactText } from "./redact";
import { isPlainObject, truncate } from "./util";

export const READ_ONLY_TOOLS: AiTool[] = [
  {
    name: "get_page_context",
    description:
      "Read the active http(s) tab's visible text, headings, links, forms, and metadata. Returns redacted content.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "scan_flags",
    description:
      "Scan the active http(s) tab for flag candidates using the configured regex patterns. Returns candidate values with context.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_requests",
    description:
      "List recent captured request metadata for the active workspace. Does not return cookies, authorization headers, or bodies.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Maximum number of requests to return. Default 20.",
        },
        host: {
          type: "string",
          description: "Optional exact host filter, for example challenge.example.com.",
        },
        tabId: {
          type: "integer",
          description: "Optional tab ID filter from browser_tabs.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "decode_text",
    description:
      "Try local decoders on a short string: base64, base32, base58, hex, URL encoding, HTML entities, JWT, and hash identification. No network access.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "The string to decode or identify." },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
];

export const ACTIVE_TOOLS: AiTool[] = [
  {
    name: "browser_tabs",
    description:
      "List open tabs whose URLs are in the active workspace scope. Returns tab IDs, titles, URLs, and the active flag.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "browser_tab",
    description:
      "Open, activate, close, or navigate an in-scope tab. Every target URL is checked against workspace scope.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["open", "activate", "close", "navigate", "reload"],
        },
        tabId: {
          type: "integer",
          description: "Target tab ID for activate, close, or navigate. Defaults to the active tab.",
        },
        url: {
          type: "string",
          description: "Target http(s) URL for open or navigate.",
        },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  {
    name: "http_request",
    description:
      "Send an HTTP request to an in-scope URL through the background repeater. Applies workspace scope, rate limits, header sanitization, and manual redirect checks.",
    parameters: {
      type: "object",
      properties: {
        method: { type: "string", description: "HTTP method, for example GET or POST." },
        url: { type: "string", description: "Absolute http(s) URL inside workspace scope." },
        headers: {
          type: "object",
          additionalProperties: { type: "string" },
          description: "Optional request headers.",
        },
        body: { type: "string", description: "Optional request body." },
      },
      required: ["method", "url"],
      additionalProperties: false,
    },
  },
  {
    name: "dom_query",
    description:
      "Query elements in the active in-scope tab with a CSS selector. Returns tag, text, links, and optional HTML or form values.",
    parameters: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector." },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        includeHtml: { type: "boolean", description: "Include outerHTML, truncated." },
        includeValues: {
          type: "boolean",
          description: "Include input, textarea, and select values.",
        },
      },
      required: ["selector"],
      additionalProperties: false,
    },
  },
  {
    name: "dom_click",
    description:
      "Click an element in the active in-scope tab. Cross-origin link clicks and form submissions are blocked; use browser_tab navigate instead.",
    parameters: {
      type: "object",
      properties: { selector: { type: "string" } },
      required: ["selector"],
      additionalProperties: false,
    },
  },
  {
    name: "dom_fill",
    description:
      "Set an input, textarea, select, or contenteditable value in the active in-scope tab and dispatch input/change events.",
    parameters: {
      type: "object",
      properties: {
        selector: { type: "string" },
        value: { type: "string" },
      },
      required: ["selector", "value"],
      additionalProperties: false,
    },
  },
  {
    name: "dom_submit",
    description:
      "Submit a form in the active in-scope tab. Cross-origin form actions are blocked.",
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "Optional form or descendant selector. Defaults to the active element's form.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "dom_set_attribute",
    description: "Set an attribute on an element in the active in-scope tab.",
    parameters: {
      type: "object",
      properties: {
        selector: { type: "string" },
        name: { type: "string" },
        value: { type: "string" },
      },
      required: ["selector", "name", "value"],
      additionalProperties: false,
    },
  },
  {
    name: "get_performance",
    description:
      "Read navigation timing, resource entries, DOM counts, and JS heap information from the active in-scope tab.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_console",
    description:
      "Read page error and unhandled-rejection events captured since the content script loaded.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
];

export const SENSITIVE_TOOLS: AiTool[] = [
  {
    name: "cookie_get",
    description:
      "Read cookies for an in-scope URL, including HttpOnly cookies. Values are sent to the selected provider.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Optional in-scope URL. Defaults to the active tab.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "cookie_set",
    description:
      "Set a host-only cookie for an in-scope URL. Domain is not accepted; the URL host is used.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Optional in-scope URL. Defaults to the active tab." },
        name: { type: "string" },
        value: { type: "string" },
        path: { type: "string" },
        secure: { type: "boolean" },
        httpOnly: { type: "boolean" },
        sameSite: {
          type: "string",
          enum: ["no_restriction", "lax", "strict", "unspecified"],
        },
        expirationDate: { type: "number" },
      },
      required: ["name", "value"],
      additionalProperties: false,
    },
  },
  {
    name: "cookie_delete",
    description: "Delete a cookie by name for an in-scope URL.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Optional in-scope URL. Defaults to the active tab." },
        name: { type: "string" },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "storage_get",
    description:
      "Read localStorage and sessionStorage for the active in-scope tab. Values are sent to the selected provider.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "storage_set",
    description: "Write a localStorage or sessionStorage key in the active in-scope tab.",
    parameters: {
      type: "object",
      properties: {
        area: { type: "string", enum: ["local", "session"] },
        key: { type: "string" },
        value: { type: "string" },
      },
      required: ["key", "value"],
      additionalProperties: false,
    },
  },
  {
    name: "storage_delete",
    description: "Delete a localStorage or sessionStorage key in the active in-scope tab.",
    parameters: {
      type: "object",
      properties: {
        area: { type: "string", enum: ["local", "session"] },
        key: { type: "string" },
      },
      required: ["key"],
      additionalProperties: false,
    },
  },
  {
    name: "storage_clear",
    description: "Clear localStorage or sessionStorage in the active in-scope tab.",
    parameters: {
      type: "object",
      properties: {
        area: { type: "string", enum: ["local", "session"] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "dom_run_js",
    description:
      "Run JavaScript in the active tab's content-script world. Powerful and can leave workspace scope; use only on authorized targets. Returns a truncated serializable result.",
    parameters: {
      type: "object",
      properties: {
        source: { type: "string", description: "JavaScript source. Top-level await is not supported." },
      },
      required: ["source"],
      additionalProperties: false,
    },
  },
];

export const ACTIVE_TOOL_NAMES = new Set(ACTIVE_TOOLS.map((tool) => tool.name));
export const SENSITIVE_TOOL_NAMES = new Set(SENSITIVE_TOOLS.map((tool) => tool.name));

export function toolsForSettings(settings: Settings): AiTool[] {
  if (!settings.enableActiveTools) return READ_ONLY_TOOLS;
  return settings.enableSensitiveTools
    ? [...READ_ONLY_TOOLS, ...ACTIVE_TOOLS, ...SENSITIVE_TOOLS]
    : [...READ_ONLY_TOOLS, ...ACTIVE_TOOLS];
}

export interface ToolExecution {
  label: string;
  text: string;
}

export async function executeAiTool(
  name: string,
  args: Record<string, unknown>,
  settings: Settings,
): Promise<ToolExecution> {
  if (ACTIVE_TOOL_NAMES.has(name) && !settings.enableActiveTools) {
    throw new Error("Active browser tools are disabled in Agent control settings.");
  }
  if (SENSITIVE_TOOL_NAMES.has(name) && !settings.enableSensitiveTools) {
    throw new Error("Cookie, storage, and page-JS tools are disabled in Agent control settings.");
  }
  switch (name) {
    case "get_page_context":
      return pageContext(settings);
    case "scan_flags":
      return scanFlags();
    case "list_requests":
      return listRequests(args);
    case "decode_text":
      return decodeText(args);
    case "browser_tabs":
      return browserTabs();
    case "browser_tab":
      return browserTab(args);
    case "http_request":
      return httpRequest(args, settings);
    case "cookie_get":
      return cookieGet(args, settings);
    case "cookie_set":
      return cookieSet(args);
    case "cookie_delete":
      return cookieDelete(args);
    case "storage_get":
      return storageGet(settings);
    case "storage_set":
      return storageSet(args);
    case "storage_delete":
      return storageDelete(args);
    case "storage_clear":
      return storageClear(args);
    case "dom_query":
      return dom("query", args, `DOM query: ${stringArg(args, "selector", 80)}`, settings);
    case "dom_click":
      return dom("click", args, "DOM click", settings);
    case "dom_fill":
      return dom("fill", args, "DOM fill", settings);
    case "dom_submit":
      return dom("submit", args, "DOM submit", settings);
    case "dom_set_attribute":
      return dom("set-attribute", args, "DOM set attribute", settings);
    case "dom_run_js":
      return dom("run-js", args, "Page JavaScript", settings);
    case "get_performance":
      return dom("performance", {}, "Performance snapshot", settings);
    case "get_console":
      return dom("console", {}, "Console errors", settings);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function pageContext(settings: Settings): Promise<ToolExecution> {
  const response = await sendMessage<{
    url: string;
    context?: unknown;
    error?: string;
  }>({ type: "nullsec:page-context" });
  if (!response.ok || !response.data) {
    throw new Error(response.error ?? "Could not read the active page.");
  }
  if (response.data.error) throw new Error(response.data.error);
  let text = JSON.stringify(
    { url: response.data.url, context: response.data.context },
    null,
    2,
  );
  if (settings.redactionEnabled) text = redactText(text).text;
  return {
    label: `Page context: ${safeHost(response.data.url) || "active tab"}`,
    text: truncate(text, 40_000),
  };
}

async function scanFlags(): Promise<ToolExecution> {
  const response = await sendMessage<{ url: string; matches: FlagMatch[] }>({
    type: "nullsec:scan-flags",
  });
  if (!response.ok || !response.data) {
    throw new Error(response.error ?? "Could not scan the active page.");
  }
  const matches = response.data.matches.map((match) => ({
    pattern: match.patternName,
    value: match.value,
    context: truncate(match.context, 500),
  }));
  return {
    label: `Flag scan: ${safeHost(response.data.url) || "active tab"}`,
    text:
      matches.length > 0
        ? JSON.stringify(matches, null, 2)
        : "No flag candidates matched the configured patterns.",
  };
}

async function listRequests(args: Record<string, unknown>): Promise<ToolExecution> {
  const response = await sendMessage<BackgroundState>({ type: "nullsec:get-state" });
  if (!response.ok || !response.data) {
    throw new Error(response.error ?? "Could not read request history.");
  }
  const limit = clampInt(args.limit, 1, 50, 20);
  const host = typeof args.host === "string" ? args.host.trim().toLowerCase() : "";
  const tabId = numberArg(args, "tabId");
  const requests = response.data.requests
    .filter((request) => (host ? safeHost(request.url) === host : true))
    .filter((request) => (tabId === undefined ? true : request.tabId === tabId))
    .slice(0, limit)
    .map(compactRequest);
  return {
    label: `Request history${host ? `: ${host}` : ""}`,
    text:
      requests.length > 0
        ? JSON.stringify(requests, null, 2)
        : "No captured requests matched.",
  };
}

function compactRequest(request: RequestRecord): Record<string, unknown> {
  return {
    time: request.time,
    method: request.method,
    url: truncate(request.url, 1000),
    status: request.status,
    type: request.type,
    source: request.source,
    error: request.error,
  };
}

function decodeText(args: Record<string, unknown>): ToolExecution {
  const text = typeof args.text === "string" ? args.text.trim() : "";
  if (!text) throw new Error("decode_text needs a non-empty text argument.");
  const input = text.slice(0, 4096);
  const results: Array<Record<string, unknown>> = [];
  const attempts = [
    ["base64", () => decodeBase64(input)],
    ["base32", () => decodeBase32(input)],
    ["base58", () => decodeBase58(input)],
    ["hex", () => decodeHex(input)],
    ["url", () => decodeUrl(input)],
    ["html", () => decodeHtmlEntities(input)],
  ] as const;
  for (const [kind, decode] of attempts) {
    const result = decode();
    if (result.ok && result.value && result.value !== input) {
      results.push({ kind, value: truncate(result.value, 4000) });
    }
  }
  const jwt = decodeJwt(input);
  if (jwt.ok) {
    results.push({ kind: "jwt", value: truncate(JSON.stringify(jwt.value, null, 2), 4000) });
  }
  const hashes = identifyHash(input);
  if (hashes.length > 0) results.push({ kind: "hash", value: hashes });
  return {
    label: "Local decoding",
    text:
      results.length > 0
        ? JSON.stringify(results, null, 2)
        : "No supported encoding was detected.",
  };
}

async function browserTabs(): Promise<ToolExecution> {
  const response = await sendMessage<ScopedTab[]>({ type: "nullsec:tabs" });
  if (!response.ok || !response.data) {
    throw new Error(response.error ?? "Could not list tabs.");
  }
  return {
    label: "In-scope tabs",
    text:
      response.data.length > 0
        ? JSON.stringify(response.data, null, 2)
        : "No in-scope tabs are open. Add a scope rule first.",
  };
}

async function browserTab(args: Record<string, unknown>): Promise<ToolExecution> {
  const action = stringArg(args, "action", 20);
  if (!["open", "activate", "close", "navigate", "reload"].includes(action)) {
    throw new Error("browser_tab action must be open, activate, close, navigate, or reload.");
  }
  const response = await sendMessage<ScopedTab>({
    type: "nullsec:tab",
    action: action as "open" | "activate" | "close" | "navigate" | "reload",
    tabId: numberArg(args, "tabId"),
    url: stringArg(args, "url", 2000) || undefined,
  });
  if (!response.ok || !response.data) {
    throw new Error(response.error ?? "Tab action failed.");
  }
  return {
    label: `Tab ${action}: ${safeHost(response.data.url)}`,
    text: JSON.stringify(response.data, null, 2),
  };
}

async function httpRequest(
  args: Record<string, unknown>,
  settings: Settings,
): Promise<ToolExecution> {
  const method = stringArg(args, "method", 20).toUpperCase();
  const url = stringArg(args, "url", 4000);
  if (!/^[A-Z]+$/.test(method)) throw new Error("Invalid HTTP method.");
  if (!url) throw new Error("http_request needs a URL.");
  const headers = headerRecord(args.headers);
  const body = stringArg(args, "body", 2_000_000);
  const response = await sendRepeater({
    method,
    url,
    headers,
    body: body || undefined,
    credentials: "omit",
  });
  if (!response.ok || !response.data) {
    throw new Error(response.error ?? "Request failed.");
  }
  const data = response.data;
  let text = JSON.stringify(
    {
      ok: data.ok,
      status: data.status,
      statusText: data.statusText,
      url: data.url,
      headers: data.headers,
      body: truncate(data.body ?? "", 20_000),
      bodyTruncated: data.bodyTruncated,
      durationMs: data.durationMs,
      error: data.error,
    },
    null,
    2,
  );
  if (settings.redactionEnabled) text = redactText(text).text;
  return {
    label: `HTTP ${data.status ?? "request"}: ${safeHost(url) || "target"}`,
    text: truncate(text, 40_000),
  };
}

async function cookieGet(
  args: Record<string, unknown>,
  settings: Settings,
): Promise<ToolExecution> {
  const response = await sendMessage<CookieSummary[]>({
    type: "nullsec:cookies",
    action: "get",
    url: stringArg(args, "url", 2000) || undefined,
  });
  if (!response.ok || !response.data) {
    throw new Error(response.error ?? "Could not read cookies.");
  }
  return {
    label: `Cookies: ${safeHost(stringArg(args, "url", 2000)) || "active tab"}`,
    text:
      response.data.length > 0
        ? truncate(
            maybeRedact(JSON.stringify(response.data, null, 2), settings),
            40_000,
          )
        : "No cookies for that URL.",
  };
}

async function cookieSet(args: Record<string, unknown>): Promise<ToolExecution> {
  const name = stringArg(args, "name", 256);
  const value = stringArg(args, "value", 4096);
  if (!name) throw new Error("cookie_set needs a name.");
  const cookie: Record<string, unknown> = { name, value };
  const path = stringArg(args, "path", 500);
  if (path) cookie.path = path;
  if (typeof args.secure === "boolean") cookie.secure = args.secure;
  if (typeof args.httpOnly === "boolean") cookie.httpOnly = args.httpOnly;
  const sameSite = stringArg(args, "sameSite", 40);
  if (sameSite) cookie.sameSite = sameSite;
  if (typeof args.expirationDate === "number") cookie.expirationDate = args.expirationDate;
  const response = await sendMessage({
    type: "nullsec:cookies",
    action: "set",
    url: stringArg(args, "url", 2000) || undefined,
    cookie,
  });
  if (!response.ok) throw new Error(response.error ?? "Could not set cookie.");
  return { label: `Cookie set: ${name}`, text: JSON.stringify(response.data) };
}

async function cookieDelete(args: Record<string, unknown>): Promise<ToolExecution> {
  const name = stringArg(args, "name", 256);
  if (!name) throw new Error("cookie_delete needs a name.");
  const response = await sendMessage({
    type: "nullsec:cookies",
    action: "delete",
    url: stringArg(args, "url", 2000) || undefined,
    cookie: { name },
  });
  if (!response.ok) throw new Error(response.error ?? "Could not delete cookie.");
  return { label: `Cookie deleted: ${name}`, text: JSON.stringify(response.data) };
}

async function storageGet(settings: Settings): Promise<ToolExecution> {
  const response = await sendMessage<StorageSnapshot>({
    type: "nullsec:storage",
    action: "get",
  });
  if (!response.ok || !response.data) {
    throw new Error(response.error ?? "Could not read storage.");
  }
  return {
    label: `Storage: ${response.data.origin}`,
    text: truncate(
      maybeRedact(JSON.stringify(response.data, null, 2), settings),
      40_000,
    ),
  };
}

async function storageSet(args: Record<string, unknown>): Promise<ToolExecution> {
  const key = stringArg(args, "key", 500);
  const value = stringArg(args, "value", 65_536);
  if (!key) throw new Error("storage_set needs a key.");
  const area = args.area === "session" ? "session" : "local";
  const response = await sendMessage({
    type: "nullsec:storage",
    action: "set",
    area,
    key,
    value,
  });
  if (!response.ok) throw new Error(response.error ?? "Could not write storage.");
  return { label: `Storage set: ${area}/${key}`, text: JSON.stringify(response.data) };
}

async function storageDelete(args: Record<string, unknown>): Promise<ToolExecution> {
  const key = stringArg(args, "key", 500);
  if (!key) throw new Error("storage_delete needs a key.");
  const area = args.area === "session" ? "session" : "local";
  const response = await sendMessage({
    type: "nullsec:storage",
    action: "delete",
    area,
    key,
  });
  if (!response.ok) throw new Error(response.error ?? "Could not delete storage.");
  return { label: `Storage deleted: ${area}/${key}`, text: JSON.stringify(response.data) };
}

async function storageClear(args: Record<string, unknown>): Promise<ToolExecution> {
  const area = args.area === "session" ? "session" : "local";
  const response = await sendMessage({
    type: "nullsec:storage",
    action: "clear",
    area,
  });
  if (!response.ok) throw new Error(response.error ?? "Could not clear storage.");
  return { label: `Storage cleared: ${area}`, text: JSON.stringify(response.data) };
}

async function dom(
  action:
    | "query"
    | "click"
    | "fill"
    | "submit"
    | "set-attribute"
    | "run-js"
    | "performance"
    | "console",
  args: Record<string, unknown>,
  label: string,
  settings: Settings,
): Promise<ToolExecution> {
  const response: MessageResponse<unknown> = await sendMessage({
    type: "nullsec:dom",
    action,
    args,
  });
  if (!response.ok) throw new Error(response.error ?? "DOM action failed.");
  return {
    label,
    text: truncate(
      maybeRedact(
        typeof response.data === "string"
          ? response.data
          : JSON.stringify(response.data ?? null, null, 2),
        settings,
      ),
      40_000,
    ),
  };
}

function maybeRedact(text: string, settings: Settings): string {
  return settings.redactionEnabled ? redactText(text).text : text;
}

function headerRecord(value: unknown): Record<string, string> | undefined {
  if (!isPlainObject(value)) return undefined;
  const headers: Record<string, string> = {};
  let count = 0;
  for (const [name, headerValue] of Object.entries(value)) {
    if (count >= 50) break;
    if (typeof headerValue !== "string") continue;
    if (!name || /[\r\n]/.test(name) || /[\r\n]/.test(headerValue)) continue;
    headers[name] = headerValue;
    count += 1;
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

function numberArg(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function stringArg(args: Record<string, unknown>, key: string, max: number): string {
  const value = args[key];
  return typeof value === "string" ? value.slice(0, max) : "";
}

function safeHost(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
}