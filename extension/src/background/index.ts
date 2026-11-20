import browser from "webextension-polyfill";
import type {
  CookieSummary,
  FlagMatch,
  RepeaterRequest,
  RepeaterResponse,
  RequestRecord,
  ScopedTab,
  Settings,
  StorageSnapshot,
  Workspace,
} from "../lib/types";
import { addRequest, clearRequests, listChallenges, listRequests } from "../lib/db";
import { DEFAULT_FLAG_PATTERNS } from "../lib/flag";
import { sendNative } from "../lib/bridge";
import { isInScope, createScopeRule } from "../lib/scope";
import {
  loadSettings,
  loadWorkspace,
  openDock,
  openSidebar,
  saveWorkspace,
  setPendingPayload,
} from "../lib/storage";
import { providerRegistry } from "../lib/providers";
import { nowIso, truncate, uid } from "../lib/util";

const providerHosts = new Set(
  providerRegistry.providers
    .map((provider) => {
      try {
        return new URL(provider.baseUrl).host;
      } catch {
        return "";
      }
    })
    .filter(Boolean),
);

let currentWorkspaceId = "default";

void loadWorkspace().then((workspace) => {
  currentWorkspaceId = workspace.id;
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes["nullsec.workspace"]) return;
  void loadWorkspace().then((workspace) => {
    currentWorkspaceId = workspace.id;
  });
});

interface TrackedRequest {
  started: number;
  method: string;
  url: string;
  type?: string;
  tabId?: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
}

const tracked = new Map<string, TrackedRequest>();

function isTrackable(urlValue: string): boolean {
  try {
    const url = new URL(urlValue);
    if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)) return false;
    if (providerHosts.has(url.host)) return false;
    return true;
  } catch {
    return false;
  }
}

function headersToObject(
  headers: Array<{ name?: string; value?: string }> | undefined,
): Record<string, string> | undefined {
  if (!headers) return undefined;
  const result: Record<string, string> = {};
  for (const header of headers) {
    if (!header.name || header.value === undefined) continue;
    const name = header.name;
    const value = truncate(header.value, 2000);
    result[name] = result[name] ? `${result[name]}, ${value}` : value;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!isTrackable(details.url)) return;
    tracked.set(details.requestId, {
      started: details.timeStamp,
      method: details.method,
      url: details.url,
      type: details.type,
      tabId: details.tabId >= 0 ? details.tabId : undefined,
    });
  },
  { urls: ["<all_urls>"] },
);

browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const existing = tracked.get(details.requestId);
    if (!existing) return;
    existing.requestHeaders = headersToObject(details.requestHeaders);
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders"],
);

browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    const existing = tracked.get(details.requestId);
    if (!existing) return;
    existing.responseHeaders = headersToObject(details.responseHeaders);
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"],
);

browser.webRequest.onCompleted.addListener(
  (details) => {
    const existing = tracked.get(details.requestId);
    if (!existing) return;
    tracked.delete(details.requestId);
    const record: RequestRecord = {
      id: uid("req"),
      workspaceId: currentWorkspaceId,
      time: new Date(details.timeStamp).toISOString(),
      method: existing.method,
      url: details.url,
      status: details.statusCode,
      type: existing.type,
      tabId: existing.tabId,
      source: "web",
      requestHeaders: existing.requestHeaders,
      responseHeaders: existing.responseHeaders,
      bodySize: details.responseSize,
      durationMs: Math.max(0, details.timeStamp - existing.started),
    };
    void persistAndBroadcast(record);
  },
  { urls: ["<all_urls>"] },
);

browser.webRequest.onErrorOccurred.addListener(
  (details) => {
    const existing = tracked.get(details.requestId);
    if (!existing) return;
    tracked.delete(details.requestId);
    const record: RequestRecord = {
      id: uid("req"),
      workspaceId: currentWorkspaceId,
      time: new Date(details.timeStamp).toISOString(),
      method: existing.method,
      url: details.url,
      type: existing.type,
      tabId: existing.tabId,
      source: "web",
      requestHeaders: existing.requestHeaders,
      responseHeaders: existing.responseHeaders,
      durationMs: Math.max(0, details.timeStamp - existing.started),
      error: details.error,
    };
    void persistAndBroadcast(record);
  },
  { urls: ["<all_urls>"] },
);

async function persistAndBroadcast(record: RequestRecord): Promise<void> {
  try {
    await addRequest(record);
  } catch (error) {
    console.warn("NullSec: failed to persist request", error);
  }
  try {
    await browser.runtime.sendMessage({ type: "nullsec:request", request: record });
  } catch {
    // No dock/sidebar is listening; the request is still persisted.
  }
}

async function ensureMenus(): Promise<void> {
  try {
    await browser.menus.removeAll();
  } catch {
    // removeAll is unavailable on some older builds; duplicates are handled below.
  }
  const items: Array<{ id: string; title: string; contexts: browser.Menus.ContextType[] }> = [
    {
      id: "nullsec-analyze-selection",
      title: "Analyze selection in NullSec",
      contexts: ["selection"],
    },
    {
      id: "nullsec-note-selection",
      title: "Add selection to NullSec notes",
      contexts: ["selection"],
    },
    {
      id: "nullsec-add-scope",
      title: "Add current site to NullSec scope",
      contexts: ["page"],
    },
    {
      id: "nullsec-open-dock",
      title: "Open NullSec request dock",
      contexts: ["page"],
    },
  ];
  for (const item of items) {
    try {
      await browser.menus.create(item);
    } catch (error) {
      console.warn(`NullSec: failed to create menu ${item.id}`, error);
    }
  }
}

browser.runtime.onInstalled.addListener(() => {
  void ensureMenus();
  void browser.tabs.create({ url: browser.runtime.getURL("sidebar.html") });
});

browser.runtime.onStartup.addListener(() => {
  void ensureMenus();
});

browser.menus.onClicked.addListener((info, tab) => {
  const selection = info.selectionText?.trim() ?? "";
  switch (info.menuItemId) {
    case "nullsec-analyze-selection":
      if (!selection) return;
      void setPendingPayload({ kind: "selection", text: selection, at: nowIso() }).then(
        openSidebar,
      );
      break;
    case "nullsec-note-selection":
      if (!selection) return;
      void setPendingPayload({ kind: "note", text: selection, at: nowIso() }).then(
        openSidebar,
      );
      break;
    case "nullsec-add-scope": {
      const urlValue = info.pageUrl ?? tab?.url;
      if (!urlValue) return;
      try {
        const host = new URL(urlValue).host;
        void addScopeFromMenu(host);
      } catch {
        // Ignore non-http pages.
      }
      break;
    }
    case "nullsec-open-dock":
      void openDock();
      break;
  }
});

async function addScopeFromMenu(host: string): Promise<void> {
  const workspace = await loadWorkspace();
  if (workspace.scope.some((rule) => rule.value === host)) {
    await setPendingPayload({ kind: "scope", text: host, at: nowIso() });
    await openSidebar();
    return;
  }
  try {
    workspace.scope.push(createScopeRule(host));
    await saveWorkspace(workspace);
    await setPendingPayload({ kind: "scope", text: host, at: nowIso() });
  } catch (error) {
    console.warn("NullSec: failed to add scope", error);
  }
  await openSidebar();
}

browser.action.onClicked.addListener(() => {
  void openSidebar();
});

browser.commands.onCommand.addListener((command) => {
  if (command === "open-dock") void openDock();
});

browser.runtime.onMessage.addListener((message: unknown) => {
  if (typeof message !== "object" || message === null) return undefined;
  const type = (message as { type?: unknown }).type;
  if (typeof type !== "string" || !type.startsWith("nullsec:")) return undefined;
  return handleMessage(message as { type: string; [key: string]: unknown }).catch(
    (error: unknown) => ({
      ok: false,
      error: error instanceof Error ? error.message : "NullSec background error",
    }),
  );
});

async function handleMessage(message: {
  type: string;
  [key: string]: unknown;
}): Promise<unknown> {
  switch (message.type) {
    case "nullsec:ping":
      return { ok: true, data: { version: "0.1.0" } };
    case "nullsec:get-state": {
      const workspace = await loadWorkspace();
      const settings = await loadSettings();
      const challenges = await listChallenges(workspace.id);
      const requests = await listRequests(workspace.id);
      return { ok: true, data: { workspace, settings, challenges, requests } };
    }
    case "nullsec:repeater":
      return {
        ok: true,
        data: await performRepeater(message.request as RepeaterRequest),
      };
    case "nullsec:scan-flags":
      return {
        ok: true,
        data: await scanActiveTab(
          message as { patterns?: { name: string; pattern: string }[] },
        ),
      };
    case "nullsec:page-context":
      return { ok: true, data: await readActivePage() };
    case "nullsec:open-dock":
      await openDock();
      return { ok: true };
    case "nullsec:clear-requests": {
      const workspace = await loadWorkspace();
      await clearRequests(workspace.id);
      return { ok: true };
    }
    case "nullsec:bridge-ping": {
      const response = await sendNative<{ version: string }>("ping");
      return { ok: response.ok, data: response.data, error: response.error };
    }
    case "nullsec:tabs":
      return { ok: true, data: await scopedTabs() };
    case "nullsec:tab":
      return { ok: true, data: await controlTab(message) };
    case "nullsec:cookies":
      return { ok: true, data: await cookieAction(message) };
    case "nullsec:storage":
      return { ok: true, data: await storageAction(message) };
    case "nullsec:dom":
      return { ok: true, data: await domAction(message) };
    default:
      return { ok: false, error: `Unknown NullSec message: ${message.type}` };
  }
}

const FORBIDDEN_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "upgrade",
  "transfer-encoding",
  "keep-alive",
  "proxy-connection",
]);

function sanitizeHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  if (!headers) return {};
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!name || FORBIDDEN_HEADERS.has(name.toLowerCase())) continue;
    if (/[\r\n]/.test(name) || /[\r\n]/.test(value)) continue;
    result[name] = value;
  }
  return result;
}

const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_REDIRECTS = 5;
const rateWindows = new Map<string, number[]>();

function consumeRateLimit(workspace: Workspace): boolean {
  const limit = Math.max(1, workspace.rateLimitPerMinute);
  const now = Date.now();
  const window = (rateWindows.get(workspace.id) ?? []).filter(
    (timestamp) => now - timestamp < 60_000,
  );
  if (window.length >= limit) {
    rateWindows.set(workspace.id, window);
    return false;
  }
  window.push(now);
  rateWindows.set(workspace.id, window);
  return true;
}

async function performRepeater(request: RepeaterRequest): Promise<RepeaterResponse> {
  const workspace = await loadWorkspace();
  if (workspace.mode === "personal") {
    return { ok: false, error: "Active tools are disabled in Personal workspaces." };
  }
  if (!/^[A-Za-z]+$/.test(request.method)) {
    return { ok: false, error: "Invalid HTTP method." };
  }
  let target: URL;
  try {
    target = new URL(request.url);
  } catch {
    return { ok: false, error: "Invalid request URL." };
  }
  if (!["http:", "https:"].includes(target.protocol)) {
    return { ok: false, error: "Only http:// and https:// requests are supported." };
  }
  if (!isInScope(request.url, workspace.scope)) {
    return {
      ok: false,
      error: `Blocked: ${target.host} is not in the active workspace scope.`,
    };
  }
  if (request.body && request.body.length > 2_000_000) {
    return { ok: false, error: "Request body is too large (limit 2 MB)." };
  }
  if (!consumeRateLimit(workspace)) {
    return {
      ok: false,
      error: `Rate limit reached (${workspace.rateLimitPerMinute}/min for this workspace).`,
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  const started = performance.now();
  let currentUrl = request.url;
  let currentMethod = request.method.toUpperCase();
  let currentBody =
    currentMethod === "GET" || currentMethod === "HEAD" ? undefined : request.body;
  let currentHeaders = sanitizeHeaders(request.headers);
  try {
    let response: Response | undefined;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      response = await fetch(currentUrl, {
        method: currentMethod,
        headers: currentHeaders,
        body: currentBody,
        credentials: request.credentials ?? "omit",
        redirect: "manual",
        signal: controller.signal,
      });
      const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
      if (!isRedirect) break;
      const location = response.headers.get("location");
      if (!location) {
        return { ok: false, error: "Redirect response did not include a Location header." };
      }
      let nextUrl: URL;
      try {
        nextUrl = new URL(location, currentUrl);
      } catch {
        return { ok: false, error: "Redirect target is not a valid URL." };
      }
      if (!["http:", "https:"].includes(nextUrl.protocol)) {
        return { ok: false, error: "Redirect target uses an unsupported scheme." };
      }
      if (!isInScope(nextUrl.toString(), workspace.scope)) {
        return {
          ok: false,
          error: `Blocked: redirect target ${nextUrl.host} is not in the active workspace scope.`,
        };
      }
      if (redirects === MAX_REDIRECTS) {
        return { ok: false, error: "Too many redirects." };
      }
      const previousOrigin = new URL(currentUrl).origin;
      if (nextUrl.origin !== previousOrigin) {
        currentHeaders = Object.fromEntries(
          Object.entries(currentHeaders).filter(([name]) => {
            const lower = name.toLowerCase();
            return (
              lower !== "authorization" &&
              lower !== "proxy-authorization" &&
              lower !== "cookie" &&
              lower !== "x-api-key" &&
              lower !== "x-goog-api-key"
            );
          }),
        );
      }
      if (
        response.status === 303 ||
        ((response.status === 301 || response.status === 302) &&
          currentMethod === "POST")
      ) {
        currentMethod = "GET";
        currentBody = undefined;
      }
      currentUrl = nextUrl.toString();
    }
    if (!response) return { ok: false, error: "Request failed." };
    if (response.type === "opaqueredirect") {
      return {
        ok: false,
        error:
          "The browser hid the redirect. Send the redirect target explicitly so scope can be checked.",
      };
    }
    const { text, truncated: bodyTruncated } = await readLimited(response);
    const durationMs = Math.round(performance.now() - started);
    const headers = Object.fromEntries(response.headers.entries());
    const bodySize = new TextEncoder().encode(text).byteLength;
    const record: RequestRecord = {
      id: uid("req"),
      workspaceId: workspace.id,
      time: nowIso(),
      method: currentMethod,
      url: response.url || currentUrl,
      status: response.status,
      source: "repeater",
      requestHeaders: currentHeaders,
      responseHeaders: headers,
      bodySize,
      durationMs,
    };
    void persistAndBroadcast(record);
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      url: response.url || currentUrl,
      headers,
      body: text,
      bodyTruncated,
      durationMs,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof DOMException && error.name === "AbortError"
          ? "Request timed out after 30 seconds."
          : error instanceof Error
            ? error.message
            : "Request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function readLimited(
  response: Response,
): Promise<{ text: string; truncated: boolean }> {
  if (!response.body) return { text: "", truncated: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        const remaining = Math.max(0, MAX_RESPONSE_BYTES - (total - value.byteLength));
        chunks.push(value.slice(0, remaining));
        truncated = true;
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder("utf-8", { fatal: false }).decode(bytes), truncated };
}

async function activeTab(): Promise<browser.Tabs.Tab | undefined> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function activeCtfWorkspace(): Promise<Workspace> {
  const workspace = await loadWorkspace();
  if (workspace.mode === "personal") {
    throw new Error("Browser and data tools are disabled in Personal workspaces.");
  }
  return workspace;
}

function requireScope(urlValue: string | undefined, workspace: Workspace): URL {
  if (!urlValue) throw new Error("A URL is required.");
  let target: URL;
  try {
    target = new URL(urlValue);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("Only http:// and https:// targets are supported.");
  }
  if (!isInScope(target.toString(), workspace.scope)) {
    throw new Error(`Blocked: ${target.host} is not in the active workspace scope.`);
  }
  return target;
}

function toScopedTab(tab: browser.Tabs.Tab): ScopedTab {
  if (tab.id === undefined || tab.windowId === undefined || !tab.url) {
    throw new Error("That tab cannot be controlled.");
  }
  return {
    id: tab.id,
    windowId: tab.windowId,
    title: truncate(tab.title ?? "", 300),
    url: truncate(tab.url, 2000),
    active: tab.active,
  };
}

async function scopedTabs(): Promise<ScopedTab[]> {
  const workspace = await activeCtfWorkspace();
  const tabs = await browser.tabs.query({});
  return tabs
    .filter((tab) => {
      return (
        tab.id !== undefined &&
        typeof tab.url === "string" &&
        /^https?:/.test(tab.url) &&
        isInScope(tab.url, workspace.scope)
      );
    })
    .slice(0, 80)
    .map(toScopedTab);
}

async function controlTab(message: Record<string, unknown>): Promise<ScopedTab> {
  const workspace = await activeCtfWorkspace();
  const action = message.action;
  const targetUrl = typeof message.url === "string" ? message.url : undefined;
  if (action === "open") {
    const target = requireScope(targetUrl, workspace);
    const tab = await browser.tabs.create({ url: target.toString(), active: true });
    return toScopedTab(tab);
  }
  const tabId =
    typeof message.tabId === "number"
      ? message.tabId
      : (await activeTab())?.id;
  if (tabId === undefined) throw new Error("No tab selected.");
  const tab = await browser.tabs.get(tabId);
  if (!tab.url || !isInScope(tab.url, workspace.scope)) {
    throw new Error("Blocked: that tab is not in the active workspace scope.");
  }
  if (action === "activate") {
    const summary = toScopedTab(tab);
    await browser.windows.update(summary.windowId, { focused: true });
    return toScopedTab(await browser.tabs.update(tabId, { active: true }));
  }
  if (action === "close") {
    const summary = toScopedTab(tab);
    await browser.tabs.remove(tabId);
    return summary;
  }
  if (action === "reload") {
    const summary = toScopedTab(tab);
    await browser.tabs.reload(tabId);
    return summary;
  }
  if (action === "navigate") {
    const target = requireScope(targetUrl, workspace);
    return toScopedTab(await browser.tabs.update(tabId, { url: target.toString() }));
  }
  throw new Error("Unsupported tab action.");
}

function summarizeCookie(cookie: browser.Cookies.Cookie): CookieSummary {
  return {
    name: cookie.name,
    value: truncate(cookie.value, 4096),
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    expirationDate: cookie.expirationDate,
  };
}

async function cookieAction(
  message: Record<string, unknown>,
): Promise<CookieSummary[] | { ok: boolean; name?: string }> {
  const workspace = await activeCtfWorkspace();
  const tab = await activeTab();
  const target = requireScope(
    typeof message.url === "string" ? message.url : tab?.url,
    workspace,
  );
  const action = message.action;
  if (action === undefined || action === "get") {
    const cookies = await browser.cookies.getAll({ url: target.toString() });
    return cookies.slice(0, 200).map(summarizeCookie);
  }
  const input = isPlainRecord(message.cookie) ? message.cookie : {};
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 256) throw new Error("Cookie name is required.");
  if (action === "delete") {
    await browser.cookies.remove({ url: target.toString(), name });
    return { ok: true, name };
  }
  if (action === "set") {
    const value = typeof input.value === "string" ? input.value : "";
    if (value.length > 4096) throw new Error("Cookie value is too large.");
    const details: Parameters<typeof browser.cookies.set>[0] = {
      url: target.toString(),
      name,
      value,
      path: typeof input.path === "string" ? input.path : "/",
    };
    if (typeof input.secure === "boolean") details.secure = input.secure;
    if (typeof input.httpOnly === "boolean") details.httpOnly = input.httpOnly;
    if (
      input.sameSite === "no_restriction" ||
      input.sameSite === "lax" ||
      input.sameSite === "strict" ||
      input.sameSite === "unspecified"
    ) {
      details.sameSite = input.sameSite;
    }
    if (
      typeof input.expirationDate === "number" &&
      Number.isFinite(input.expirationDate)
    ) {
      details.expirationDate = input.expirationDate;
    }
    await browser.cookies.set(details);
    return { ok: true, name };
  }
  throw new Error("Unsupported cookie action.");
}

async function storageAction(
  message: Record<string, unknown>,
): Promise<StorageSnapshot | { ok: boolean; action?: string; key?: string }> {
  const workspace = await activeCtfWorkspace();
  const tab = await activeTab();
  if (!tab?.id || !tab.url) throw new Error("No active tab.");
  const target = requireScope(tab.url, workspace);
  const action = message.action;
  const area = message.area === "session" ? "session" : "local";
  const key = typeof message.key === "string" ? message.key : "";
  const value = typeof message.value === "string" ? message.value : "";
  if (action === "get" || action === undefined) {
    const result = await sendToTab<{
      local: StorageSnapshot["local"];
      session: StorageSnapshot["session"];
      errors?: string[];
    }>(tab.id, { type: "nullsec:content-storage", action: "get" });
    if (!result) throw new Error("The page did not return storage.");
    return {
      url: tab.url,
      origin: target.origin,
      local: result.local,
      session: result.session,
      errors: result.errors,
    };
  }
  if (action === "set") {
    if (!key || key.length > 500) throw new Error("Storage key is required.");
    if (value.length > 65_536) throw new Error("Storage value is too large.");
  }
  if (action === "delete" && !key) throw new Error("Storage key is required.");
  if (action !== "set" && action !== "delete" && action !== "clear") {
    throw new Error("Unsupported storage action.");
  }
  const result = await sendToTab<{ ok: boolean; error?: string }>(tab.id, {
    type: "nullsec:content-storage",
    action: action as "set" | "delete" | "clear",
    area,
    key,
    value,
  });
  if (!result) throw new Error("The page did not return a storage result.");
  if (!result.ok) throw new Error(result.error ?? "Storage operation failed.");
  return { ok: true, action: String(action), key: key || undefined };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function domAction(message: Record<string, unknown>): Promise<unknown> {
  const workspace = await activeCtfWorkspace();
  const tab = await activeTab();
  if (!tab?.id || !tab.url) throw new Error("No active tab.");
  requireScope(tab.url, workspace);
  const action = typeof message.action === "string" ? message.action : "";
  if (
    ![
      "query",
      "click",
      "fill",
      "submit",
      "set-attribute",
      "run-js",
      "performance",
      "console",
    ].includes(action)
  ) {
    throw new Error("Unsupported DOM action.");
  }
  const args = isPlainRecord(message.args) ? message.args : {};
  const result = await sendToTab<{ ok: boolean; error?: string; data?: unknown }>(
    tab.id,
    { type: "nullsec:content-dom", action, args },
  );
  if (!result) throw new Error("The page did not return a DOM result.");
  if (!result.ok) throw new Error(result.error ?? "DOM operation failed.");
  return result.data;
}

async function sendToTab<T>(
  tabId: number,
  message: unknown,
  retry = true,
): Promise<T | undefined> {
  try {
    return (await browser.tabs.sendMessage(tabId, message)) as T;
  } catch (error) {
    if (!retry) throw error;
    await browser.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    return (await browser.tabs.sendMessage(tabId, message)) as T;
  }
}

async function scanActiveTab(message: {
  patterns?: { name: string; pattern: string }[];
}): Promise<{ url: string; matches: FlagMatch[] }> {
  const tab = await activeTab();
  if (!tab?.id || !tab.url) return { url: "", matches: [] };
  if (!/^https?:/.test(tab.url)) return { url: tab.url, matches: [] };
  const settings: Settings = await loadSettings();
  const patterns =
    message.patterns?.map((pattern) => ({ ...pattern, enabled: true })) ??
    settings.flagPatterns ??
    DEFAULT_FLAG_PATTERNS;
  const result = await sendToTab<{ matches: FlagMatch[] }>(tab.id, {
    type: "nullsec:scan-flags",
    patterns,
  });
  if (result) return { url: tab.url, matches: result.matches };
  return { url: tab.url, matches: [] };
}

async function readActivePage(): Promise<{
  url: string;
  context?: unknown;
  error?: string;
}> {
  const tab = await activeTab();
  if (!tab?.id || !tab.url) return { url: "", error: "No active tab." };
  if (!/^https?:/.test(tab.url)) {
    return { url: tab.url, error: "Passive page reading is only available on http(s) pages." };
  }
  const result = await sendToTab<{ context: unknown }>(tab.id, {
    type: "nullsec:page-context",
  });
  return { url: tab.url, context: result?.context };
}

export type { Workspace };