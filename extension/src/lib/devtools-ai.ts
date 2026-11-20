import browser from "webextension-polyfill";
import type { AiTool } from "./ai";
import type { RequestRecord, Settings, Workspace } from "./types";
import { listRequests } from "./db";
import { isInScope } from "./scope";
import { sendMessage } from "./messaging";
import { redactText } from "./redact";
import { isPlainObject, truncate } from "./util";

export interface DevtoolsContext {
  tabId: number;
  url: string;
  workspace: Workspace;
  settings: Settings;
}

const DEVTOOLS_READ_TOOLS: AiTool[] = [
  {
    name: "devtools_requests",
    description:
      "List recent captured requests for the inspected tab. Metadata only: method, URL, status, type, duration, and error.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
  },
];

const DEVTOOLS_ACTIVE_TOOLS: AiTool[] = [
  {
    name: "devtools_dom_query",
    description:
      "Query the inspected page DOM with a CSS selector. Returns tag names, text, links, and optional HTML or form values.",
    parameters: {
      type: "object",
      properties: {
        selector: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        includeHtml: { type: "boolean" },
        includeValues: { type: "boolean" },
      },
      required: ["selector"],
      additionalProperties: false,
    },
  },
  {
    name: "devtools_performance",
    description:
      "Read navigation timing, resource entries, DOM counts, and JS heap information from the inspected page.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
];

const DEVTOOLS_SENSITIVE_TOOLS: AiTool[] = [
  {
    name: "devtools_eval",
    description:
      "Evaluate JavaScript in the inspected page's main world. Powerful: use for DOM, application state, fetch, or measurements. Results are truncated.",
    parameters: {
      type: "object",
      properties: {
        expression: { type: "string", description: "JavaScript expression or IIFE." },
      },
      required: ["expression"],
      additionalProperties: false,
    },
  },
  {
    name: "devtools_har",
    description:
      "Read the inspected tab's HAR entries from DevTools, including request/response headers. Values are redacted by default.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100 },
        filter: { type: "string", description: "Optional case-insensitive URL substring." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "devtools_cookies",
    description:
      "Read cookies for the inspected URL, including HttpOnly cookies. Values are redacted by default.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "devtools_storage",
    description:
      "Read localStorage and sessionStorage for the inspected page. Values are redacted by default.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
];

export const DEVTOOLS_ACTIVE_NAMES = new Set(
  DEVTOOLS_ACTIVE_TOOLS.map((tool) => tool.name),
);
export const DEVTOOLS_SENSITIVE_NAMES = new Set(
  DEVTOOLS_SENSITIVE_TOOLS.map((tool) => tool.name),
);

export function toolsForDevtools(settings: Settings): AiTool[] {
  if (!settings.enableActiveTools) return DEVTOOLS_READ_TOOLS;
  return settings.enableSensitiveTools
    ? [
        ...DEVTOOLS_READ_TOOLS,
        ...DEVTOOLS_ACTIVE_TOOLS,
        ...DEVTOOLS_SENSITIVE_TOOLS,
      ]
    : [...DEVTOOLS_READ_TOOLS, ...DEVTOOLS_ACTIVE_TOOLS];
}

export interface DevtoolsToolResult {
  label: string;
  text: string;
}

export async function executeDevtoolsTool(
  name: string,
  args: Record<string, unknown>,
  context: DevtoolsContext,
): Promise<DevtoolsToolResult> {
  if (DEVTOOLS_ACTIVE_NAMES.has(name) && !context.settings.enableActiveTools) {
    throw new Error("Active browser tools are disabled in Agent control settings.");
  }
  if (DEVTOOLS_SENSITIVE_NAMES.has(name) && !context.settings.enableSensitiveTools) {
    throw new Error("DevTools sensitive tools are disabled in Agent control settings.");
  }
  switch (name) {
    case "devtools_requests":
      return devtoolsRequests(args, context);
    case "devtools_dom_query":
      return devtoolsDomQuery(args, context);
    case "devtools_performance":
      return devtoolsPerformance(context);
    case "devtools_eval":
      return devtoolsEval(args, context);
    case "devtools_har":
      return devtoolsHar(args, context);
    case "devtools_cookies":
      return devtoolsCookies(context);
    case "devtools_storage":
      return devtoolsStorage(context);
    default:
      throw new Error(`Unknown DevTools tool: ${name}`);
  }
}

function assertScope(context: DevtoolsContext): void {
  if (!context.url || !isInScope(context.url, context.workspace.scope)) {
    throw new Error(
      "Blocked: the inspected tab is not in the active workspace scope.",
    );
  }
}

async function devtoolsRequests(
  args: Record<string, unknown>,
  context: DevtoolsContext,
): Promise<DevtoolsToolResult> {
  const limit = clampInt(args.limit, 1, 100, 30);
  const records = (await listRequests(context.workspace.id, 500))
    .filter((request) => request.tabId === context.tabId)
    .slice(0, limit)
    .map(compactRequest);
  return {
    label: `Requests: tab ${context.tabId}`,
    text:
      records.length > 0
        ? JSON.stringify(records, null, 2)
        : "No captured requests for this tab.",
  };
}

async function devtoolsDomQuery(
  args: Record<string, unknown>,
  context: DevtoolsContext,
): Promise<DevtoolsToolResult> {
  assertScope(context);
  const selector = stringArg(args, "selector", 500);
  if (!selector) throw new Error("A CSS selector is required.");
  const limit = clampInt(args.limit, 1, 100, 20);
  const expression = `(() => {
    const nodes = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).slice(0, ${limit});
    return {
      count: document.querySelectorAll(${JSON.stringify(selector)}).length,
      items: nodes.map((element) => {
        const item = {
          tag: element.tagName.toLowerCase(),
          id: element.id || undefined,
          text: (element.textContent || "").trim().slice(0, 1000),
        };
        if (element instanceof HTMLAnchorElement) item.href = element.href;
        if (${args.includeValues === true} && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) item.value = element.value.slice(0, 2000);
        if (${args.includeHtml === true}) item.html = element.outerHTML.slice(0, 4000);
        return item;
      }),
    };
  })()`;
  const result = await evalInPage(expression);
  return {
    label: `DevTools DOM: ${selector}`,
    text: serialize(result, context.settings),
  };
}

async function devtoolsPerformance(
  context: DevtoolsContext,
): Promise<DevtoolsToolResult> {
  assertScope(context);
  const expression = `(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    return {
      url: location.href,
      title: document.title,
      navigation: navigation ? {
        type: navigation.type,
        domContentLoaded: Math.round(navigation.domContentLoadedEventEnd),
        load: Math.round(navigation.loadEventEnd),
      } : undefined,
      dom: {
        elements: document.querySelectorAll("*").length,
        scripts: document.scripts.length,
        forms: document.forms.length,
        iframes: document.querySelectorAll("iframe").length,
      },
      resources: performance.getEntriesByType("resource").slice(-100).map((entry) => ({
        name: entry.name,
        type: entry.initiatorType,
        duration: Math.round(entry.duration),
        transferSize: entry.transferSize,
      })),
    };
  })()`;
  const result = await evalInPage(expression);
  return {
    label: `Performance: ${safeHost(context.url) || "inspected tab"}`,
    text: serialize(result, context.settings),
  };
}

async function devtoolsEval(
  args: Record<string, unknown>,
  context: DevtoolsContext,
): Promise<DevtoolsToolResult> {
  assertScope(context);
  const expression = stringArg(args, "expression", 20_000);
  if (!expression) throw new Error("An expression is required.");
  const result = await evalInPage(expression);
  return {
    label: `Eval: ${safeHost(context.url) || "inspected tab"}`,
    text: serialize(result, context.settings),
  };
}

async function devtoolsHar(
  args: Record<string, unknown>,
  context: DevtoolsContext,
): Promise<DevtoolsToolResult> {
  assertScope(context);
  const limit = clampInt(args.limit, 1, 100, 30);
  const filter = stringArg(args, "filter", 300).toLowerCase();
  const har = (await browser.devtools.network.getHAR()) as unknown;
  const entries = isPlainObject(har) && Array.isArray(har.entries) ? har.entries : [];
  const filtered = entries
    .filter((entry): entry is Record<string, unknown> => isPlainObject(entry))
    .filter((entry) => {
      if (!filter) return true;
      const request = isPlainObject(entry.request) ? entry.request : undefined;
      return typeof request?.url === "string" && request.url.toLowerCase().includes(filter);
    })
    .slice(-limit)
    .map(compactHarEntry);
  return {
    label: `HAR: ${safeHost(context.url) || "inspected tab"}`,
    text:
      filtered.length > 0
        ? serialize(filtered, context.settings)
        : "No HAR entries matched.",
  };
}

async function devtoolsCookies(
  context: DevtoolsContext,
): Promise<DevtoolsToolResult> {
  assertScope(context);
  const response = await sendMessage({
    type: "nullsec:cookies",
    action: "get",
    url: context.url,
  });
  if (!response.ok || !response.data) {
    throw new Error(response.error ?? "Could not read cookies.");
  }
  return {
    label: `Cookies: ${safeHost(context.url) || "inspected tab"}`,
    text: serialize(response.data, context.settings),
  };
}

async function devtoolsStorage(
  context: DevtoolsContext,
): Promise<DevtoolsToolResult> {
  assertScope(context);
  const expression = `(() => {
    const read = (store) => {
      const entries = {};
      for (let index = 0; index < store.length && index < 200; index += 1) {
        const key = store.key(index);
        if (key !== null) entries[key] = String(store.getItem(key) || "").slice(0, 4000);
      }
      return entries;
    };
    return { origin: location.origin, local: read(localStorage), session: read(sessionStorage) };
  })()`;
  const result = await evalInPage(expression);
  return {
    label: `Storage: ${safeHost(context.url) || "inspected tab"}`,
    text: serialize(result, context.settings),
  };
}

async function evalInPage(expression: string): Promise<unknown> {
  const evaluated = (await browser.devtools.inspectedWindow.eval(expression, {
    awaitPromise: true,
  })) as unknown as [unknown, { isException?: boolean; value?: string; description?: string }?];
  const [result, exception] = evaluated;
  if (exception?.isException) {
    throw new Error(exception.description ?? exception.value ?? "Evaluation failed.");
  }
  return result;
}

function serialize(value: unknown, settings: Settings): string {
  let text: string;
  if (typeof value === "string") text = value;
  else {
    try {
      text = JSON.stringify(value, null, 2);
    } catch {
      text = String(value);
    }
  }
  if (settings.redactionEnabled) text = redactText(text).text;
  return truncate(text, 40_000);
}

function compactRequest(request: RequestRecord): Record<string, unknown> {
  return {
    time: request.time,
    method: request.method,
    url: truncate(request.url, 1000),
    status: request.status,
    type: request.type,
    durationMs: request.durationMs,
    error: request.error,
  };
}

function compactHarEntry(entry: Record<string, unknown>): Record<string, unknown> {
  const request = isPlainObject(entry.request) ? entry.request : {};
  const response = isPlainObject(entry.response) ? entry.response : {};
  const content = isPlainObject(response.content) ? response.content : {};
  return {
    startedDateTime: entry.startedDateTime,
    time: entry.time,
    request: {
      method: request.method,
      url: request.url,
      headers: request.headers,
    },
    response: {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      content: {
        mimeType: content.mimeType,
        size: content.size,
      },
    },
  };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
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