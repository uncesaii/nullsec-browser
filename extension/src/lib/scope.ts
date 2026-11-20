import { parse as parseDomain } from "tldts";
import type { ScopeRule } from "./types";
import { nowIso, uid } from "./util";

export interface ScopeParseResult {
  ok: boolean;
  rule?: Omit<ScopeRule, "id" | "createdAt">;
  error?: string;
}

export interface ScopeMatch {
  inScope: boolean;
  rule?: ScopeRule;
  reason: string;
}

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/;

function normalizeHost(value: string): string {
  const withProtocol = value.includes("://") ? value : `http://${value}`;
  const url = new URL(withProtocol);
  return url.hostname.replace(/\.$/, "").toLowerCase();
}

function parsePort(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return undefined;
  return port;
}

function splitHostPort(value: string): { host: string; port?: number } {
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    const closing = trimmed.indexOf("]");
    if (closing < 0) return { host: trimmed };
    const host = trimmed.slice(0, closing + 1);
    const portPart = trimmed.slice(closing + 1);
    return {
      host,
      port: parsePort(portPart.startsWith(":") ? portPart.slice(1) : undefined),
    };
  }
  const lastColon = trimmed.lastIndexOf(":");
  if (lastColon > 0 && trimmed.indexOf(":") === lastColon) {
    const host = trimmed.slice(0, lastColon);
    const port = parsePort(trimmed.slice(lastColon + 1));
    if (port !== undefined) return { host, port };
  }
  return { host: trimmed };
}

export function parseIpv4Cidr(value: string): { base: number; mask: number } | undefined {
  const match = IPV4_PATTERN.exec(value.trim());
  if (!match) return undefined;
  const parts = [match[1], match[2], match[3], match[4]];
  const numbers = parts.map((part) => Number.parseInt(part ?? "", 10));
  if (numbers.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return undefined;
  }
  const prefix = match[5] === undefined ? 32 : Number.parseInt(match[5], 10);
  if (prefix < 0 || prefix > 32) return undefined;
  const base =
    ((numbers[0] ?? 0) << 24) |
    ((numbers[1] ?? 0) << 16) |
    ((numbers[2] ?? 0) << 8) |
    (numbers[3] ?? 0);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { base: (base & mask) >>> 0, mask };
}

function ipv4ToInt(value: string): number | undefined {
  const cidr = parseIpv4Cidr(value);
  return cidr?.base;
}

export function parseScopeRule(input: string, note?: string): ScopeParseResult {
  const value = input.trim();
  if (!value) return { ok: false, error: "Scope entry is empty" };
  if (value === "*" || value.includes("<all_urls>")) {
    return { ok: false, error: "A global wildcard is not allowed" };
  }
  if (value.length > 2048) return { ok: false, error: "Scope entry is too long" };

  if (IPV4_PATTERN.test(value)) {
    const cidr = parseIpv4Cidr(value);
    if (!cidr) return { ok: false, error: "Invalid IPv4 CIDR" };
    if (cidr.mask === 0) return { ok: false, error: "0.0.0.0/0 is not allowed" };
    return { ok: true, rule: { kind: "cidr", value, note } };
  }

  if (value.includes("://")) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return { ok: false, error: "Invalid URL" };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, error: "Only http:// and https:// scope URLs are supported" };
    }
    const path = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
    const normalized = `${url.origin}${path}`;
    return { ok: true, rule: { kind: "url", value: normalized, note } };
  }

  if (value.includes("/") && !value.includes("*")) {
    return parseScopeRule(`https://${value}`, note);
  }

  const { host, port } = splitHostPort(value);
  if (!host) return { ok: false, error: "Invalid host" };
  if (host.startsWith("*.")) {
    const suffix = host.slice(2);
    if (!suffix || suffix.includes("*")) {
      return { ok: false, error: "Only a leading * wildcard is supported" };
    }
    let normalized: string;
    try {
      normalized = normalizeHost(suffix);
    } catch {
      return { ok: false, error: "Invalid wildcard host" };
    }
    const ruleValue = `*.${normalized}${port ? `:${port}` : ""}`;
    return { ok: true, rule: { kind: "host", value: ruleValue, note } };
  }
  if (host.includes("*")) {
    return { ok: false, error: "Wildcards are only supported as a leading *." };
  }
  let normalized: string;
  try {
    normalized = normalizeHost(host);
  } catch {
    return { ok: false, error: "Invalid host" };
  }
  if (!normalized) return { ok: false, error: "Invalid host" };
  return {
    ok: true,
    rule: {
      kind: "host",
      value: `${normalized}${port ? `:${port}` : ""}`,
      note,
    },
  };
}

export function createScopeRule(input: string, note?: string): ScopeRule {
  const parsed = parseScopeRule(input, note);
  if (!parsed.ok || !parsed.rule) {
    throw new Error(parsed.error ?? "Invalid scope rule");
  }
  return {
    ...parsed.rule,
    id: uid("scope"),
    createdAt: nowIso(),
  };
}

export function isBroadScopeRule(rule: Pick<ScopeRule, "kind" | "value">): boolean {
  if (rule.kind === "cidr") {
    const cidr = parseIpv4Cidr(rule.value);
    return cidr !== undefined && cidr.mask !== 0xffffffff;
  }
  if (rule.kind !== "host") return false;
  const host = rule.value.split(":")[0] ?? "";
  if (!host.startsWith("*.")) return false;
  const suffix = host.slice(2);
  const parsed = parseDomain(suffix);
  return parsed.publicSuffix === suffix || parsed.domain === null;
}

function hostMatches(ruleValue: string, targetHost: string, targetPort: number | string): boolean {
  const { host, port } = splitHostPort(ruleValue);
  if (port !== undefined && String(port) !== String(targetPort)) return false;
  const ruleHost = host.toLowerCase();
  const normalizedTarget = targetHost.replace(/\.$/, "").toLowerCase();
  if (ruleHost.startsWith("*.")) {
    const suffix = ruleHost.slice(2);
    return normalizedTarget.endsWith(`.${suffix}`) && normalizedTarget !== suffix;
  }
  return ruleHost === normalizedTarget;
}

function urlRuleMatches(ruleValue: string, target: URL): boolean {
  let rule: URL;
  try {
    rule = new URL(ruleValue);
  } catch {
    return false;
  }
  const protocolMatches =
    rule.protocol === target.protocol ||
    (rule.protocol === "https:" && target.protocol === "wss:") ||
    (rule.protocol === "http:" && target.protocol === "ws:");
  if (!protocolMatches) return false;
  if (rule.host !== target.host) return false;
  const rulePath = rule.pathname.replace(/\/+$/, "") || "/";
  const targetPath = target.pathname.replace(/\/+$/, "") || "/";
  if (rulePath === "/") return true;
  return targetPath === rulePath || targetPath.startsWith(`${rulePath}/`);
}

function cidrMatches(ruleValue: string, targetHost: string): boolean {
  const cidr = parseIpv4Cidr(ruleValue);
  const target = ipv4ToInt(targetHost);
  if (!cidr || target === undefined) return false;
  return ((target & cidr.mask) >>> 0) === cidr.base;
}

export function matchScope(urlValue: string, rules: ScopeRule[]): ScopeMatch {
  let target: URL;
  try {
    target = new URL(urlValue);
  } catch {
    return { inScope: false, reason: "Invalid URL" };
  }
  if (!["http:", "https:", "ws:", "wss:"].includes(target.protocol)) {
    return { inScope: false, reason: "Unsupported URL scheme" };
  }
  for (const rule of rules) {
    let matched = false;
    if (rule.kind === "host") {
      matched = hostMatches(rule.value, target.hostname, target.port || defaultPort(target.protocol));
    } else if (rule.kind === "url") {
      matched = urlRuleMatches(rule.value, target);
    } else if (rule.kind === "cidr") {
      matched = cidrMatches(rule.value, target.hostname);
    }
    if (matched) {
      return { inScope: true, rule, reason: `Matches ${rule.kind} rule ${rule.value}` };
    }
  }
  return { inScope: false, reason: "No scope rule matches this URL" };
}

function defaultPort(protocol: string): number {
  if (protocol === "https:" || protocol === "wss:") return 443;
  if (protocol === "http:" || protocol === "ws:") return 80;
  return 0;
}

export function isInScope(urlValue: string, rules: ScopeRule[]): boolean {
  return matchScope(urlValue, rules).inScope;
}

export function currentSiteRule(urlValue: string): string {
  const url = new URL(urlValue);
  return url.host;
}

export function describeScope(rules: ScopeRule[]): string {
  if (rules.length === 0) return "No scope entries";
  if (rules.length === 1) return rules[0]?.value ?? "1 entry";
  return `${rules.length} entries`;
}