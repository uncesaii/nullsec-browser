import browser from "webextension-polyfill";
import { compileFlagPatterns, type CompiledFlagPattern } from "../lib/flag";
import type { FlagMatch, FlagPattern } from "../lib/types";
import { truncate } from "../lib/util";

declare global {
  interface Window {
    __nullsecContentLoaded?: boolean;
  }
}

interface ConsoleEvent {
  at: string;
  type: string;
  message: string;
  source?: string;
  line?: number;
}

const consoleEvents: ConsoleEvent[] = [];

function pushConsole(event: ConsoleEvent): void {
  consoleEvents.push(event);
  if (consoleEvents.length > 100) consoleEvents.shift();
}

window.addEventListener("error", (event) => {
  pushConsole({
    at: new Date().toISOString(),
    type: "error",
    message: truncate(event.message || "Script error", 2000),
    source: event.filename || undefined,
    line: event.lineno || undefined,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  let message: string;
  try {
    message =
      event.reason instanceof Error
        ? event.reason.message
        : typeof event.reason === "string"
          ? event.reason
          : JSON.stringify(event.reason);
  } catch {
    message = String(event.reason);
  }
  pushConsole({
    at: new Date().toISOString(),
    type: "unhandledrejection",
    message: truncate(message, 2000),
  });
});

if (!window.__nullsecContentLoaded) {
  window.__nullsecContentLoaded = true;
  install();
}

function install(): void {
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (typeof message !== "object" || message === null) return undefined;
    const type = (message as { type?: unknown }).type;
    if (type === "nullsec:scan-flags") {
      return Promise.resolve({
        matches: scanFlags((message as { patterns?: FlagPattern[] }).patterns ?? []),
      });
    }
    if (type === "nullsec:page-context") {
      return Promise.resolve({ context: pageContext() });
    }
    if (type === "nullsec:content-storage") {
      return Promise.resolve(handleStorage(message as StorageMessage));
    }
    if (type === "nullsec:content-dom") {
      return handleDom(message as DomMessage);
    }
    return undefined;
  });
}

interface StorageMessage {
  action?: "get" | "set" | "delete" | "clear";
  area?: "local" | "session";
  key?: string;
  value?: string;
}

interface DomMessage {
  action?: string;
  args?: Record<string, unknown>;
}

function handleStorage(message: StorageMessage): Record<string, unknown> {
  const area = message.area === "session" ? "session" : "local";
  try {
    const store = area === "session" ? window.sessionStorage : window.localStorage;
    if (message.action === "get" || !message.action) {
      return {
        ok: true,
        local: readStore(window.localStorage),
        session: readStore(window.sessionStorage),
      };
    }
    if (message.action === "clear") {
      store.clear();
      return { ok: true };
    }
    if (!message.key) return { ok: false, error: "Storage key is required." };
    if (message.action === "delete") {
      store.removeItem(message.key);
      return { ok: true };
    }
    if (message.action === "set") {
      store.setItem(message.key, message.value ?? "");
      return { ok: true };
    }
    return { ok: false, error: "Unsupported storage action." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Storage access failed.",
    };
  }
}

function readStore(store: Storage): Array<{ key: string; value: string }> {
  const entries: Array<{ key: string; value: string }> = [];
  try {
    for (let index = 0; index < store.length && entries.length < 200; index += 1) {
      const key = store.key(index);
      if (key === null) continue;
      entries.push({ key, value: truncate(store.getItem(key) ?? "", 4000) });
    }
  } catch {
    // Access can throw for sandboxed or blocked origins.
  }
  return entries;
}

async function handleDom(message: DomMessage): Promise<Record<string, unknown>> {
  try {
    const args = message.args ?? {};
    switch (message.action) {
      case "query":
        return { ok: true, data: queryDom(args) };
      case "click":
        return { ok: true, data: clickDom(args) };
      case "fill":
        return { ok: true, data: fillDom(args) };
      case "submit":
        return { ok: true, data: submitDom(args) };
      case "set-attribute":
        return { ok: true, data: setAttributeDom(args) };
      case "run-js":
        return { ok: true, data: await runPageScript(args) };
      case "performance":
        return { ok: true, data: performanceSnapshot() };
      case "console":
        return { ok: true, data: { events: consoleEvents } };
      default:
        return { ok: false, error: "Unsupported DOM action." };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "DOM operation failed.",
    };
  }
}

function stringArg(args: Record<string, unknown>, key: string, max = 2000): string {
  const value = args[key];
  return typeof value === "string" ? value.slice(0, max) : "";
}

function resolveElement(selector: string): Element {
  if (!selector) throw new Error("A CSS selector is required.");
  if (selector.length > 500) throw new Error("Selector is too long.");
  let element: Element | null;
  try {
    element = document.querySelector(selector);
  } catch {
    throw new Error("Invalid CSS selector.");
  }
  if (!element) throw new Error("No element matches that selector.");
  return element;
}

function queryDom(args: Record<string, unknown>): Record<string, unknown> {
  const selector = stringArg(args, "selector", 500);
  if (!selector) throw new Error("A CSS selector is required.");
  if (selector.length > 500) throw new Error("Selector is too long.");
  const limit = Math.max(1, Math.min(100, Number(args.limit) || 20));
  const includeHtml = args.includeHtml === true;
  const includeValues = args.includeValues === true;
  let elements: Element[];
  try {
    elements = Array.from(document.querySelectorAll(selector)).slice(0, limit);
  } catch {
    throw new Error("Invalid CSS selector.");
  }
  return {
    count: document.querySelectorAll(selector).length,
    items: elements.map((element) => {
      const record: Record<string, unknown> = {
        tag: element.tagName.toLowerCase(),
        id: element.id || undefined,
        classes: element.className && typeof element.className === "string"
          ? element.className.split(/\s+/).filter(Boolean).slice(0, 20)
          : undefined,
        text: truncate((element.textContent ?? "").trim(), 1000),
      };
      if (element instanceof HTMLAnchorElement) record.href = element.href;
      if (
        includeValues &&
        (element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement)
      ) {
        record.value = truncate(element.value, 2000);
      }
      if (includeHtml) record.html = truncate(element.outerHTML, 4000);
      return record;
    }),
  };
}

function guardNavigation(element: Element): void {
  const anchor = element.closest("a[href]");
  if (anchor instanceof HTMLAnchorElement) {
    const target = new URL(anchor.href, location.href);
    if (target.origin !== location.origin) {
      throw new Error(
        "Blocked cross-origin link click. Use the navigate tool with an in-scope URL instead.",
      );
    }
  }
  const form = element.closest("form");
  if (form instanceof HTMLFormElement && form.action) {
    const target = new URL(form.action, location.href);
    if (target.origin !== location.origin) {
      throw new Error(
        "Blocked cross-origin form submission. Use the navigate tool with an in-scope URL instead.",
      );
    }
  }
}

function clickDom(args: Record<string, unknown>): Record<string, unknown> {
  const element = resolveElement(stringArg(args, "selector", 500));
  guardNavigation(element);
  if (!(element instanceof HTMLElement)) {
    throw new Error("The selected element is not clickable.");
  }
  element.click();
  return { clicked: element.tagName.toLowerCase() };
}

function fillDom(args: Record<string, unknown>): Record<string, unknown> {
  const element = resolveElement(stringArg(args, "selector", 500));
  const value = stringArg(args, "value", 20_000);
  if (element instanceof HTMLInputElement) {
    element.focus();
    element.value = value;
  } else if (element instanceof HTMLTextAreaElement) {
    element.focus();
    element.value = value;
  } else if (element instanceof HTMLSelectElement) {
    element.value = value;
  } else if (element instanceof HTMLElement && element.isContentEditable) {
    element.focus();
    element.textContent = value;
  } else {
    throw new Error("The selected element cannot be filled.");
  }
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  return { filled: true, tag: element.tagName.toLowerCase() };
}

function submitDom(args: Record<string, unknown>): Record<string, unknown> {
  const selector = stringArg(args, "selector", 500);
  const element = selector ? resolveElement(selector) : document.activeElement;
  if (!element) throw new Error("No form is selected.");
  const form = element instanceof HTMLFormElement ? element : element.closest("form");
  if (!(form instanceof HTMLFormElement)) throw new Error("No form found.");
  guardNavigation(form);
  if (typeof form.requestSubmit === "function") form.requestSubmit();
  else form.submit();
  return { submitted: true, action: form.action };
}

function setAttributeDom(args: Record<string, unknown>): Record<string, unknown> {
  const element = resolveElement(stringArg(args, "selector", 500));
  const name = stringArg(args, "name", 200);
  const value = stringArg(args, "value", 20_000);
  if (!name) throw new Error("An attribute name is required.");
  element.setAttribute(name, value);
  return { tag: element.tagName.toLowerCase(), name, value };
}

async function runPageScript(args: Record<string, unknown>): Promise<unknown> {
  const source = stringArg(args, "source", 20_000);
  if (!source) throw new Error("JavaScript source is required.");
  const fn = new Function(`"use strict";\n${source}`) as () => unknown;
  const result = await Promise.resolve(fn());
  if (result === undefined) return null;
  if (
    typeof result === "string" ||
    typeof result === "number" ||
    typeof result === "boolean"
  ) {
    return result;
  }
  try {
    return truncate(JSON.stringify(result), 20_000);
  } catch {
    return String(result);
  }
}

function performanceSnapshot(): Record<string, unknown> {
  const navigation = performance.getEntriesByType(
    "navigation",
  )[0] as PerformanceNavigationTiming | undefined;
  const resources = performance
    .getEntriesByType("resource")
    .slice(-100)
    .map((entry) => ({
      name: truncate(entry.name, 1000),
      type: (entry as PerformanceResourceTiming).initiatorType,
      duration: Math.round(entry.duration),
      transferSize: (entry as PerformanceResourceTiming).transferSize,
    }));
  const memory = (performance as Performance & {
    memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
  }).memory;
  return {
    url: location.href,
    title: document.title,
    navigation: navigation
      ? {
          type: navigation.type,
          domContentLoaded: Math.round(navigation.domContentLoadedEventEnd),
          load: Math.round(navigation.loadEventEnd),
          transferSize: navigation.transferSize,
        }
      : undefined,
    dom: {
      elements: document.querySelectorAll("*").length,
      scripts: document.scripts.length,
      forms: document.forms.length,
      iframes: document.querySelectorAll("iframe").length,
    },
    resources,
    memory,
  };
}

function scanFlags(patterns: FlagPattern[]): FlagMatch[] {
  const { compiled } = compileFlagPatterns(patterns);
  if (compiled.length === 0) return [];
  const chunks: string[] = [];
  chunks.push(location.href);
  chunks.push(document.title);
  const bodyText = document.body?.innerText ?? "";
  chunks.push(bodyText.slice(0, 1_000_000));
  const html = document.documentElement?.innerHTML ?? "";
  chunks.push(html.slice(0, 1_000_000));
  return findInText(chunks.join("\n"), compiled);
}

function findInText(source: string, compiled: CompiledFlagPattern[]): FlagMatch[] {
  const matches: FlagMatch[] = [];
  const seen = new Set<string>();
  for (const { name, regex } of compiled) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(source)) !== null) {
      const value = match[0];
      if (!value || seen.has(value)) {
        if (match.index === regex.lastIndex) regex.lastIndex += 1;
        continue;
      }
      seen.add(value);
      const start = Math.max(0, match.index - 48);
      const end = Math.min(source.length, match.index + value.length + 48);
      matches.push({
        value,
        patternName: name,
        index: match.index,
        context: truncate(source.slice(start, end).replace(/\s+/g, " "), 180),
      });
      if (match.index === regex.lastIndex) regex.lastIndex += 1;
    }
  }
  return matches.sort((a, b) => a.index - b.index);
}

function pageContext(): Record<string, unknown> {
  const selection = window.getSelection()?.toString() ?? "";
  const forms = Array.from(document.forms)
    .slice(0, 20)
    .map((form) => ({
      action: form.action,
      method: (form.method || "get").toUpperCase(),
      fields: Array.from(form.elements)
        .slice(0, 80)
        .map((element) => {
          if (element instanceof HTMLInputElement) {
            return {
              name: element.name,
              type: element.type,
              placeholder: element.placeholder,
            };
          }
          if (element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
            return { name: element.name, type: element.tagName.toLowerCase() };
          }
          return undefined;
        })
        .filter(Boolean),
    }));
  const meta = Array.from(document.querySelectorAll("meta"))
    .slice(0, 40)
    .map((element) => ({
      name: element.getAttribute("name") ?? element.getAttribute("property") ?? "",
      content: truncate(element.getAttribute("content") ?? "", 500),
    }))
    .filter((item) => item.name);
  return {
    url: location.href,
    title: document.title,
    selection: truncate(selection, 4000),
    headings: Array.from(document.querySelectorAll("h1, h2, h3"))
      .slice(0, 60)
      .map((element) => truncate((element.textContent ?? "").trim(), 200))
      .filter(Boolean),
    text: truncate(document.body?.innerText ?? "", 12_000),
    forms,
    links: Array.from(document.querySelectorAll("a[href]"))
      .slice(0, 80)
      .map((element) => ({
        text: truncate((element.textContent ?? "").trim(), 120),
        href: truncate((element as HTMLAnchorElement).href, 500),
      })),
    meta,
    capturedAt: new Date().toISOString(),
  };
}