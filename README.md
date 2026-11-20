# NullSec

NullSec is a CTF-focused, privacy-first browser project based on **Mullvad Browser 16.0.2** (Firefox ESR 153.7.0). It combines the Mullvad privacy baseline with local-first workspaces, notes, flag detection, report drafting, a request dock, and a bring-your-own-key AI assistant.

> NullSec is an independent project. It is not affiliated with or endorsed by Mullvad, Mozilla, or any AI provider.

## Status

The repository currently contains the **M0a extension scaffold**, the **M0b native-bridge skeleton**, and the **M1 AI tool loop**. The Mullvad Browser source tree has not been forked or patched yet. The extension is usable in a Firefox 142+ or Mullvad Browser 16.0.2 profile for local development.

Working now:

- Challenge notebooks with notes, timeline events, and flag candidates.
- Workspace modes (`ctf`, `personal`) and fail-closed authorized scope.
- Explicit flag scanning of the active tab using configurable regex patterns.
- Markdown report drafts with secret redaction and sanitized preview.
- Request dock with history, scope-guarded repeater, URL fuzzer, and decoder.
- Options, privacy page, and a DevTools panel with request history and an AI assistant.
- Provider registry with 13 providers, session-only API keys, and OpenAI/Anthropic adapters.
- AI chat with evidence IDs, read-only context tools, and opt-in CTF tools for tabs, navigation, DOM, HTTP requests, cookies, storage, page JavaScript, DevTools eval, and HAR.
- Native bridge protocol, `ping`, and a local workspace metadata registry.

Not built yet:

- Browser source fork, rebranding, RFP unlock patch, `about:nullsec`.
- Native bridge profile launch, CA import, OS-keychain secrets, and update checks.
- Streaming responses and automatic report citations.
- Signed AMO XPI, signed update manifest, CI release pipeline.
- Real-build screenshots and visual approval.

## Requirements

- Node.js 22 or newer.
- Rust 1.85+ for the native bridge.
- Firefox 142+ or Mullvad Browser 16.0.2 for temporary extension loading.
- A Linux build host with ~50–100 GB free for the full browser build (deferred).

## Development

```powershell
npm install
npm run icons
npm run build
npm test
npm run typecheck
npm run lint
```

`npm run build` writes the unpacked extension to `dist/`. `npm run dev` watches for changes. `npm run package` builds minified assets. `npm run check` runs lint, typecheck, tests, and the extension build.

Native bridge:

```bash
cargo test --manifest-path native/nullsec-bridge/Cargo.toml
cargo build --release --manifest-path native/nullsec-bridge/Cargo.toml
```

See `native/README.md` for native-messaging host installation.

Load `dist/` temporarily:

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on**.
3. Select `dist/manifest.json`.

For the sidebar, use the NullSec toolbar button, `Alt+Shift+N`, or the context menu. The request dock opens with `Alt+Shift+D`.

## Repository layout

```text
extension/
  manifest.json        Manifest V3 extension manifest
  icons/               Source SVGs and generated PNGs
  static/              Sidebar, dock, options, privacy, DevTools HTML
  src/
    background/        Request capture, scope guard, repeater, rate limit
    content/           Explicit page-context and flag scans
    sidebar/           Notes, AI chat/tools, scope, flags, reports
    dock/              History, repeater, fuzzer, decoder
    options/           Provider, agent, patterns, bridge, local data
    privacy/           Data-handling disclosure
    devtools/          DevTools page and panel
    lib/               Core types, storage, DB, scope, redaction, reports
    ui/                Preact shell, components, design tokens
prompts/               AI mode prompts
report-templates/      CTF, pentest, and team submission templates
tests/                 Vitest unit tests
scripts/               Extension build and icon generation
providers.json         Provider endpoint registry
native/
  nullsec-bridge/      Rust native-messaging bridge (M0b skeleton)
  hosts/               Linux and Windows host manifests
docs/                  Architecture and security notes
```

## Security model

- **Local-first.** No NullSec account service, telemetry, or prompt proxy.
- **Scope guard.** Active requests fail closed unless the target matches a workspace scope rule. Redirects are re-checked against scope before following.
- **Rate limit.** The background worker enforces a per-workspace requests-per-minute limit.
- **Session-only keys.** Provider API keys live in the sidebar's `sessionStorage`, not extension storage, IndexedDB, logs, or reports.
- **Data consent.** `authenticationInfo`, `browsingActivity`, and `websiteContent` are optional Firefox data permissions. Firefox prompts before the first provider test or prompt.
- **Opt-in active AI tools.** The assistant is read-only by default. In a CTF workspace you can enable scoped tab control, navigation, DOM actions, HTTP requests, cookies, storage, and page JavaScript. Cookie/storage/JavaScript access is a separate sensitive-data toggle. Active calls require confirmation unless auto-approve is enabled.
- **Scope guardrails.** Active tab, navigation, cookie, storage, and HTTP tools reject targets outside the workspace scope. Page JavaScript and DevTools eval can bypass scope and are therefore behind the sensitive-data toggle.
- **Redaction.** Reports and page-context previews redact known authorization, cookie, API-key, JWT, and private-key patterns.
- **Excluded traffic.** AI provider hosts and extension pages are excluded from request capture. Normal browser request/response bodies are not captured.
- **Sanitized Markdown.** Report previews pass through DOMPurify.

Redaction is a safety net, not a guarantee. Review every export.

`web-ext lint` reports zero errors. Expected warnings are Preact's internal `innerHTML` assignment and the opt-in page-JavaScript tool's `Function` constructor.

## Roadmap

1. **M0a:** extension scaffold, local tools, build and tests. Done.
2. **M0b:** native bridge skeleton and install docs. Done.
3. **M1:** AI provider calls, page-context pipeline, evidence citations. Done.
4. **M2:** first browser source build and visual approval gate. Next (needs a Linux build host).
5. **M3–M9:** rebrand, privacy defaults, workspaces, interception adapters, request dock integration, notes/reports, streaming AI.
6. **M10:** packaging, AMO unlisted XPI, signed update manifest, release CI.

## License

Mozilla Public License 2.0. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Only test systems for which you have explicit authorization. NullSec is intended for CTFs, labs, and authorized engagements.
