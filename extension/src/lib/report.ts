import type { Challenge, ReportDraft, Settings, Workspace } from "./types";
import { redactText, mergeFindings } from "./redact";
import { escapeMarkdownCell, formatTime } from "./util";

export interface ReportOptions {
  includeTimeline?: boolean;
  includeCandidates?: boolean;
  redact?: boolean;
}

export function buildDraftReport(
  challenge: Challenge,
  workspace: Workspace | undefined,
  settings: Settings | undefined,
  options: ReportOptions = {},
): ReportDraft {
  const includeTimeline = options.includeTimeline ?? true;
  const includeCandidates = options.includeCandidates ?? true;
  const shouldRedact = options.redact ?? settings?.redactionEnabled ?? true;
  const findings = [];
  const notes = shouldRedact ? redactText(challenge.notes) : { text: challenge.notes, findings: [] };
  findings.push(...notes.findings);
  const timeline = challenge.timeline.map((event) => {
    const detail = event.detail
      ? shouldRedact
        ? redactText(event.detail)
        : { text: event.detail, findings: [] }
      : { text: "", findings: [] };
    findings.push(...detail.findings);
    return { ...event, detail: detail.text };
  });
  const confirmed = challenge.flags.filter((flag) => flag.status === "confirmed");
  const candidates = challenge.flags.filter((flag) => flag.status !== "rejected");
  const flagValue = confirmed[0]?.value;
  const scope = workspace?.scope.map((rule) => `- \`${rule.value}\``).join("\n") || "- No scope recorded";
  const tools = [
    "NullSec browser",
    "NullSec extension",
    "Request dock (history/repeater/fuzzer)",
    "Toolbox decoders",
    "Notes and timeline",
  ]
    .map((tool) => `- ${tool}`)
    .join("\n");
  const timelineTable = includeTimeline
    ? timeline.length
      ? [
          "| Time | Kind | Event | Detail |",
          "| --- | --- | --- | --- |",
          ...timeline.map(
            (event) =>
              `| ${formatTime(event.at)} | ${escapeMarkdownCell(event.kind)} | ${escapeMarkdownCell(event.title)} | ${escapeMarkdownCell(event.detail ?? "")} |`,
          ),
        ].join("\n")
      : "_No timeline events recorded._"
    : "_Timeline omitted._";
  const candidateTable = includeCandidates
    ? candidates.length
      ? [
          "| Flag | Pattern | Status | Source |",
          "| --- | --- | --- | --- |",
          ...candidates.map(
            (flag) =>
              `| \`${escapeMarkdownCell(flag.value)}\` | ${escapeMarkdownCell(flag.patternName)} | ${flag.status} | ${escapeMarkdownCell(flag.sourceUrl ?? "")} |`,
          ),
        ].join("\n")
      : "_No flag candidates recorded._"
    : "_Candidates omitted._";

  const markdown = `# ${challenge.name}

> NullSec draft report generated ${formatTime(new Date().toISOString())}. Review every section before export. AI assistance must not add facts that are not present in the evidence below.

## Summary

- Category: ${challenge.category || "Unspecified"}
- Status: ${challenge.status}
- Confirmed flag: ${flagValue ? `\`${flagValue}\`` : "_none_"}
- Timeline events: ${challenge.timeline.length}
- Flag candidates: ${candidates.length}

${notes.text || "_No challenge notes recorded._"}

## Scope and tools

### Authorized scope

${scope}

### Tools used

${tools}

Only test systems for which you have explicit authorization. This report is for CTFs, labs, and authorized engagements.

## Step timeline

${timelineTable}

## Evidence

${timeline
  .filter((event) => event.detail)
  .map(
    (event, index) =>
      `### Evidence ${index + 1}: ${event.title}\n\n- Time: ${formatTime(event.at)}\n- Kind: ${event.kind}\n\n\`\`\`\n${event.detail}\n\`\`\``,
  )
  .join("\n\n") || "_No evidence details recorded._"}

## Findings and mapping

Mapping to OWASP/CWE must be added by the tester only when supported by the evidence. NullSec does not invent findings.

- OWASP: _not mapped_
- CWE: _not mapped_
- Severity: _not assigned_

## Flag

${flagValue ? `\`${flagValue}\`\n\nConfirmed in this challenge.` : "_No flag has been confirmed._"}

### Flag candidates

${candidateTable}

## Remediation

_Add evidence-backed remediation notes before submission. Do not claim a fix was verified unless it was tested._

## Appendix

- Challenge ID: ${challenge.id}
- Workspace: ${workspace?.name ?? "unknown"}
- Workspace mode: ${workspace?.mode ?? "unknown"}
- Created: ${formatTime(challenge.createdAt)}
- Updated: ${formatTime(challenge.updatedAt)}
- Report redaction: ${shouldRedact ? "enabled" : "disabled"}
`;

  return {
    challengeId: challenge.id,
    generatedAt: new Date().toISOString(),
    markdown,
    redactionFindings: mergeFindings(findings),
  };
}