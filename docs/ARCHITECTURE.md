# NullSec architecture

## Baseline

NullSec is built from **Mullvad Browser 16.0.2** / **Firefox ESR 153.7.0**. The
Mullvad privacy baseline stays in place:

- Resist Fingerprinting, first-party isolation, third-party cookie blocking, partitioned storage.
- Private browsing autostart, service workers disabled, disk cache disabled.
- `security.nocertdb=true`.

NullSec changes are applied as source patches at build time
(`browser/patches/`), primarily `0010-nullsec-native-sidebar.patch`.

## Components

```text
Browser (Mullvad/Firefox)
  └─ NullSec native sidebar (chrome://browser/content/nullsec/)
       ├─ sidebar.mjs      agent loop, providers, tools, UI
       ├─ sidebar.html/css layout, overlays, terminal/tool-chip styles
       ├─ NullSecModels    provider + model catalog, live discovery
       ├─ NullSecStore     traffic observer, flags, reports
       └─ Skills*          5,125 offline security skills
  └─ Actors
       ├─ NullSecChild     page read/click/type/scroll in content process
       └─ NullSecParent    actor registration
Browser ──HTTP──▶ sandbox bridge (sandbox/bridge, 127.0.0.1:8787)
                     └─ E2B SDK ──▶ Kali sandbox (nullsec-kali template)
```

## Agent flow

1. The sidebar reads provider/model/key config and builds the system prompt
   (methodology + action protocol + session state + sandbox toolchain).
2. The agent emits a single JSON action per turn (or DSML tool markup).
3. `executeAction` dispatches:
   - browser actions (`read`, `navigate`, `click`, `type`, `scroll`, `request`, `cookies`, ...)
   - sandbox actions (`shell`, `session`, `files`) via the bridge
   - local utilities (`decode`, `encode`, `hash`, `jwt`, `note`, `flag`, `finding`)
4. Results are recorded as observations; flags are captured mechanically from
   tool output, and the planner/reflector drives the next step.
5. The UI renders each call as a **tool chip** and, for shell/session, an
   ANSI **terminal panel**, auto-expanded for terminal actions.

Budget controls: `browser.nullsec.ai.stepsPerCycle`, `maxCycles`,
`maxTokens`. When the objective asks for "ALL flags", the loop is nudged to keep
hunting instead of stopping at the first flag.

## Sandbox

- **Template:** `sandbox/e2b/` (Kali Rolling). Web/net, pwn, rev, crypto, and
  forensics tools. Built remotely with the E2B CLI.
- **Bridge:** `sandbox/bridge/server.mjs`, bound to `127.0.0.1:8787`.
  - `/exec` (root, timeout, background)
  - `/session/*` (persistent tmux: start/send/capture/list/kill)
  - `/file/*` (read/write/list/upload/download)
  - `/sbx/*` (create/extend/kill)
  - auto-recreates expired sandboxes; loads `.env`; auto-restarts via `start-bridge.cmd`.
- **Local targets:** the sandbox cannot reach the host's `127.0.0.1`. Run the
  target inside the sandbox (localhost works there) and have the agent use the
  `shell` action (curl/python) instead of the browser.

## Security model

- **Local-first control plane.** No NullSec account service or telemetry; the
  bridge binds to loopback only.
- **Keys.** Provider keys are encrypted in browser storage; the bridge `.env`
  is gitignored. Never commit secrets.
- **Cloud execution is explicit.** Agent commands and files are processed by
  E2B. Keep unrelated secrets out of the sandbox.
- **Guardrails.** Destructive HTTP verbs require confirmation; page content is
  untrusted; flags must appear in observed output; strict flag regex; no
  automatic submission.
- **Scope.** The browser agent acts on the user-selected tab; the sandbox is
  authorized for the CTF engagement only.

## Storage

- `browser.nullsec.ai.*` prefs: provider/model config, autopilot, effort,
  bridge URL, sandbox name, history, catalog caches.
- In-memory `state.session`: objectives, plan, notes, steps, findings,
  observations, reflections, summary.
- `NullSecStore`: observed traffic, recorded flags, reports.