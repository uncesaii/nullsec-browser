import { describe, expect, it } from "vitest";
import {
  createScopeRule,
  isBroadScopeRule,
  isInScope,
  matchScope,
  parseScopeRule,
} from "../extension/src/lib/scope";

function rule(value: string) {
  return createScopeRule(value);
}

describe("scope parsing", () => {
  it("parses exact hosts and ports", () => {
    const parsed = parseScopeRule("Example.com:8443");
    expect(parsed.ok).toBe(true);
    expect(parsed.rule?.value).toBe("example.com:8443");
  });

  it("parses wildcard hosts", () => {
    const parsed = parseScopeRule("*.example.com");
    expect(parsed.ok).toBe(true);
    expect(parsed.rule?.kind).toBe("host");
  });

  it("parses URL prefixes", () => {
    const parsed = parseScopeRule("https://app.example.com/admin/");
    expect(parsed.ok).toBe(true);
    expect(parsed.rule?.value).toBe("https://app.example.com/admin");
  });

  it("parses IPv4 CIDR", () => {
    const parsed = parseScopeRule("10.0.0.0/24");
    expect(parsed.ok).toBe(true);
    expect(parsed.rule?.kind).toBe("cidr");
  });

  it("rejects global wildcards", () => {
    expect(parseScopeRule("*").ok).toBe(false);
    expect(parseScopeRule("0.0.0.0/0").ok).toBe(false);
  });

  it("rejects invalid ports and hosts", () => {
    expect(parseScopeRule("example.com:99999").ok).toBe(false);
    expect(parseScopeRule("ftp://example.com").ok).toBe(false);
  });
});

describe("scope matching", () => {
  it("matches exact hosts regardless of default port", () => {
    expect(isInScope("https://example.com/", [rule("example.com")])).toBe(true);
    expect(isInScope("http://example.com:8080/", [rule("example.com")])).toBe(true);
  });

  it("honors explicit ports", () => {
    const rules = [rule("example.com:8443")];
    expect(isInScope("https://example.com:8443/a", rules)).toBe(true);
    expect(isInScope("https://example.com/a", rules)).toBe(false);
  });

  it("matches subdomains but not the apex for a wildcard", () => {
    const rules = [rule("*.example.com")];
    expect(isInScope("https://a.example.com/", rules)).toBe(true);
    expect(isInScope("https://example.com/", rules)).toBe(false);
    expect(isInScope("https://evil-example.com/", rules)).toBe(false);
  });

  it("matches URL path prefixes on boundaries", () => {
    const rules = [rule("https://example.com/admin")];
    expect(isInScope("https://example.com/admin", rules)).toBe(true);
    expect(isInScope("https://example.com/admin/users", rules)).toBe(true);
    expect(isInScope("https://example.com/administrator", rules)).toBe(false);
    expect(isInScope("http://example.com/admin", rules)).toBe(false);
  });

  it("matches IPv4 CIDR literals", () => {
    const rules = [rule("10.0.0.0/24")];
    expect(isInScope("http://10.0.0.5:8080/", rules)).toBe(true);
    expect(isInScope("http://10.0.1.5/", rules)).toBe(false);
  });

  it("matches WebSocket URLs against host rules", () => {
    expect(isInScope("wss://example.com/socket", [rule("example.com")])).toBe(true);
  });

  it("fails closed for invalid URLs and unsupported schemes", () => {
    expect(isInScope("not a url", [rule("example.com")])).toBe(false);
    expect(isInScope("file:///tmp/x", [rule("example.com")])).toBe(false);
  });

  it("reports the matching rule", () => {
    const matched = matchScope("https://a.example.com/", [rule("*.example.com")]);
    expect(matched.inScope).toBe(true);
    expect(matched.rule?.value).toBe("*.example.com");
  });
});

describe("broad scope warnings", () => {
  it("flags public-suffix wildcards and wide CIDRs", () => {
    expect(isBroadScopeRule(rule("*.com"))).toBe(true);
    expect(isBroadScopeRule(rule("*.co.uk"))).toBe(true);
    expect(isBroadScopeRule(rule("10.0.0.0/8"))).toBe(true);
  });

  it("does not flag a normal registrable domain", () => {
    expect(isBroadScopeRule(rule("*.example.com"))).toBe(false);
    expect(isBroadScopeRule(rule("10.0.0.0/32"))).toBe(false);
  });
});