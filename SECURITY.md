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
