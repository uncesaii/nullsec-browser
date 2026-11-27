# Security policy

## Supported versions

NullSec is pre-release. Only the latest `main` build is supported for security reports.

## Reporting a vulnerability

Do not open a public issue for a vulnerability. Once the public repository is available, use GitHub private vulnerability reporting or the security contact listed on the repository profile.

Include:

- Affected component and version or commit.
- Reproduction steps and a minimal proof of concept.
- Impact and required preconditions.
- Whether the issue crosses the workspace scope boundary or exposes secrets.
- Any suggested fix.

Do not include real API keys, cookies, personal data, or unauthorized target data. Redact evidence before sending it.

## Scope

In scope:

- Extension privilege boundaries, scope-guard bypasses, redirect or DNS-based scope escapes.
- AI active-tool scope bypasses, including tab, cookie, storage, DOM, or page-JavaScript paths that reach targets outside workspace scope.
- Secret leakage into logs, exports, reports, request history, or AI prompts.
- Redaction bypasses in report or page-context previews.
- Native bridge command injection, path traversal, unsafe profile handling, and CA import flaws.
- Update-manifest signature verification and release artifact integrity.
- Browser source patches that weaken the Mullvad privacy baseline without disclosure.

Out of scope:

- Findings that require the user to deliberately install a malicious provider or modify the build.
- Vulnerabilities in third-party AI providers, Mullvad, Mozilla, or Firefox that are not caused by NullSec changes.
- Social engineering, physical access, or denial of service against third-party infrastructure.
- Reports containing unauthorized testing data.

## Safe harbor

Good-faith research on your own installation, with no access to other users' data, is welcome. Do not test third-party systems without authorization.

## Disclosure

We aim to acknowledge reports within 5 business days and coordinate disclosure after a fix is available. Timelines may vary for upstream Firefox or Mullvad issues.

## Cloud sandbox

Agent `shell`, `session`, and `files` actions execute in an E2B-hosted Kali
sandbox through the local bridge (`sandbox/bridge`). This is opt-in and requires
an E2B API key.

- The bridge binds to `127.0.0.1:8787` and reads its key from a gitignored `.env`.
- Sandbox commands run as root inside the sandbox; do not place unrelated
  secrets, personal files, or provider keys inside it.
- Commands and files sent to the sandbox are processed by E2B under E2B's terms
  and data-handling policy. NullSec does not operate a proxy or retain sandbox
  contents.
- The sandbox cannot reach the host's loopback; run local lab targets inside the
  sandbox or use a public target.
- Destructive HTTP verbs require confirmation; flags are recorded only from
  observed output and are never submitted automatically.

In scope for reports: bridge command injection, path traversal, unauthenticated
bridge access beyond loopback, sandbox escape that exposes host data, and secret
leakage into sandbox transcripts or reports.
