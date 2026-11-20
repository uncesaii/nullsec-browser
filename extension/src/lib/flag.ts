import type { FlagMatch, FlagPattern } from "./types";
import { truncate } from "./util";

export const DEFAULT_FLAG_PATTERNS: FlagPattern[] = [
  { name: "flag", pattern: "flag\\{[^}\\r\\n]{1,200}\\}", enabled: true },
  { name: "CTF", pattern: "CTF\\{[^}\\r\\n]{1,200}\\}", enabled: true },
  { name: "picoCTF", pattern: "picoCTF\\{[^}\\r\\n]{1,200}\\}", enabled: true },
  { name: "HTB", pattern: "HTB\\{[^}\\r\\n]{1,200}\\}", enabled: true },
  { name: "NSSCTF", pattern: "NSSCTF\\{[^}\\r\\n]{1,200}\\}", enabled: true },
];

const MAX_SCAN_LENGTH = 2_000_000;

export interface CompiledFlagPattern {
  name: string;
  regex: RegExp;
}

export function compileFlagPatterns(patterns: FlagPattern[]): {
  compiled: CompiledFlagPattern[];
  errors: string[];
} {
  const compiled: CompiledFlagPattern[] = [];
  const errors: string[] = [];
  for (const pattern of patterns) {
    if (!pattern.enabled) continue;
    if (!pattern.pattern.trim()) {
      errors.push(`${pattern.name}: empty pattern`);
      continue;
    }
    if (pattern.pattern.length > 500) {
      errors.push(`${pattern.name}: pattern is too long`);
      continue;
    }
    try {
      compiled.push({
        name: pattern.name,
        regex: new RegExp(pattern.pattern, "g"),
      });
    } catch (error) {
      errors.push(
        `${pattern.name}: ${error instanceof Error ? error.message : "invalid regex"}`,
      );
    }
  }
  return { compiled, errors };
}

export function findFlags(
  text: string,
  patterns: FlagPattern[] = DEFAULT_FLAG_PATTERNS,
): FlagMatch[] {
  const source = text.slice(0, MAX_SCAN_LENGTH);
  const { compiled } = compileFlagPatterns(patterns);
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

export function isValidFlagPattern(value: string): boolean {
  try {
    new RegExp(value);
    return true;
  } catch {
    return false;
  }
}

export function looksLikeFlag(value: string): boolean {
  return findFlags(value).length > 0;
}