import { describe, expect, it } from "vitest";
import { buildDraftReport } from "../extension/src/lib/report";
import type { Challenge, Settings, Workspace } from "../extension/src/lib/types";

const challenge: Challenge = {
  id: "ch_1",
  workspaceId: "ws_1",
  name: "Example challenge",
  category: "Web",
  status: "solved",
  notes: "Found a token=supersecretvalue in the response.",
  timeline: [
    {
      id: "ev_1",
      at: "2026-11-20T10:00:00.000Z",
      kind: "request",
      title: "GET /admin",
      detail: "Authorization: Bearer abcdefghijklmnop\nflag{example}",
    },
  ],
  flags: [
    {
      id: "f_1",
      value: "flag{example}",
      patternName: "flag",
      status: "confirmed",
      at: "2026-11-20T10:01:00.000Z",
    },
  ],
  createdAt: "2026-11-20T09:00:00.000Z",
  updatedAt: "2026-11-20T10:01:00.000Z",
};

const workspace: Workspace = {
  id: "ws_1",
  name: "CTF",
  mode: "ctf",
  createdAt: "2026-11-20T09:00:00.000Z",
  updatedAt: "2026-11-20T09:00:00.000Z",
  scope: [{ id: "s1", kind: "host", value: "example.com", createdAt: "2026-11-20T09:00:00.000Z" }],
  compatibility: { relaxFingerprinting: false, headers: [] },
  rateLimitPerMinute: 20,
};

const settings: Settings = {
  providerId: "openrouter",
  modelByProvider: {},
  flagPatterns: [],
  redactionEnabled: true,
  maxAgentSteps: 8,
  enableActiveTools: false,
  enableSensitiveTools: false,
  autoApproveActiveTools: false,
};

describe("report generation", () => {
  it("generates a complete draft with the confirmed flag", () => {
    const report = buildDraftReport(challenge, workspace, settings);
    expect(report.markdown).toContain("# Example challenge");
    expect(report.markdown).toContain("## Summary");
    expect(report.markdown).toContain("## Scope and tools");
    expect(report.markdown).toContain("## Step timeline");
    expect(report.markdown).toContain("## Evidence");
    expect(report.markdown).toContain("flag{example}");
    expect(report.markdown).toContain("example.com");
  });

  it("redacts secrets in evidence but preserves the flag", () => {
    const report = buildDraftReport(challenge, workspace, settings);
    expect(report.markdown).not.toContain("abcdefghijklmnop");
    expect(report.markdown).not.toContain("supersecretvalue");
    expect(report.markdown).toContain("flag{example}");
    expect(report.redactionFindings.length).toBeGreaterThan(0);
  });

  it("can disable redaction explicitly", () => {
    const report = buildDraftReport(challenge, workspace, settings, { redact: false });
    expect(report.markdown).toContain("abcdefghijklmnop");
  });

  it("does not invent findings or remediation", () => {
    const report = buildDraftReport(challenge, workspace, settings);
    expect(report.markdown).toContain("_not mapped_");
    expect(report.markdown).toContain("_not assigned_");
  });
});