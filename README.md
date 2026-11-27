# NullSec

NullSec is a CTF-focused, privacy-first browser forked from **Mullvad Browser 16.0.2** (Firefox ESR 153.7.0). It keeps the Mullvad privacy baseline and adds a native AI agent sidebar with a **cloud Kali sandbox** for real security tooling.

> NullSec is an independent project. It is not affiliated with or endorsed by Mullvad, Mozilla, E2B, or any AI provider.

## Status

The browser fork is built and branded. The native sidebar ships a full agent loop:

- **Real providers with BYOK** — Token Harbor, OpenRouter, Anthropic, OpenAI, Google, Mistral, Groq, xAI, DeepSeek, Together, 302.AI, Muse, and OpenAI-compatible endpoints. Live model discovery via `/v1/models`; keys stored encrypted, never in the repo.
- **Agentic CTF loop** — plan (PTT), per-cycle reflection/pivot, context compaction, grounded next-step hints, anti-loop escalation, "find ALL flags" continuation, mechanical flag capture, and evidence-checked flags.
- **Cloud Kali sandbox** — an E2B template (`nullsec-kali`) with web/net, pwn, rev, crypto, and forensics tooling: nmap, ffuf, nuclei, sqlmap, hydra, pwntools, gdb, rizin, z3, RsaCtfTool, binwalk, volatility3, tshark, and more.
- **Terminal tools in chat** — `shell`, `session` (persistent tmux), and `files` actions drive the sandbox. Commands and output render as inline tool chips and ANSI terminal panels, with auto-expanding output for shell/session.
- **Browser tools** — read, navigate, click, type, scroll, raw HTTP requests, cookies (incl. HttpOnly), plus codec/hash/JWT/note/finding/flag actions.
- **Offline knowledge base** — 5,125 security skills (HackSkills, MITRE ATT&CK, OWASP, ISECOM, standards, HF CTF/pentest datasets) with keyword retrieval.
- **Campaign-ready** — per-challenge workspaces, configurable flag regex, plan/notes/observations, reports.

Benchmarked on a hard 3-stage web target (AcuBank) running inside the sandbox: **3/3 flags** with `deepseek-v4.1-flash:free` over Token Harbor — the agent read `/config.bak`, forged an HS256 admin JWT with Python, exploited SSRF, and chained a second-order IDOR.

## Requirements

- Windows 10/11 (or Linux/macOS for building).
- Node.js 22+ (for the E2B bridge/CLI).
- An [E2B](https://e2b.dev) account and API key for cloud execution.
- A model API key (free tiers work; Token Harbor and OpenRouter are supported).
- ~50-100 GB free disk and several hours for a full browser build (CI is used).

## Browser build

The browser source lives in the Mullvad/Firefox tree and is patched at build time by `browser/patches/`.

```powershell
gh workflow run build-nullsec-browser.yml --repo uncesaii/nullsec-browser --ref main `
  -f source_ref=mullvad-browser-153.7.0esr-16.0-1 -f target=windows64
```

The primary patch is `browser/patches/0010-nullsec-native-sidebar.patch` (sidebar UI, agent loop, providers, knowledge base, sandbox tools).

## Cloud sandbox setup

See [`sandbox/README.md`](sandbox/README.md) for the full guide. In short:

```powershell
npm install -g @e2b/cli
e2b template create nullsec-kali -p sandbox/e2b --cpu-count 4 --memory-mb 4096
cd sandbox/bridge
# create .env with E2B_API_KEY=...
start-bridge.cmd        # auto-restarting local bridge on 127.0.0.1:8787
```

The sidebar talks to the bridge (`browser.nullsec.ai.bridge`), which creates one E2B sandbox per challenge and exposes:

| Endpoint | Purpose |
| --- | --- |
| `/exec` | Run a command (root) with timeout/background |
| `/session/*` | Persistent tmux sessions (start/send/capture/list/kill) |
| `/file/*` | Read/write/list/upload/download artifacts |
| `/sbx/*` | Create/extend/kill sandboxes |

Sandboxes run as root (the Kali image's uid-1000 account cannot exec `/bin/sh` under E2B). The bridge auto-recreates expired sandboxes.

## Running a CTF

1. Start the bridge (`sandbox/bridge/start-bridge.cmd`).
2. Connect a provider in the sidebar and pick a model.
3. Enable **Autopilot**.
4. For local labs, run the target **inside** the E2B sandbox (localhost is reachable there), or use a public target; the agent reaches HTTP targets with `shell`/curl.
5. Send the objective and watch the tool chips and terminals.

## Repository layout

```text
browser/
  patches/                 Source patches (0010 = NullSec sidebar/agent)
sandbox/
  e2b/                     Kali E2B template (Dockerfile, setup.sh, attribution)
  bridge/                  Local Node bridge (E2B SDK), .env, start-bridge.cmd
extension/                 Legacy extension/docs artifacts
native/                    Native-messaging bridge skeleton
docs/                      Architecture and security notes
```

## Security and privacy

- **Local-first control plane.** The bridge binds to `127.0.0.1`; no NullSec account service or telemetry.
- **Keys stay encrypted** in browser storage; the bridge `.env` is gitignored. Never commit API keys.
- **Cloud execution is explicit.** The agent's commands/files are processed by E2B; keep secrets out of the sandbox.
- **Scope and guardrails.** Destructive HTTP verbs require confirmation; page content is treated as untrusted; flags must appear in observed output.
- **Strict flag capture.** Flags are recorded only from tool results/pages, with a configurable regex; nothing is auto-submitted.

## Roadmap

1. **M0-M1:** extension scaffold, native bridge, AI loop. Done.
2. **M2:** native browser build + rebranding + RFP unlock. Done.
3. **M3:** E2B Kali sandbox, bridge, terminal tools, terminal/tool UI. Done.
4. **M4:** live streaming terminal output, expand-to-fullscreen, subagent verifier.
5. **M5:** campaign queue (multi-challenge), scoreboard/flag submission, cross-category eval suite.
6. **M6:** packaging, signed XPI/updates, release CI.

## Licenses

The sandbox runs E2B cloud execution on Kali Linux; each component and security tool retains its own license. See `sandbox/e2b/THIRD_PARTY_NOTICES.md`.