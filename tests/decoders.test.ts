import { describe, expect, it } from "vitest";
import {
  decodeBase32,
  decodeBase58,
  decodeBase64,
  decodeHex,
  decodeHtmlEntities,
  decodeJwt,
  decodeUrl,
  detectEncoding,
  encodeBase32,
  encodeBase58,
  encodeBase64,
  encodeHex,
  encodeHtmlEntities,
  identifyHash,
  rot,
  rotBruteForce,
  xorBruteForce,
  xorWithKey,
} from "../extension/src/lib/decoders";

describe("base encodings", () => {
  it("round-trips UTF-8 through base64", () => {
    const value = "NullSec — CTF";
    expect(decodeBase64(encodeBase64(value)).value).toBe(value);
  });

  it("decodes base64url", () => {
    expect(decodeBase64("SGVsbG8td29ybGQ_").value).toBe("Hello-world?");
  });

  it("round-trips base32", () => {
    const encoded = encodeBase32("hello");
    expect(encoded).toBe("NBSWY3DP");
    expect(decodeBase32(encoded).value).toBe("hello");
  });

  it("round-trips base58", () => {
    const encoded = encodeBase58("hello");
    expect(decodeBase58(encoded).value).toBe("hello");
  });

  it("round-trips hex with separators", () => {
    const encoded = encodeHex("Hi", ":");
    expect(encoded).toBe("48:69");
    expect(decodeHex(encoded).value).toBe("Hi");
    expect(decodeHex("zz").ok).toBe(false);
  });

  it("rejects invalid base64", () => {
    expect(decodeBase64("!!!!").ok).toBe(false);
  });
});

describe("text encodings", () => {
  it("decodes URL encoding", () => {
    expect(decodeUrl("a%20b+c").value).toBe("a b c");
  });

  it("round-trips HTML entities", () => {
    const encoded = encodeHtmlEntities(`<a href="x">'&'</a>`);
    expect(decodeHtmlEntities(encoded).value).toBe(`<a href="x">'&'</a>`);
  });

  it("decodes numeric entities", () => {
    expect(decodeHtmlEntities("&#65;&#x42;").value).toBe("AB");
  });

  it("applies ROT13", () => {
    expect(rot("Hello", 13)).toBe("Uryyb");
  });

  it("ranks ROT brute force", () => {
    expect(rotBruteForce("Uryyb jbeyq")[0]?.text).toBe("Hello world");
  });
});

describe("xor", () => {
  it("round-trips with a multi-byte key", () => {
    const encrypted = xorWithKey("flag{test}", "key");
    expect(xorWithKey(encrypted.value, "key").value).toBe("flag{test}");
  });

  it("recovers a single-byte XOR key", () => {
    const encrypted = xorWithKey("the quick brown fox", "X");
    const best = xorBruteForce(encrypted.value)[0];
    expect(best?.text).toContain("quick");
  });
});

describe("jwt", () => {
  it("decodes a JWT without verifying it", () => {
    const token =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.signature";
    const decoded = decodeJwt(token);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value.header).toEqual({ alg: "HS256", typ: "JWT" });
      expect(decoded.value.payload).toEqual({ sub: "1234" });
      expect(decoded.value.signature).toBe("signature");
    }
  });

  it("rejects malformed JWTs", () => {
    expect(decodeJwt("not-a-jwt").ok).toBe(false);
  });
});

describe("hash identification", () => {
  it("identifies common hex digests", () => {
    expect(identifyHash("d41d8cd98f00b204e9800998ecf8427e")).toContain("MD5");
    expect(identifyHash("a".repeat(64))).toContain("SHA-256");
    expect(identifyHash("$2b$12$" + "a".repeat(53))).toContain("bcrypt");
  });
});

describe("auto detection", () => {
  it("detects base64", () => {
    const [first] = detectEncoding("SGVsbG8sIHRoaXMgaXMgYSB0ZXN0");
    expect(first?.kind).toBe("Base64");
  });

  it("detects hex", () => {
    const [first] = detectEncoding("48 65 6c 6c 6f 20 77 6f 72 6c 64");
    expect(first?.kind).toBe("Hex");
  });

  it("falls back to plain text", () => {
    expect(detectEncoding("ordinary text")[0]?.kind).toBe("Plain text");
  });
});