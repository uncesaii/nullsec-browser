use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::fs;
use std::io::{self, Read, Write};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const PROTOCOL_VERSION: u32 = 1;
const MAX_MESSAGE_BYTES: u32 = 10 * 1024 * 1024;

#[derive(Debug, Serialize, Deserialize)]
struct Registry {
    version: u32,
    workspaces: Vec<WorkspaceRecord>,
}

impl Default for Registry {
    fn default() -> Self {
        Self {
            version: 1,
            workspaces: Vec::new(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct WorkspaceRecord {
    id: String,
    name: String,
    #[serde(rename = "createdAt")]
    created_at: u64,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("nullsec-bridge: {error}");
        std::process::exit(1);
    }
}

fn run() -> io::Result<()> {
    let stdin = io::stdin();
    let mut input = stdin.lock();
    loop {
        let mut length_bytes = [0u8; 4];
        match input.read_exact(&mut length_bytes) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => break,
            Err(error) => return Err(error),
        }
        let length = u32::from_ne_bytes(length_bytes);
        if length == 0 || length > MAX_MESSAGE_BYTES {
            write_response(&error_response("Invalid message length"))?;
            break;
        }
        let mut payload = vec![0u8; length as usize];
        input.read_exact(&mut payload)?;
        let response = match serde_json::from_slice::<Value>(&payload) {
            Ok(request) => dispatch(request),
            Err(_) => error_response("Request is not valid JSON"),
        };
        write_response(&response)?;
    }
    Ok(())
}

fn write_response(response: &Value) -> io::Result<()> {
    let bytes = serde_json::to_vec(response).map_err(io::Error::other)?;
    let stdout = io::stdout();
    let mut output = stdout.lock();
    output.write_all(&(bytes.len() as u32).to_ne_bytes())?;
    output.write_all(&bytes)?;
    output.flush()
}

fn error_response(message: &str) -> Value {
    json!({ "ok": false, "error": message })
}

fn dispatch(request: Value) -> Value {
    let Some(object) = request.as_object() else {
        return error_response("Request must be a JSON object");
    };
    let command = object
        .get("command")
        .and_then(Value::as_str)
        .unwrap_or_default();

    match command {
        "ping" => json!({
            "ok": true,
            "data": {
                "version": env!("CARGO_PKG_VERSION"),
                "protocol": PROTOCOL_VERSION,
                "platform": std::env::consts::OS,
                "arch": std::env::consts::ARCH
            }
        }),
        "workspace.list" => match read_registry() {
            Ok(registry) => json!({ "ok": true, "data": { "workspaces": registry.workspaces } }),
            Err(error) => error_response(&error),
        },
        "workspace.create" => {
            let name = object
                .get("name")
                .and_then(Value::as_str)
                .map(str::trim)
                .unwrap_or_default();
            if name.is_empty() {
                return error_response("Workspace name is required");
            }
            if name.chars().count() > 64 {
                return error_response("Workspace name is limited to 64 characters");
            }
            if name.chars().any(char::is_control) {
                return error_response("Workspace name contains control characters");
            }
            let mut registry = match read_registry() {
                Ok(registry) => registry,
                Err(error) => return error_response(&error),
            };
            if registry
                .workspaces
                .iter()
                .any(|workspace| workspace.name.eq_ignore_ascii_case(name))
            {
                return error_response("A workspace with that name already exists");
            }
            let record = WorkspaceRecord {
                id: format!("ws_{:x}_{}", now_nanos(), std::process::id()),
                name: name.to_string(),
                created_at: now_millis(),
            };
            registry.workspaces.push(record);
            if let Err(error) = write_registry(&registry) {
                return error_response(&error);
            }
            json!({ "ok": true, "data": { "workspaces": registry.workspaces } })
        }
        "workspace.delete" => {
            let id = object.get("id").and_then(Value::as_str).unwrap_or_default();
            if id.is_empty() {
                return error_response("Workspace id is required");
            }
            let mut registry = match read_registry() {
                Ok(registry) => registry,
                Err(error) => return error_response(&error),
            };
            let before = registry.workspaces.len();
            registry.workspaces.retain(|workspace| workspace.id != id);
            if registry.workspaces.len() == before {
                return error_response("Workspace not found");
            }
            if let Err(error) = write_registry(&registry) {
                return error_response(&error);
            }
            json!({ "ok": true, "data": { "deleted": id } })
        }
        "workspace.launch" => error_response(
            "Not implemented: profile launch requires the packaged browser integration",
        ),
        "cert.status" => {
            let installed = ca_path().is_file();
            json!({ "ok": true, "data": { "installed": installed } })
        }
        "cert.import" => {
            error_response("Not implemented: CA import is disabled until profile trust is packaged")
        }
        "secret.set" | "secret.get" | "secret.delete" => {
            error_response("Not implemented: OS keychain integration is not built yet")
        }
        "update.check" => {
            error_response("Not implemented: signed update manifest support is not built yet")
        }
        "" => error_response("Missing command"),
        _ => error_response("Unknown command"),
    }
}

fn data_dir() -> PathBuf {
    if let Some(value) = std::env::var_os("NULLSEC_DATA_DIR") {
        return PathBuf::from(value);
    }
    #[cfg(target_os = "windows")]
    {
        if let Some(value) = std::env::var_os("LOCALAPPDATA") {
            return PathBuf::from(value).join("NullSec");
        }
        std::env::temp_dir().join("NullSec")
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Some(value) = std::env::var_os("XDG_DATA_HOME") {
            return PathBuf::from(value).join("nullsec");
        }
        if let Some(home) = std::env::var_os("HOME") {
            return PathBuf::from(home).join(".local/share/nullsec");
        }
        std::env::temp_dir().join("nullsec")
    }
}

fn registry_path() -> PathBuf {
    data_dir().join("workspaces.json")
}

fn ca_path() -> PathBuf {
    data_dir().join("ca.pem")
}

fn ensure_data_dir() -> Result<PathBuf, String> {
    let directory = data_dir();
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Cannot create data directory: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&directory, fs::Permissions::from_mode(0o700));
    }
    Ok(directory)
}

fn read_registry() -> Result<Registry, String> {
    let path = registry_path();
    if !path.exists() {
        return Ok(Registry::default());
    }
    let bytes =
        fs::read(&path).map_err(|error| format!("Cannot read workspace registry: {error}"))?;
    let registry: Registry =
        serde_json::from_slice(&bytes).map_err(|_| "Workspace registry is corrupt".to_string())?;
    if registry.version != 1 {
        return Err("Workspace registry version is not supported".to_string());
    }
    Ok(registry)
}

fn write_registry(registry: &Registry) -> Result<(), String> {
    ensure_data_dir()?;
    let path = registry_path();
    let temp = path.with_extension(format!("tmp.{}", std::process::id()));
    let bytes = serde_json::to_vec_pretty(registry)
        .map_err(|error| format!("Cannot serialize workspace registry: {error}"))?;
    fs::write(&temp, bytes).map_err(|error| format!("Cannot write workspace registry: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&temp, fs::Permissions::from_mode(0o600));
    }
    if path.exists() {
        let _ = fs::remove_file(&path);
    }
    fs::rename(&temp, &path)
        .map_err(|error| format!("Cannot replace workspace registry: {error}"))?;
    Ok(())
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

fn now_nanos() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ping_returns_protocol_metadata() {
        let response = dispatch(json!({ "command": "ping" }));
        assert_eq!(response["ok"], true);
        assert_eq!(response["data"]["protocol"], PROTOCOL_VERSION);
    }

    #[test]
    fn unknown_command_is_rejected() {
        let response = dispatch(json!({ "command": "no.such.command" }));
        assert_eq!(response["ok"], false);
    }

    #[test]
    fn empty_workspace_name_is_rejected() {
        let response = dispatch(json!({ "command": "workspace.create", "name": "  " }));
        assert_eq!(response["ok"], false);
    }

    #[test]
    fn non_object_request_is_rejected() {
        let response = dispatch(json!(["ping"]));
        assert_eq!(response["ok"], false);
    }
}
