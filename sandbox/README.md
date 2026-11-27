# NullSec sandbox

Cloud execution for the NullSec agent, built on [E2B](https://e2b.dev) with a Kali
Linux template and a small local bridge that the browser sidebar talks to.

```
sidebar (Firefox chrome) ──HTTP──▶ bridge (127.0.0.1:8787) ──E2B SDK──▶ Kali sandbox
```

## 1. Prerequisites

- Node.js 22+
- An E2B account and API key (`https://e2b.dev/dashboard`)
- A model API key for the sidebar (Token Harbor / OpenRouter free tiers work)

## 2. Build the template

The template is a Kali Rolling image with web/net, pwn, rev, crypto, and
forensics tooling. E2B builds it remotely; no local Docker is required.

```powershell
npm install -g @e2b/cli
e2b auth login            # or set E2B_API_KEY in the environment

e2b template create nullsec-kali `
  -p sandbox/e2b `
  --cpu-count 4 `
  --memory-mb 4096
```

The build takes roughly 10-15 minutes. Validate a sandbox with:

```powershell
node sandbox/bridge/smoke.mjs
```

Expected: Kali Rolling as root, nmap, pwntools, rizin/radare2, gdb, z3,
pycryptodome, sympy, gmpy2, RsaCtfTool, binwalk, volatility3, tshark, etc.
(`angr` is optional and may be skipped.)

## 3. Configure and start the bridge

Create `sandbox/bridge/.env` (gitignored):

```dotenv
E2B_API_KEY=e2b_...
NULLSEC_SANDBOX_TEMPLATE=nullsec-kali
NULLSEC_BRIDGE_PORT=8787
```

Start it:

```powershell
cd sandbox/bridge
.\start-bridge.cmd
```

`start-bridge.cmd` restarts the Node server if it exits. Health check:

```powershell
curl http://127.0.0.1:8787/health
```

Sandboxes run as **root**. E2B defaults to the image's uid-1000 `user`, which
cannot exec `/bin/sh` in this image; the bridge passes `user: "root"`.

## 4. Bridge API

All routes are `POST` JSON on `127.0.0.1:8787` (CORS-enabled). `name` selects a
logical sandbox (one per challenge); expired sandboxes are recreated on demand.

| Route | Body | Result |
| --- | --- | --- |
| `/health` | – (GET) | template + sandbox names |
| `/sbx/create` | `{name}` | sandbox id/info |
| `/sbx/extend` | `{name, timeoutMs}` | extend lifetime |
| `/sbx/kill` | `{name}` | kill sandbox |
| `/exec` | `{name, cmd, cwd?, timeoutMs?, background?}` | exit code, stdout, stderr |
| `/session/start` | `{name, session, cmd, cwd?}` | tmux session |
| `/session/send` | `{name, session, text?, keys?, enter?}` | send input |
| `/session/capture` | `{name, session, history?}` | pane snapshot |
| `/session/list` / `/session/kill` | `{name, session?}` | list/kill |
| `/file/read` | `{name, path, offset?, length?}` | text |
| `/file/write` | `{name, path, data}` | write |
| `/file/upload` | `{name, path, base64}` | upload |
| `/file/download` | `{name, path}` | base64 |
| `/file/list` | `{name, path?}` | entries |

`/exec` slides the sandbox timeout on every call (default 1 hour).

## 5. Sidebar actions

The agent uses the same names as the bridge-facing actions:

```json
{"type":"shell","cmd":"nmap -sV -p- 10.0.0.5","timeout":600}
{"type":"session","op":"start","session":"main","cmd":"nc 10.0.0.5 1337"}
{"type":"session","op":"send","session":"main","text":"hello"}
{"type":"session","op":"capture","session":"main"}
{"type":"files","op":"write","path":"/root/exp.py","data":"print(1)"}
{"type":"files","op":"read","path":"/root/out.txt"}
```

Prefs: `browser.nullsec.ai.bridge` (default `http://127.0.0.1:8787`) and
`browser.nullsec.ai.sandboxName` (default `default`).

## 6. Running a local challenge inside E2B

The sandbox cannot reach your machine's `127.0.0.1`. To benchmark a local app,
upload and start it **inside** the sandbox:

```json
{"type":"files","op":"upload","path":"/root/ctf.py","base64":"..."}
{"type":"shell","cmd":"nohup python3 /root/ctf.py > /root/ctf.log 2>&1 & sleep 2; curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8099/"}
```

Then point the agent at `http://127.0.0.1:<port>` and instruct it to use the
`shell` action (curl/python) rather than the browser.

## Licenses

The sandbox runs E2B cloud execution on Kali Linux; each installed tool retains
its own license. See [`e2b/THIRD_PARTY_NOTICES.md`](e2b/THIRD_PARTY_NOTICES.md).
