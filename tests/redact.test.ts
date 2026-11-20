import { describe, expect, it } from "vitest";
import { findFlags, compileFlagPatterns } from "../extension/src/lib/flag";
import { redactHeaders, redactText } from "../extension/src/lib/redact";

describe("flag detection", () => {
  it("finds default flag formats with context", () => {
    const matches = findFlags("noise flag{hello_world} more noise");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.value).toBe("flag{hello_world}");
    expect(matches[0]?.context).toContain("hello_world");
  });

  it("deduplicates matches across patterns", () => {
    const matches = findFlags("CTF{abc} CTF{abc}");
    expect(matches.map((match) => match.value)).toEqual(["CTF{abc}"]);
  });

  it("supports custom patterns and reports invalid regex", () => {
    const custom = [{ name: "custom", pattern: "NS\\{[a-z]+\\}", enabled: true }];
    expect(findFlags("NS{abc}", custom)[0]?.value).toBe("NS{abc}");
    const compiled = compileFlagPatterns([
      { name: "bad", pattern: "(", enabled: true },
    ]);
    expect(compiled.errors[0]).toContain("bad");
  });

  it("ignores disabled patterns", () => {
    expect(
      findFlags("flag{x}", [{ name: "flag", pattern: "flag\\{[^}]+\\}", enabled: false }]),
    ).toHaveLength(0);
  });
});

describe("redaction", () => {
  it("redacts authorization headers", () => {
    const result = redactText("Authorization: Bearer abcdefghijklmnop");
    expect(result.text).toContain("[REDACTED:authorization]");
    expect(result.text).not.toContain("abcdefghijklmnop");
    expect(result.findings[0]?.kind).toBe("authorization");
  });

  it("redacts JWTs, cookies, and password parameters", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJl";
    const result = redactText(
      `Cookie: session=abc123\nurl?password=hunter2&x=1\n${jwt}`,
    );
    expect(result.text).toContain("[REDACTED:cookie]");
    expect(result.text).toContain("[REDACTED:password]");
    expect(result.text).toContain("[REDACTED:jwt]");
    expect(result.text).not.toContain("hunter2");
  });

  it("does not redact a flag", () => {
    const result = redactText("flag{this_is_the_answer}");
    expect(result.text).toBe("flag{this_is_the_answer}");
  });

  it("redacts sensitive header names regardless of value", () => {
    const result = redactHeaders({
      Authorization: "Bearer secret-token",
      "X-Api-Key": "secret-key",
      Accept: "application/json",
    });
    expect(result.headers.Authorization).toBe("[REDACTED]");
    expect(result.headers["X-Api-Key"]).toBe("[REDACTED]");
    expect(result.headers.Accept).toBe("application/json");
  });

  it("merges findings from multiple sections", () => {
    const result = redactText(
      "Authorization: Bearer aaaaaaaaaaaa\nCookie: session=bbbbbbbb",
    );
    expect(result.findings.map((finding) => finding.kind)).toEqual([
      "authorization",
      "cookie",
    ]);
  });
});