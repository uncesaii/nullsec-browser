# NullSec native bridge

The native bridge is an optional helper for capabilities the extension cannot provide:

- Per-workspace browser profiles.
- Per-profile proxy CA import.
- OS-keychain secret storage.
- Signed update checks.

This repository contains the **M0b skeleton**. It implements the native-messaging framing, `ping`, a local workspace metadata registry, and safe stubs for CA, keychain, profile launch, and update commands. It does not install a CA, launch a browser, or store secrets yet.

## Build

```bash
cargo build --release --manifest-path native/nullsec-bridge/Cargo.toml
cargo test --manifest-path native/nullsec-bridge/Cargo.toml
```

Artifact: `native/nullsec-bridge/target/release/nullsec-bridge` (`nullsec-bridge.exe` on Windows).

## Protocol

Native messaging uses a 4-byte native-endian length prefix followed by UTF-8 JSON. Requests are one JSON object per message. Responses are one JSON object:

```json
{ "ok": true, "data": { "version": "0.1.0", "protocol": 1 } }
```

```json
{ "ok": false, "error": "Not implemented" }
```

Current commands:

| Command | Status |
| --- | --- |
| `ping` | Implemented |
| `workspace.list` | Implemented, metadata only |
| `workspace.create` | Implemented, metadata only |
| `workspace.delete` | Implemented, metadata only |
| `workspace.launch` | Stub |
| `cert.status` | Implemented, reports whether `ca.pem` exists |
| `cert.import` | Stub |
| `secret.set`, `secret.get`, `secret.delete` | Stub |
| `update.check` | Stub |

The bridge never accepts arbitrary filesystem paths or shell commands from the extension. Workspace names are validated; data lives in a fixed per-user directory:

- Windows: `%LOCALAPPDATA%\NullSec`
- Linux: `$XDG_DATA_HOME/nullsec` or `~/.local/share/nullsec`

Set `NULLSEC_DATA_DIR` for isolated development or tests.

## Install a native messaging host

### Linux

```bash
install -d /usr/local/lib/nullsec
install -m 0755 native/nullsec-bridge/target/release/nullsec-bridge /usr/local/lib/nullsec/
install -d "$HOME/.mozilla/native-messaging-hosts"
install -m 0644 native/hosts/linux/nullsec_bridge.json "$HOME/.mozilla/native-messaging-hosts/nullsec_bridge.json"
```

### Windows

1. Build `nullsec-bridge.exe` and copy it to `C:\Program Files\NullSec\`.
2. Copy `native/hosts/windows/nullsec_bridge.json` to a stable local path.
3. Register the manifest for the current user:

```powershell
$manifest = "C:\Program Files\NullSec\nullsec_bridge.json"
$key = "HKCU:\Software\Mozilla\NativeMessagingHosts\nullsec_bridge"
New-Item -Path $key -Force | Out-Null
Set-Item -Path $key -Value $manifest
```

The extension ID must remain `nullsec@nullsec.dev`, or update `allowed_extensions` in the host manifest.

## Security invariants

- No shell execution and no arbitrary path input.
- Message size is capped at 10 MB.
- Data directory is created with user-only permissions on Unix.
- Registry writes use a temporary file and replace.
- Secret values must never be logged to stderr.
- CA import and profile launch remain disabled until their trust and lifecycle semantics are implemented and tested.
