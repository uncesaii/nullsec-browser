import type { RedactionFinding, RedactionResult } from "./types";

interface RedactionRule {
  kind: string;
  pattern: RegExp;
  replacement: string;
}

const RULES: RedactionRule[] = [
  {
    kind: "authorization",
    pattern: /\b(Authorization\s*:\s*)(Bearer|Basic|Digest)\s+[A-Za-z0-9._~+/=-]{4,}/gi,
    replacement: "$1$2 [REDACTED:authorization]",
  },
  {
    kind: "api-key",
    pattern: /\b(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16})\b/g,
    replacement: "[REDACTED:api-key]",
  },
  {
    kind: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{0,}\b/g,
    replacement: "[REDACTED:jwt]",
  },
  {
    kind: "cookie",
    pattern: /\b((?:Set-)?Cookie\s*:\s*)[^\r\n]{4,}/gi,
    replacement: "$1[REDACTED:cookie]",
  },
  {
    kind: "password",
    pattern: /\b(password|passwd|pwd|pass)\s*[=:]\s*("[^"]*"|'[^']*'|[^\s&;,"']{2,})/gi,
    replacement: "$1=[REDACTED:password]",
  },
  {
    kind: "token-param",
    pattern: /\b(access_token|refresh_token|id_token|session|sessionid|token|api_key|apikey|secret|client_secret)\s*[=:]\s*("[^"]*"|'[^']*'|[^\s&;,"']{4,})/gi,
    replacement: "$1=[REDACTED:token]",
  },
  {
    kind: "private-key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacement: "[REDACTED:private-key]",
  },
  {
    kind: "aws-secret",
    pattern: /\b(aws_secret_access_key|AWS_SECRET_ACCESS_KEY)\s*[=:]\s*[A-Za-z0-9/+=]{20,}/g,
    replacement: "$1=[REDACTED:aws-secret]",
  },
];

export function redactText(input: string): RedactionResult {
  let text = input;
  const findings = new Map<string, number>();
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    text = text.replace(rule.pattern, (...args) => {
      const count = findings.get(rule.kind) ?? 0;
      findings.set(rule.kind, count + 1);
      return typeof rule.replacement === "string"
        ? rule.replacement.replace(/\$(\d)/g, (_, index: string) => String(args[Number(index)] ?? ""))
        : rule.replacement;
    });
  }
  return {
    text,
    findings: Array.from(findings, ([kind, count]) => ({ kind, count })).sort(
      (a, b) => a.kind.localeCompare(b.kind),
    ),
  };
}

export function redactHeaders(
  headers: Record<string, string> | undefined,
): { headers: Record<string, string>; findings: RedactionFinding[] } {
  if (!headers) return { headers: {}, findings: [] };
  const output: Record<string, string> = {};
  const counts = new Map<string, number>();
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (
      lower === "authorization" ||
      lower === "proxy-authorization" ||
      lower === "cookie" ||
      lower === "set-cookie" ||
      lower === "x-api-key" ||
      lower === "x-goog-api-key" ||
      lower === "anthropic-api-key"
    ) {
      output[name] = "[REDACTED]";
      const kind = lower.includes("cookie")
        ? "cookie"
        : lower.includes("authorization")
          ? "authorization"
          : "api-key";
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
      continue;
    }
    const redacted = redactText(value);
    output[name] = redacted.text;
    for (const finding of redacted.findings) {
      counts.set(finding.kind, (counts.get(finding.kind) ?? 0) + finding.count);
    }
  }
  return {
    headers: output,
    findings: Array.from(counts, ([kind, count]) => ({ kind, count })),
  };
}

export function mergeFindings(findings: RedactionFinding[]): RedactionFinding[] {
  const counts = new Map<string, number>();
  for (const finding of findings) {
    counts.set(finding.kind, (counts.get(finding.kind) ?? 0) + finding.count);
  }
  return Array.from(counts, ([kind, count]) => ({ kind, count })).sort(
    (a, b) => a.kind.localeCompare(b.kind),
  );
}