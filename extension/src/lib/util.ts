export function uid(prefix = ""): string {
  const value =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}_${value}` : value;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n… [truncated ${value.length - maxLength} chars]`;
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const id = key(item);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(item);
  }
  return result;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.replace(/0x/gi, "").replace(/[\s:,-]/g, "");
  if (normalized.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(normalized)) {
    throw new Error("Invalid hex input");
  }
  const result = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    result[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
  }
  return result;
}

export function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function printableRatio(value: string): number {
  if (!value) return 0;
  let printable = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (
      code === 9 ||
      code === 10 ||
      code === 13 ||
      (code >= 32 && code < 127) ||
      (code >= 160 && code !== 0xfffd && code < 0xd800)
    ) {
      printable += 1;
    }
  }
  return printable / value.length;
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}