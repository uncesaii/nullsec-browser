# NullSec architecture

## Baseline

NullSec targets **Mullvad Browser 16.0.2**, built from Firefox ESR 153.7.0 with `tor-browser-build`/`rbm`. Mullvad's privacy defaults stay in place:

- Resist Fingerprinting, first-party isolation, third-party cookie blocking, partitioned storage.
- Private browsing autostart, service workers disabled, disk cache disabled.
- `security.nocertdb=true`.
- Mullvad DoH and update endpoints, replaced by NullSec-controlled equivalents only in a release build.

The extension cannot change profiles, import a CA, or relax RFP. Those capabilities require the native bridge or source patches.

## Components

```text
Browser (Mullvad/Firefox)
  ├─ NullSec extension (MV3)
  │   ├─ background: webRequest capture, scope guard, repeater, rate limit
  │   ├─ content: explicit page-context and flag scans
  │   ├─ sidebar: notes, AI chat/tools, scope, flags, reports
  │   ├─ dock: history, repeater, fuzzer, decoder
  │   ├─ options/privacy: configuration and disclosure
  │   └─ devtools: inspected-tab request view
  └─ Native bridge (M0b skeleton)
      ├─ workspace metadata registry
      ├─ profile launch (stub)
      ├─ per-profile proxy CA import (stub)
      ├─ OS-keychain secret storage (stub)
      └─ update checks (stub)
```

## Request capture and scope

1. `webRequest.onBeforeRequest` records method, URL, type, tab, and start time for http(s)/ws(s).
2. Request and response headers are attached in the respective listeners.
3. Completion or error persists a `RequestRecord` in IndexedDB and broadcasts it to the dock.
4. AI provider hosts and extension pages are excluded. Bodies are not captured.
5. The repeater checks `workspace.mode`, URL scheme, scope, body size, and rate limit before sending.
6. Redirects are followed manually. Each target is scope-checked before the next request. Cross-origin redirects strip authorization and cookie headers. An opaque redirect is rejected because the target cannot be verified.
7. Responses are capped at 1 MB and recorded with status, headers, duration, and size.

The fuzzer is a sequential client of the same background repeater, so it inherits scope and rate-limit enforcement.

## Storage

`browser.storage.local`:

- `nullsec.workspace`: id, name, mode, scope rules, proxy config, compatibility, rate limit.
- `nullsec.settings`: provider id, per-provider model, flag patterns, redaction, agent step limit, update URL.
- `nullsec.pending`: transient context-menu payload.
- `nullsec.promptOverrides`: per-mode prompt overrides.

IndexedDB `nullsec`:

- `challenges` by workspace, containing notes, timeline, and flag candidates.
- `requests` by `[workspaceId, time]`, capped at 5,000 per workspace.

API keys are held in sidebar `sessionStorage` only. The bridge will hold profile secrets in the OS keychain, never in extension storage.

## Scope model

- `host`: exact host, optional port, or leading `*.` wildcard. Wildcards match subdomains, not the apex.
- `url`: origin plus path prefix.
- `cidr`: IPv4 CIDR, excluding `0.0.0.0/0`.
- Global `*` and `<all_urls>` are rejected.
- Broad rules require an explicit confirmation and are marked in the UI.
- Active tools fail closed when no rule matches.

DNS rebinding and authorized targets that resolve to internal addresses remain a residual risk. The scope is host-based, not IP-pinned.

## AI data flow (M1)

1. User selects a provider and enters a key in the sidebar session. `authenticationInfo` and `websiteContent` are optional data-collection permissions; Firefox prompts before the first provider test or prompt.
2. Page context is captured only on an explicit action. Forms exclude values; cookies and storage are never read.
3. Redaction runs during page-context capture and on tool output before it enters the prompt.
4. The request goes directly from the extension to the selected provider. No NullSec proxy.
5. Read-only tools cover page context, flag scan, request metadata, and local decoding. Request headers, cookies, and bodies are not exposed by request-history results.
6. Opt-in active tools cover in-scope tabs, navigation, DOM query/click/fill/submit/attribute, HTTP requests, cookies, localStorage/sessionStorage, performance, and page JavaScript. Active tools are disabled in Personal mode and require `enableActiveTools`; cookies, storage, and page JavaScript also require `enableSensitiveTools`.
7. Background handlers re-check workspace scope for tab, navigation, cookie, storage, and HTTP targets. DOM actions run only after the active tab's URL passes scope. Page JavaScript runs in the content-script world and can bypass scope, so it is gated behind the sensitive-data toggle and documented as such.
8. Active calls require a confirmation dialog unless `autoApproveActiveTools` is enabled. The tool loop never hides a denial; it passes the denial back to the model as the tool result.
9. Evidence IDs (`E1`, `E2`, ...) are attached to tool results. The system prompt requires the model to cite them and forbids inventing findings or flags.
10. The loop is capped by `maxAgentSteps`; provider calls use non-streaming OpenAI-compatible or Anthropic Messages adapters.
11. The DevTools panel has a second assistant surface with its own tools: inspected-page `eval`, DOM query, performance, HAR, cookies, and storage. It uses the same settings, consent, scope checks, and confirmation gates. `devtools_eval` can leave scope like page JavaScript, so it is sensitive-only.

Provider endpoints are data-driven from `providers.json` because vendor APIs drift. OpenRouter is the default aggregator. Gemini uses Google's OpenAI-compatible endpoint so a single adapter covers tool calls.

## Browser patches (approved, not applied)

- **P1:** unlock `privacy.resistFingerprinting` so a workspace can opt into compatibility. Default remains enabled.
- **P2:** rebrand application name, binary, installer, and branding assets to NullSec.
- **P4:** add `about:nullsec` for version, build provenance, workspace status, and privacy defaults.

Patch scope is intentionally minimal. RFP, PBM, cookie, service-worker, cache, and `security.nocertdb` defaults stay unchanged unless a workspace explicitly opts into a compatibility profile.

## Native bridge (M0b skeleton)

Implemented: native-messaging framing, `ping`, workspace metadata list/create/delete, and CA presence status. Profile launch, CA import, keychain secrets, and update checks are stubs.

Commands:

- `ping`
- `workspace.create`, `workspace.launch`, `workspace.delete`
- `cert.import`, `cert.status`
- `secret.set`, `secret.get`, `secret.delete`
- `update.check`

Transport: native messaging, one JSON request per message, strict schema validation, no shell interpolation. The bridge is optional; the browser and extension work without it.

## Build and release

- Extension: esbuild bundles TypeScript/Preact into `dist/`; icons are generated by `sharp`.
- Browser: Linux host with `rbm`/`tor-browser-build`, Windows cross-compiled.
- Distribution: unsigned CI artifacts first, then a manual signed update manifest on GitHub Releases.
- Extension: AMO unlisted signed XPI, pinned by SHA-256.
- No remote code, no third-party scripts, no telemetry.

Full browser builds and real-build screenshots are deferred until a Linux build host with sufficient disk is available.
