import {
  bytesToHex,
  decodeUtf8,
  encodeUtf8,
  hexToBytes,
  printableRatio,
} from "./util";

export interface DecodeResult {
  ok: boolean;
  value: string;
  hex?: string;
  error?: string;
}

export function encodeBase64(value: string, urlSafe = false): string {
  const bytes = encodeUtf8(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary);
  return urlSafe
    ? encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
    : encoded;
}

export function decodeBase64(value: string): DecodeResult {
  const cleaned = value
    .trim()
    .replace(/\s+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  if (cleaned.length === 0) {
    return { ok: false, value: "", error: "Empty input" };
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
    return { ok: false, value: "", error: "Invalid base64 characters" };
  }
  const padded = cleaned.padEnd(Math.ceil(cleaned.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return { ok: true, value: decodeUtf8(bytes), hex: bytesToHex(bytes) };
  } catch {
    return { ok: false, value: "", error: "Invalid base64 padding" };
  }
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function encodeBase32(value: string): string {
  const bytes = encodeUtf8(value);
  let bits = 0;
  let buffer = 0;
  let output = "";
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  }
  while (output.length % 8 !== 0) output += "=";
  return output;
}

export function decodeBase32(value: string): DecodeResult {
  const cleaned = value.toUpperCase().replace(/\s+/g, "").replace(/=+$/g, "");
  if (!cleaned) return { ok: false, value: "", error: "Empty input" };
  if (!/^[A-Z2-7]+$/.test(cleaned)) {
    return { ok: false, value: "", error: "Invalid base32 characters" };
  }
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) return { ok: false, value: "", error: "Invalid base32" };
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const result = Uint8Array.from(bytes);
  return { ok: true, value: decodeUtf8(result), hex: bytesToHex(result) };
}

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function encodeBase58(value: string): string {
  const bytes = encodeUtf8(value);
  let number = 0n;
  for (const byte of bytes) number = number * 256n + BigInt(byte);
  let output = "";
  while (number > 0n) {
    const remainder = Number(number % 58n);
    output = BASE58_ALPHABET[remainder] + output;
    number /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    output = `1${output}`;
  }
  return output || "1";
}

export function decodeBase58(value: string): DecodeResult {
  const cleaned = value.trim().replace(/\s+/g, "");
  if (!cleaned) return { ok: false, value: "", error: "Empty input" };
  let number = 0n;
  for (const char of cleaned) {
    const index = BASE58_ALPHABET.indexOf(char);
    if (index < 0) {
      return { ok: false, value: "", error: "Invalid base58 characters" };
    }
    number = number * 58n + BigInt(index);
  }
  const bytes: number[] = [];
  while (number > 0n) {
    bytes.unshift(Number(number % 256n));
    number /= 256n;
  }
  for (const char of cleaned) {
    if (char !== "1") break;
    bytes.unshift(0);
  }
  const result = Uint8Array.from(bytes);
  return { ok: true, value: decodeUtf8(result), hex: bytesToHex(result) };
}

export function encodeHex(value: string, separator = ""): string {
  return bytesToHex(encodeUtf8(value))
    .match(/.{1,2}/g)
    ?.join(separator) ?? "";
}

export function decodeHex(value: string): DecodeResult {
  try {
    const bytes = hexToBytes(value);
    return { ok: true, value: decodeUtf8(bytes), hex: bytesToHex(bytes) };
  } catch (error) {
    return {
      ok: false,
      value: "",
      error: error instanceof Error ? error.message : "Invalid hex",
    };
  }
}

export function encodeUrl(value: string, component = true): string {
  return component ? encodeURIComponent(value) : encodeURI(value);
}

export function decodeUrl(value: string): DecodeResult {
  try {
    return {
      ok: true,
      value: decodeURIComponent(value.replace(/\+/g, " ")),
    };
  } catch {
    return { ok: false, value: "", error: "Invalid URL encoding" };
  }
}

const HTML_NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
};

export function encodeHtmlEntities(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

export function decodeHtmlEntities(value: string): DecodeResult {
  let unknown = false;
  const decoded = value.replace(
    /&(#x?[0-9a-f]+|[a-z][a-z0-9]+);?/gi,
    (match, entity: string) => {
      if (entity.startsWith("#x") || entity.startsWith("#X")) {
        const code = Number.parseInt(entity.slice(2), 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      if (entity.startsWith("#")) {
        const code = Number.parseInt(entity.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      const named = HTML_NAMED_ENTITIES[entity.toLowerCase()];
      if (named === undefined) {
        unknown = true;
        return match;
      }
      return named;
    },
  );
  return unknown
    ? { ok: false, value: decoded, error: "Some entities were not recognized" }
    : { ok: true, value: decoded };
}

export function rot(value: string, shift: number): string {
  const normalized = ((shift % 26) + 26) % 26;
  return value.replace(/[a-z]/gi, (char) => {
    const base = char === char.toLowerCase() ? 97 : 65;
    return String.fromCharCode(((char.charCodeAt(0) - base + normalized) % 26) + base);
  });
}

const ENGLISH_FREQUENCY = "etaoinshrdlucmfwypvbgkjqxz";
const COMMON_WORDS = new Set([
  "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it",
  "for", "not", "on", "with", "he", "as", "you", "do", "at", "this", "but",
  "his", "by", "from", "they", "we", "say", "her", "she", "or", "an", "will",
  "my", "one", "all", "would", "there", "their", "what", "so", "up", "out",
  "if", "about", "who", "get", "which", "go", "me", "when", "make", "can",
  "like", "time", "no", "just", "him", "know", "take", "people", "into",
  "year", "your", "good", "some", "could", "them", "see", "other", "than",
  "then", "now", "look", "only", "come", "its", "over", "think", "also",
  "back", "after", "use", "two", "how", "our", "work", "first", "well",
  "way", "even", "new", "want", "because", "any", "these", "give", "day",
  "most", "us", "hello", "world", "flag", "ctf", "quick", "brown", "fox",
]);

export function englishScore(value: string): number {
  const text = value.toLowerCase().replace(/[^a-z ]/g, "");
  if (!text) return Number.NEGATIVE_INFINITY;
  let score = 0;
  for (const char of text) {
    if (char === " ") {
      score += 3;
      continue;
    }
    const index = ENGLISH_FREQUENCY.indexOf(char);
    score += index >= 0 ? 1 - index / 40 : -0.5;
  }
  const words = text.split(/\s+/).filter(Boolean);
  const commonBonus = words.filter((word) => COMMON_WORDS.has(word)).length * 4;
  return score / text.length + commonBonus / Math.max(1, words.length);
}

export interface RotResult {
  shift: number;
  text: string;
  score: number;
}

export function rotBruteForce(value: string): RotResult[] {
  return Array.from({ length: 26 }, (_, shift) => {
    const text = rot(value, shift);
    return { shift, text, score: englishScore(text) };
  }).sort((a, b) => b.score - a.score);
}

function xorBytes(bytes: Uint8Array, key: number): Uint8Array {
  return Uint8Array.from(bytes, (byte) => byte ^ key);
}

export function xorWithKey(value: string, key: string): DecodeResult {
  const bytes = encodeUtf8(value);
  const keyBytes = encodeUtf8(key);
  if (keyBytes.length === 0) {
    return { ok: false, value: "", error: "XOR key is empty" };
  }
  const output = Uint8Array.from(bytes, (byte, index) => {
    const keyByte = keyBytes[index % keyBytes.length] ?? 0;
    return byte ^ keyByte;
  });
  return { ok: true, value: decodeUtf8(output), hex: bytesToHex(output) };
}

export interface XorResult {
  key: number;
  text: string;
  score: number;
}

export function xorBruteForce(value: string): XorResult[] {
  const bytes = encodeUtf8(value);
  return Array.from({ length: 256 }, (_, key) => {
    const text = decodeUtf8(xorBytes(bytes, key));
    const score = englishScore(text) + printableRatio(text) * 2;
    return { key, text, score };
  }).sort((a, b) => b.score - a.score);
}

export interface JwtDecoded {
  header: unknown;
  payload: unknown;
  signature: string;
}

export function decodeJwt(value: string): { ok: true; value: JwtDecoded } | { ok: false; error: string } {
  const parts = value.trim().split(".");
  if (parts.length !== 3) {
    return { ok: false, error: "JWT must have three dot-separated parts" };
  }
  const [headerPart, payloadPart, signature] = parts;
  if (!headerPart || !payloadPart) {
    return { ok: false, error: "JWT header or payload is empty" };
  }
  try {
    const header = JSON.parse(decodeBase64(headerPart).value) as unknown;
    const payload = JSON.parse(decodeBase64(payloadPart).value) as unknown;
    return { ok: true, value: { header, payload, signature: signature ?? "" } };
  } catch {
    return { ok: false, error: "JWT header/payload is not valid JSON" };
  }
}

const HASH_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "bcrypt", pattern: /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/ },
  { name: "argon2", pattern: /^\$argon2(id|i|d)\$/ },
  { name: "sha512-crypt", pattern: /^\$6\$/ },
  { name: "sha256-crypt", pattern: /^\$5\$/ },
  { name: "MD5 crypt", pattern: /^\$1\$/ },
  { name: "JWT", pattern: /^eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*$/ },
  { name: "SHA-512", pattern: /^[a-f0-9]{128}$/i },
  { name: "SHA-384", pattern: /^[a-f0-9]{96}$/i },
  { name: "SHA-256", pattern: /^[a-f0-9]{64}$/i },
  { name: "SHA-224", pattern: /^[a-f0-9]{56}$/i },
  { name: "SHA-1", pattern: /^[a-f0-9]{40}$/i },
  { name: "MD5", pattern: /^[a-f0-9]{32}$/i },
  { name: "NTLM", pattern: /^[a-f0-9]{32}$/i },
  { name: "MySQL 4.1+", pattern: /^\*[A-F0-9]{40}$/i },
];

export function identifyHash(value: string): string[] {
  const trimmed = value.trim();
  return HASH_PATTERNS.filter(({ pattern }) => pattern.test(trimmed)).map(
    ({ name }) => name,
  );
}

export interface Detection {
  kind: string;
  confidence: number;
  decoded: string;
}

function looksLikeBase64(value: string): boolean {
  const cleaned = value.replace(/\s+/g, "");
  if (cleaned.length < 8 || cleaned.length % 4 === 1) return false;
  if (!/^[A-Za-z0-9+/=_-]+$/.test(cleaned)) return false;
  const decoded = decodeBase64(cleaned);
  if (!decoded.ok || decoded.value.includes("\ufffd")) return false;
  return printableRatio(decoded.value) > 0.85;
}

function looksLikeBase32(value: string): boolean {
  const cleaned = value.replace(/\s+/g, "").replace(/=+$/g, "");
  if (cleaned.length < 8 || !/^[A-Z2-7]+$/i.test(cleaned)) return false;
  const decoded = decodeBase32(cleaned);
  return decoded.ok && printableRatio(decoded.value) > 0.85;
}

function looksLikeHex(value: string): boolean {
  const cleaned = value.replace(/0x/gi, "").replace(/[\s:,-]/g, "");
  if (cleaned.length < 8 || cleaned.length % 2 !== 0) return false;
  if (!/^[0-9a-f]+$/i.test(cleaned)) return false;
  const decoded = decodeHex(cleaned);
  return decoded.ok && printableRatio(decoded.value) > 0.85;
}

export function detectEncoding(value: string): Detection[] {
  const results: Detection[] = [];
  if (identifyHash(value).includes("JWT")) {
    const jwt = decodeJwt(value);
    if (jwt.ok) {
      results.push({
        kind: "JWT",
        confidence: 0.99,
        decoded: JSON.stringify(jwt.value, null, 2),
      });
    }
  }
  if (looksLikeBase64(value)) {
    results.push({
      kind: "Base64",
      confidence: 0.9,
      decoded: decodeBase64(value).value,
    });
  }
  if (looksLikeBase32(value)) {
    results.push({
      kind: "Base32",
      confidence: 0.75,
      decoded: decodeBase32(value).value,
    });
  }
  if (looksLikeHex(value)) {
    results.push({
      kind: "Hex",
      confidence: /[\s:,-]|0x/i.test(value) ? 0.95 : 0.8,
      decoded: decodeHex(value).value,
    });
  }
  if (/%[0-9a-f]{2}/i.test(value)) {
    const decoded = decodeUrl(value);
    if (decoded.ok && decoded.value !== value) {
      results.push({ kind: "URL", confidence: 0.85, decoded: decoded.value });
    }
  }
  if (/&(#x?[0-9a-f]+|[a-z][a-z0-9]+);/i.test(value)) {
    const decoded = decodeHtmlEntities(value);
    if (decoded.ok && decoded.value !== value) {
      results.push({ kind: "HTML entities", confidence: 0.8, decoded: decoded.value });
    }
  }
  if (results.length === 0) {
    results.push({ kind: "Plain text", confidence: 0.3, decoded: value });
  }
  return results.sort((a, b) => b.confidence - a.confidence);
}